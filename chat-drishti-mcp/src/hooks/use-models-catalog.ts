"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogModel } from "~/lib/openrouter-models-core";
import { MODELS_CACHE_TTL_MS } from "~/lib/openrouter-models-core";
import type { ModelProviderId } from "~/types";

const STORAGE_KEY = "drishti-models-catalog";

type CachedCatalog = {
	models: CatalogModel[];
	cachedAt: number;
};

function readLocalCache(): CachedCatalog | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedCatalog;
		if (!Array.isArray(parsed.models) || typeof parsed.cachedAt !== "number") {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function writeLocalCache(catalog: CachedCatalog) {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
	} catch {
		// Ignore quota errors.
	}
}

async function fetchOllamaModels(baseUrl?: string): Promise<CatalogModel[]> {
	const root = (baseUrl ?? "http://localhost:11434").replace(/\/v1\/?$/, "");
	const response = await fetch(`${root}/api/tags`, { method: "GET" });
	if (!response.ok) {
		throw new Error(`Ollama models request failed (${response.status})`);
	}

	const payload = (await response.json()) as {
		models?: { name: string }[];
	};

	return (payload.models ?? []).map((model) => ({
		id: model.name,
		name: model.name,
		contextLength: 0,
		vendor: "ollama",
		vendorLabel: "Ollama",
		pricing: { promptPerMillion: 0, completionPerMillion: 0 },
		capabilities: {
			reasoning: false,
			vision: false,
			tools: false,
			fast: true,
		},
	}));
}

export function useModelsCatalog(options?: {
	provider?: ModelProviderId;
	ollamaBaseUrl?: string;
}) {
	const provider = options?.provider;
	const ollamaBaseUrl = options?.ollamaBaseUrl;

	const [models, setModels] = useState<CatalogModel[]>(() => {
		return readLocalCache()?.models ?? [];
	});
	const [loading, setLoading] = useState(models.length === 0);
	const [error, setError] = useState<string | null>(null);
	const [ollamaModels, setOllamaModels] = useState<CatalogModel[]>([]);
	const [ollamaLoading, setOllamaLoading] = useState(false);
	const [ollamaError, setOllamaError] = useState<string | null>(null);

	const refreshOpenRouter = useCallback(async (force = false) => {
		const cached = readLocalCache();
		const isFresh =
			cached && Date.now() - cached.cachedAt < MODELS_CACHE_TTL_MS;

		if (!force && isFresh) {
			setModels(cached.models);
			setLoading(false);
			return cached.models;
		}

		setLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/models");
			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(data?.error ?? "Failed to load models");
			}

			const data = (await response.json()) as {
				models: CatalogModel[];
				cachedAt: number;
			};

			const catalog = {
				models: data.models,
				cachedAt: data.cachedAt ?? Date.now(),
			};
			writeLocalCache(catalog);
			setModels(data.models);
			return data.models;
		} catch (e) {
			const message = e instanceof Error ? e.message : "Failed to load models";
			setError(message);
			if (cached) {
				setModels(cached.models);
				return cached.models;
			}
			return [];
		} finally {
			setLoading(false);
		}
	}, []);

	const refreshOllama = useCallback(async () => {
		setOllamaLoading(true);
		setOllamaError(null);
		try {
			const next = await fetchOllamaModels(ollamaBaseUrl);
			setOllamaModels(next);
			return next;
		} catch (e) {
			const message =
				e instanceof Error ? e.message : "Failed to load Ollama models";
			setOllamaError(message);
			setOllamaModels([]);
			return [];
		} finally {
			setOllamaLoading(false);
		}
	}, [ollamaBaseUrl]);

	useEffect(() => {
		void refreshOpenRouter();
	}, [refreshOpenRouter]);

	useEffect(() => {
		if (provider !== "ollama") return;
		void refreshOllama();
	}, [provider, refreshOllama]);

	const catalog = useMemo(() => {
		return provider === "ollama" ? ollamaModels : models;
	}, [provider, models, ollamaModels]);

	return {
		models: catalog,
		openRouterModels: models,
		ollamaModels,
		loading: provider === "ollama" ? ollamaLoading && catalog.length === 0 : loading,
		error: provider === "ollama" ? ollamaError : error,
		refresh: provider === "ollama" ? refreshOllama : () => refreshOpenRouter(true),
	};
}
