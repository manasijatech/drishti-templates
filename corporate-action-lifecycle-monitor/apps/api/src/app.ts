import type { ApiError } from "@lifecycle/contracts";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

import {
	type LifecycleService,
	ServiceUnavailableError,
	UnknownSymbolError,
} from "./lifecycle-service";
import { openApiDocument } from "./openapi";

const symbolBody = z.object({ symbol: z.string().min(1).max(24) });

export function createApp(service: LifecycleService) {
	const app = new Hono();
	app.use(logger());
	app.use(
		"/api/*",
		cors({
			origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
			allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		}),
	);
	app.use("/ws/lifecycles", async (context, next) => {
		const origin = context.req.header("Origin");
		const allowedOrigin =
			process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
		if (origin && origin !== allowedOrigin) {
			return context.json<ApiError>({ error: "Origin not allowed." }, 403);
		}
		await next();
	});
	app.get(
		"/ws/lifecycles",
		upgradeWebSocket(() => {
			let unsubscribe: (() => void) | undefined;
			return {
				onOpen: async (_event, socket) => {
					unsubscribe = service.subscribe((message) => {
						if (socket.readyState === 1) socket.send(JSON.stringify(message));
					});
					try {
						socket.send(
							JSON.stringify({
								type: "snapshot",
								...(await service.snapshot()),
							}),
						);
					} catch {
						socket.close(1011, "Snapshot unavailable");
					}
				},
				onClose: () => unsubscribe?.(),
				onError: () => unsubscribe?.(),
			};
		}),
	);

	app.get("/health", (context) =>
		context.json({ status: "ok", stream: service.streamStatus() }),
	);
	app.get("/api/symbols", async (context) =>
		context.json({ data: await service.listSymbols() }),
	);
	app.post("/api/symbols", async (context) => {
		const parsed = symbolBody.safeParse(
			await context.req.json().catch(() => null),
		);
		if (!parsed.success)
			return context.json<ApiError>({ error: "Enter a symbol." }, 400);
		try {
			const symbol = await service.addSymbol(parsed.data.symbol);
			return context.json({ data: symbol }, 201);
		} catch (error) {
			if (error instanceof UnknownSymbolError) {
				return context.json<ApiError>({ error: error.message }, 404);
			}
			if (error instanceof ServiceUnavailableError) {
				return context.json<ApiError>({ error: error.message }, 503);
			}
			return context.json<ApiError>(
				{ error: "Drishti request failed. Try again." },
				502,
			);
		}
	});
	app.delete("/api/symbols/:symbol", async (context) => {
		try {
			const removed = await service.removeSymbol(context.req.param("symbol"));
			return removed
				? context.body(null, 204)
				: context.json<ApiError>({ error: "Symbol not found." }, 404);
		} catch (error) {
			return context.json<ApiError>(
				{
					error:
						error instanceof Error ? error.message : "Unable to remove symbol.",
				},
				400,
			);
		}
	});
	app.post("/api/symbols/:symbol/sync", async (context) => {
		try {
			const data = await service.syncSymbol(context.req.param("symbol"));
			return context.json({ data });
		} catch (error) {
			const status =
				error instanceof ServiceUnavailableError
					? 503
					: error instanceof UnknownSymbolError
						? 404
						: 502;
			return context.json<ApiError>(
				{
					error:
						error instanceof ServiceUnavailableError
							? error.message
							: error instanceof UnknownSymbolError
								? error.message
								: "Sync failed.",
				},
				status,
			);
		}
	});
	app.get("/api/lifecycles", async (context) =>
		context.json(await service.listLifecycles()),
	);
	app.get("/api/lifecycles/:id", async (context) => {
		const lifecycle = await service.getLifecycle(context.req.param("id"));
		return lifecycle
			? context.json({ data: lifecycle })
			: context.json<ApiError>({ error: "Lifecycle not found." }, 404);
	});
	app.get("/api/announcements/:id/source", async (context) => {
		try {
			const response = await service.getSourceDocument(context.req.param("id"));
			return new Response(response.body, {
				status: response.status,
				headers: {
					"Content-Type":
						response.headers.get("Content-Type") ?? "application/pdf",
					"Cache-Control": "private, max-age=300",
				},
			});
		} catch (error) {
			const status = error instanceof ServiceUnavailableError ? 503 : 502;
			return context.json<ApiError>(
				{
					error:
						error instanceof ServiceUnavailableError
							? error.message
							: "Source unavailable.",
				},
				status,
			);
		}
	});
	app.get("/openapi.json", (context) => context.json(openApiDocument));
	app.get(
		"/docs",
		Scalar({
			url: "/openapi.json",
			pageTitle: "Drishti Corporate Action Lifecycle API",
		}),
	);

	app.notFound((context) =>
		context.json<ApiError>({ error: "Not found." }, 404),
	);
	return app;
}
