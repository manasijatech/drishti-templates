import { NextResponse } from "next/server";
import {
	MODELS_CACHE_TTL_MS,
	OPENROUTER_MODELS_URL,
	parseOpenRouterModelsResponse,
	type CatalogModel,
} from "~/lib/openrouter-models-core";

export const revalidate = 43_200;

let memoryCache: { models: CatalogModel[]; fetchedAt: number } | null = null;

async function fetchOpenRouterModels(): Promise<CatalogModel[]> {
	const now = Date.now();
	if (memoryCache && now - memoryCache.fetchedAt < MODELS_CACHE_TTL_MS) {
		return memoryCache.models;
	}

	const response = await fetch(OPENROUTER_MODELS_URL, {
		headers: { Accept: "application/json" },
		next: { revalidate: 43_200 },
	});

	if (!response.ok) {
		throw new Error(`OpenRouter models request failed (${response.status})`);
	}

	const payload: unknown = await response.json();
	const models = parseOpenRouterModelsResponse(payload);

	memoryCache = { models, fetchedAt: now };
	return models;
}

export async function GET() {
	try {
		const models = await fetchOpenRouterModels();
		return NextResponse.json({
			models,
			cachedAt: memoryCache?.fetchedAt ?? Date.now(),
			ttlMs: MODELS_CACHE_TTL_MS,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to load models catalog";
		return NextResponse.json({ error: message }, { status: 502 });
	}
}
