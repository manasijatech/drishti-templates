import { zValidator } from "@hono/zod-validator";
import {
  createIngestionSchema,
  listOrderWinsQuerySchema,
  toIngestionRunDto,
  toOrderWinDto,
} from "@order-win/contracts";
import { IngestionConflictError, OrderWinIngestionService } from "@order-win/core";
import { MongoOrderWinRepository } from "@order-win/database";
import { createDrishtiAnnouncementSource, DrishtiSourceError } from "@order-win/drishti";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type mongoose from "mongoose";
import { z } from "zod";
import type { AppConfig } from "./config";

type Dependencies = {
  readonly config: AppConfig;
  readonly mongooseConnection: mongoose.Connection;
};

function apiError(code: string, message: string) {
  return { error: { code, message } };
}

export function createApp(dependencies: Dependencies) {
  const { config } = dependencies;
  const repository = new MongoOrderWinRepository(dependencies.mongooseConnection);
  const source = createDrishtiAnnouncementSource({
    apiKey: config.DRISHTI_API_KEY,
    baseUrl: config.DRISHTI_BASE_URL,
    timeoutMs: config.DRISHTI_TIMEOUT_MS,
  });
  const ingestion = new OrderWinIngestionService(source, repository, {
    pageSize: config.INGESTION_PAGE_SIZE,
    maxPages: config.INGESTION_MAX_PAGES,
    lockDurationMs: 15 * 60 * 1_000,
  });

  const app = new Hono();
  let apiRateLimit = { count: 0, resetAt: 0 };

  app.get("/health/live", (context) => context.json({ data: { status: "ok" } }));
  app.get("/health/ready", async (context) => {
    const ready = dependencies.mongooseConnection.readyState === 1;
    return context.json({ data: { status: ready ? "ready" : "not_ready" } }, ready ? 200 : 503);
  });

  app.use("/api/v1/*", async (context, next) => {
    const now = Date.now();
    const windowMs = config.API_RATE_LIMIT_WINDOW_SECONDS * 1_000;
    if (apiRateLimit.resetAt <= now) apiRateLimit = { count: 0, resetAt: now + windowMs };
    apiRateLimit.count += 1;
    if (apiRateLimit.count > config.API_RATE_LIMIT_MAX) {
      context.header("Retry-After", String(Math.ceil((apiRateLimit.resetAt - now) / 1_000)));
      return context.json(apiError("RATE_LIMITED", "Too many API requests"), 429);
    }
    return await next();
  });

  app.get("/api/v1/order-wins", zValidator("query", listOrderWinsQuerySchema), async (context) => {
    const result = await repository.list(context.req.valid("query"));
    return context.json({
      data: result.items.map(toOrderWinDto),
      meta: { nextCursor: result.nextCursor },
    });
  });

  app.post(
    "/api/v1/order-win-ingestions",
    zValidator("json", createIngestionSchema),
    async (context) => {
      const body = context.req.valid("json");
      const to = body.to ? new Date(body.to) : new Date();
      const from = body.from
        ? new Date(body.from)
        : new Date(to.getTime() - config.INGESTION_LOOKBACK_MINUTES * 60_000);
      if (from > to) {
        return context.json(apiError("INVALID_WINDOW", "from must not be after to"), 422);
      }
      const run = await ingestion.ingest({
        from,
        to,
        trigger: "manual",
      });
      return context.json({ data: toIngestionRunDto(run) }, 201, {
        Location: `/api/v1/ingestion-runs/${run.id}`,
      });
    },
  );

  app.get(
    "/api/v1/ingestion-runs/:id",
    zValidator("param", z.object({ id: z.string().min(1) })),
    async (context) => {
      const run = await repository.findRun(context.req.valid("param").id);
      if (!run) return context.json(apiError("NOT_FOUND", "Ingestion run not found"), 404);
      return context.json({ data: toIngestionRunDto(run) });
    },
  );

  app.notFound((context) => context.json(apiError("NOT_FOUND", "Route not found"), 404));
  app.onError((error, context) => {
    if (error instanceof HTTPException) {
      return context.json(apiError("HTTP_ERROR", error.message), error.status);
    }
    if (error instanceof IngestionConflictError) {
      return context.json(apiError("INGESTION_CONFLICT", error.message), 409);
    }
    if (error instanceof DrishtiSourceError) {
      const status = error.statusCode === 429 ? 429 : 502;
      return context.json(apiError("DRISHTI_UNAVAILABLE", error.message), status);
    }
    console.error(error);
    return context.json(apiError("INTERNAL_ERROR", "An unexpected error occurred"), 500);
  });

  return app;
}
