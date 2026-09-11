import { websocket } from "hono/bun";

import { createApp } from "./app";
import { LifecycleService } from "./lifecycle-service";
import { createOpenRouterLifecycleValidator } from "./lifecycle-validator";
import { DrishtiMarketDataSource } from "./market-data";
import { MongoLifecycleRepository } from "./repository";

const apiKey = process.env.DRISHTI_API_KEY?.trim();
const repository = await MongoLifecycleRepository.connect(
	process.env.MONGODB_URI ?? "mongodb://localhost:27017/corporate_actions",
	positiveNumber(process.env.MONGODB_MAX_POOL_SIZE, 10),
);
const market = apiKey
	? new DrishtiMarketDataSource({
			apiKey,
		})
	: undefined;
const service = new LifecycleService(
	repository,
	market,
	createOpenRouterLifecycleValidator(process.env.OPENROUTER_API_KEY),
);
const app = createApp(service);

const server = Bun.serve({
	port: positiveNumber(process.env.PORT, 4000),
	hostname: process.env.HOST ?? "0.0.0.0",
	fetch: app.fetch,
	websocket,
});

console.log(`Lifecycle API listening on ${server.url}`);
if (!apiKey) console.warn("DRISHTI_API_KEY is not set; ingestion is disabled.");
void service.start().catch(() => {
	console.error("Initial Drishti synchronization failed.");
});

async function shutdown(): Promise<void> {
	await service.stop();
	repository.close();
	await server.stop();
	process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function positiveNumber(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
