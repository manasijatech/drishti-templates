import type { ModelProviderId } from "~/types";
import {
	findCatalogModel,
	toCatalogModelId,
	type CatalogModel,
} from "~/lib/openrouter-models-core";

export const CUSTOM_MODEL_ID = "__custom__";

export function isCustomModelSelection(
	provider: ModelProviderId,
	model: string,
	catalog?: CatalogModel[],
): boolean {
	const trimmed = model.trim();
	if (!trimmed) return true;

	if (provider === "ollama") {
		if (!catalog?.length) return false;
		return !catalog.some((m) => m.id === trimmed);
	}

	if (provider === "openrouter") {
		if (!trimmed.includes("/")) return true;
		if (!catalog?.length) return false;
		return !catalog.some((m) => m.id === trimmed);
	}

	if (!catalog?.length) return false;
	const catalogId = toCatalogModelId(provider, trimmed);
	return !catalog.some((m) => m.id === catalogId || m.id === trimmed);
}

export function isValidModelForProvider(
	provider: ModelProviderId,
	model: string,
	catalog?: CatalogModel[],
): boolean {
	const trimmed = model.trim();
	if (!trimmed) return false;
	if (provider === "ollama") return true;
	if (provider === "openrouter") {
		return trimmed.includes("/") || Boolean(findCatalogModel(catalog ?? [], provider, trimmed));
	}
	if (catalog?.length) {
		return Boolean(findCatalogModel(catalog, provider, trimmed));
	}
	return trimmed.length > 0;
}

export function resolveModelForProvider(
	provider: ModelProviderId,
	currentModel: string,
	savedModel?: string,
	catalog?: CatalogModel[],
): string {
	const candidates = [savedModel, currentModel].filter(Boolean) as string[];
	for (const candidate of candidates) {
		if (isValidModelForProvider(provider, candidate, catalog)) {
			return candidate;
		}
	}

	if (catalog?.length) {
		const first = catalog[0]?.id;
		if (first) {
			if (provider === "openrouter" || provider === "ollama") return first;
			const slash = first.indexOf("/");
			return slash >= 0 ? first.slice(slash + 1) : first;
		}
	}

	return provider === "openrouter"
		? "google/gemini-2.5-flash"
		: provider === "openai"
			? "gpt-4.1"
			: provider === "anthropic"
				? "claude-sonnet-4-20250514"
				: provider === "google"
					? "gemini-2.0-flash"
					: provider === "groq"
						? "llama-3.3-70b-versatile"
						: provider === "ollama"
							? "llama3.2"
							: "";
}

export function getModelSelectValue(
	provider: ModelProviderId,
	model: string,
	catalog?: CatalogModel[],
): string {
	if (isCustomModelSelection(provider, model, catalog)) {
		return CUSTOM_MODEL_ID;
	}
	return model;
}
