import { describe, expect, test } from "bun:test";
import { websocket } from "hono/bun";

import { createApp } from "../src/app";
import type { SourceAnnouncement } from "../src/domain";
import { LifecycleService } from "../src/lifecycle-service";
import type { MarketDataSource, SymbolIdentity } from "../src/market-data";
import { MemoryLifecycleRepository } from "./memory-repository";

class FakeMarketData implements MarketDataSource {
	readonly announcements: SourceAnnouncement[] = [
		{
			id: "tcs-rights-1",
			symbol: "TCS",
			companyName: "Tata Consultancy Services Ltd.",
			date: "2026-07-09T10:32:27.264Z",
			headline: "Board approves rights issue and record date",
			category: "Rights Issue",
			relatedCategories: ["Outcome of Board Meeting"],
			exchange: "NSE",
			extractedInformation: {
				rights_issue: {
					entitlement_ratio: "1:4",
					price: 120,
					record_date: "2026-07-15",
				},
			},
		},
	];

	async resolveSymbol(symbol: string): Promise<SymbolIdentity | undefined> {
		return symbol === "TCS"
			? { symbol: "TCS", companyName: "Tata Consultancy Services Ltd." }
			: undefined;
	}

	async listAnnouncements(): Promise<SourceAnnouncement[]> {
		return [...this.announcements, ...this.announcements];
	}

	async openStream(): Promise<{
		close(): Promise<void>;
		connected(): boolean;
		replaceSymbols(symbols: string[]): Promise<void>;
	}> {
		return {
			close: async () => undefined,
			connected: () => true,
			replaceSymbols: async () => undefined,
		};
	}

	async getSourceDocument(): Promise<Response> {
		return new Response("pdf", {
			headers: { "Content-Type": "application/pdf" },
		});
	}
}

describe("Hono lifecycle API", () => {
	test("adds a validated symbol, syncs once per announcement id, and removes it", async () => {
		const repository = new MemoryLifecycleRepository();
		const service = new LifecycleService(repository, new FakeMarketData());
		const app = createApp(service);

		const add = await app.request("/api/symbols", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ symbol: "tcs" }),
		});
		expect(add.status).toBe(201);

		const lifecycles = await app.request("/api/lifecycles");
		const payload = await lifecycles.json();
		expect(payload.data).toHaveLength(1);
		expect(payload.data[0].announcements).toHaveLength(1);
		expect(payload.data[0]).toMatchObject({
			symbol: "TCS",
			actionType: "Rights Issue",
			status: "Record Date",
		});

		const remove = await app.request("/api/symbols/TCS", { method: "DELETE" });
		expect(remove.status).toBe(204);
		expect(await repository.listLifecycles()).toEqual([]);
	});

	test("rejects unknown symbols and reports an unconfigured Drishti backend", async () => {
		const repository = new MemoryLifecycleRepository();
		const configured = createApp(
			new LifecycleService(repository, new FakeMarketData()),
		);
		const unknown = await configured.request("/api/symbols", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ symbol: "NOPE" }),
		});
		expect(unknown.status).toBe(404);

		const unconfigured = createApp(new LifecycleService(repository));
		const unavailable = await unconfigured.request("/api/symbols", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ symbol: "TCS" }),
		});
		expect(unavailable.status).toBe(503);
	});

	test("serves Scalar and the external OpenAPI contract", async () => {
		const app = createApp(
			new LifecycleService(new MemoryLifecycleRepository()),
		);
		const document = await app.request("/openapi.json");
		const spec = await document.json();
		expect(document.status).toBe(200);
		expect(spec.openapi).toBe("3.1.0");
		expect(spec.info.description).toContain("Track corporate actions");
		expect(spec.paths["/api/lifecycles"]).toBeDefined();
		expect(spec.paths["/api/lifecycles"].get.description).toContain(
			"watched symbols",
		);
		expect(
			spec.tags.every((tag: { description?: string }) => tag.description),
		).toBe(true);
		expect(JSON.stringify(spec)).not.toContain("matchConfidence");

		const docs = await app.request("/docs");
		expect(docs.status).toBe(200);
		expect(await docs.text()).toContain(
			"Drishti Corporate Action Lifecycle API",
		);
	});

	test("upgrades lifecycle sockets and sends an initial snapshot", async () => {
		const service = new LifecycleService(new MemoryLifecycleRepository());
		const app = createApp(service);
		const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
		try {
			const message = await new Promise<Record<string, unknown>>(
				(resolve, reject) => {
					const socket = new WebSocket(
						`ws://localhost:${server.port}/ws/lifecycles`,
					);
					const timeout = setTimeout(
						() => reject(new Error("Timed out waiting for snapshot")),
						2_000,
					);
					socket.onmessage = (event) => {
						clearTimeout(timeout);
						const payload = JSON.parse(String(event.data));
						socket.close();
						resolve(payload);
					};
					socket.onerror = () => reject(new Error("WebSocket failed"));
				},
			);

			expect(message).toMatchObject({
				type: "snapshot",
				data: [],
				symbols: [],
				stream: "not_configured",
			});
		} finally {
			await server.stop(true);
		}
	});
});
