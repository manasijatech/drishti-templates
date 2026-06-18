import {
	toCatalogModelId,
	type CatalogModel,
} from "~/lib/openrouter-models-core";
import type { ModelProviderId, QueryUsageMetadata } from "~/types";

export const EMPTY_QUERY_USAGE: QueryUsageMetadata = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	requests: 0,
};

export function addQueryUsage(
	a: QueryUsageMetadata,
	b: QueryUsageMetadata,
): QueryUsageMetadata {
	return {
		promptTokens: a.promptTokens + b.promptTokens,
		completionTokens: a.completionTokens + b.completionTokens,
		totalTokens: a.totalTokens + b.totalTokens,
		requests: a.requests + b.requests,
	};
}

export function estimateQueryCostUsd(
	usage: QueryUsageMetadata,
	provider: ModelProviderId,
	modelId: string,
	catalogModels: CatalogModel[],
): number | null {
	if (provider === "ollama") return 0;

	const catalogId = toCatalogModelId(provider, modelId);
	const model =
		catalogModels.find((entry) => entry.id === catalogId) ??
		catalogModels.find((entry) => entry.id === modelId);

	if (
		!model ||
		(model.pricing.promptPerMillion === 0 &&
			model.pricing.completionPerMillion === 0)
	) {
		return null;
	}

	return (
		(usage.promptTokens / 1_000_000) * model.pricing.promptPerMillion +
		(usage.completionTokens / 1_000_000) *
			model.pricing.completionPerMillion
	);
}

export function formatUsd(cost: number | null): string {
	if (cost === null) return "—";
	if (cost === 0) return "$0.00";
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	if (cost < 1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(2)}`;
}

export function formatTokenCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
	return count.toLocaleString("en-US");
}
