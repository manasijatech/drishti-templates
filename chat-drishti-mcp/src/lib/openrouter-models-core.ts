import type { ModelProviderId } from "~/types";

export type CatalogModel = {
	id: string;
	name: string;
	description?: string;
	contextLength: number;
	vendor: string;
	vendorLabel: string;
	pricing: {
		promptPerMillion: number;
		completionPerMillion: number;
	};
	capabilities: {
		reasoning: boolean;
		vision: boolean;
		tools: boolean;
		fast: boolean;
	};
};

export type ModelPreset = {
	id: string;
	label: string;
	description: string;
	candidates: string[];
	namePatterns: RegExp[];
};

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const MODELS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const PROVIDER_OPTIONS: Record<ModelProviderId, { label: string }> = {
	openai: { label: "OpenAI" },
	anthropic: { label: "Anthropic" },
	google: { label: "Google" },
	openrouter: { label: "OpenRouter" },
	groq: { label: "Groq" },
	ollama: { label: "Ollama (Local)" },
};

export const PROVIDER_VENDOR_PREFIX: Partial<Record<ModelProviderId, string>> = {
	openai: "openai",
	anthropic: "anthropic",
	google: "google",
	groq: "groq",
};

export const VENDOR_LABELS: Record<string, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
	google: "Google",
	"x-ai": "xAI",
	xai: "xAI",
	meta: "Meta",
	"meta-llama": "Meta",
	mistralai: "Mistral",
	deepseek: "DeepSeek",
	qwen: "Qwen",
	groq: "Groq",
	cohere: "Cohere",
	perplexity: "Perplexity",
};

export const MODEL_PRESET_DEFINITIONS: ModelPreset[] = [
	{
		id: "best-overall",
		label: "Best Overall",
		description: "Balanced quality and speed",
		candidates: [
			"anthropic/claude-sonnet-4",
			"anthropic/claude-4-sonnet",
			"openai/gpt-4.1",
		],
		namePatterns: [/claude sonnet 4/i, /gpt-4\.1(?!-mini)/i],
	},
	{
		id: "best-reasoning",
		label: "Best Reasoning",
		description: "Deep analysis and multi-step tasks",
		candidates: [
			"openai/o3",
			"openai/o4-mini",
			"openai/gpt-5",
			"deepseek/deepseek-r1",
		],
		namePatterns: [/gpt-5/i, /o3/i, /deepseek r1/i, /reasoning/i],
	},
	{
		id: "fastest",
		label: "Fastest",
		description: "Low latency responses",
		candidates: [
			"google/gemini-2.5-flash",
			"google/gemini-2.0-flash",
			"openai/gpt-4.1-mini",
		],
		namePatterns: [/gemini.*flash/i, /haiku/i, /mini/i, /lite/i],
	},
	{
		id: "cheapest",
		label: "Cheapest",
		description: "Lowest cost per token",
		candidates: [
			"google/gemini-2.0-flash-lite",
			"google/gemini-flash-lite",
			"openai/gpt-4.1-nano",
		],
		namePatterns: [/flash.?lite/i, /nano/i, /lite/i],
	},
	{
		id: "largest-context",
		label: "Largest Context",
		description: "Maximum context window",
		candidates: [
			"google/gemini-2.5-pro",
			"google/gemini-1.5-pro",
			"anthropic/claude-sonnet-4",
		],
		namePatterns: [/gemini.*pro/i, /1\.5 pro/i],
	},
];

type OpenRouterRawModel = {
	id: string;
	name: string;
	description?: string;
	context_length?: number;
	pricing?: {
		prompt?: string;
		completion?: string;
	};
	architecture?: {
		modality?: string;
		input_modalities?: string[];
		output_modalities?: string[];
	};
	supported_parameters?: string[];
};

function parsePrice(value?: string): number {
	const parsed = Number.parseFloat(value ?? "0");
	return Number.isFinite(parsed) ? parsed * 1_000_000 : 0;
}

function getVendorFromId(id: string): string {
	return id.split("/")[0] ?? id;
}

export function getVendorLabel(vendor: string): string {
	return (
		VENDOR_LABELS[vendor] ??
		vendor
			.split("-")
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(" ")
	);
}

function detectCapabilities(model: OpenRouterRawModel): CatalogModel["capabilities"] {
	const haystack = `${model.id} ${model.name} ${model.description ?? ""}`.toLowerCase();
	const modalities = [
		model.architecture?.modality ?? "",
		...(model.architecture?.input_modalities ?? []),
		...(model.architecture?.output_modalities ?? []),
	]
		.join(" ")
		.toLowerCase();

	const supported = (model.supported_parameters ?? []).map((p) => p.toLowerCase());

	return {
		reasoning:
			supported.includes("reasoning") ||
			/(^|\/)o[134](-|$)/.test(model.id) ||
			/r1|reasoning|think/.test(haystack),
		vision: modalities.includes("image"),
		tools: supported.includes("tools") || supported.includes("tool_choice"),
		fast: /flash|mini|haiku|lite|nano|instant|turbo/.test(haystack),
	};
}

export function normalizeOpenRouterModel(raw: OpenRouterRawModel): CatalogModel {
	const vendor = getVendorFromId(raw.id);
	return {
		id: raw.id,
		name: raw.name,
		description: raw.description,
		contextLength: raw.context_length ?? 0,
		vendor,
		vendorLabel: getVendorLabel(vendor),
		pricing: {
			promptPerMillion: parsePrice(raw.pricing?.prompt),
			completionPerMillion: parsePrice(raw.pricing?.completion),
		},
		capabilities: detectCapabilities(raw),
	};
}

export function parseOpenRouterModelsResponse(payload: unknown): CatalogModel[] {
	if (!payload || typeof payload !== "object" || !("data" in payload)) {
		return [];
	}

	const data = (payload as { data: unknown }).data;
	if (!Array.isArray(data)) return [];

	return data
		.filter((item): item is OpenRouterRawModel => {
			return (
				!!item &&
				typeof item === "object" &&
				"id" in item &&
				typeof item.id === "string" &&
				"name" in item &&
				typeof item.name === "string"
			);
		})
		.map(normalizeOpenRouterModel)
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function toCatalogModelId(
	provider: ModelProviderId,
	model: string,
): string {
	if (provider === "openrouter" || provider === "ollama") return model;
	const prefix = PROVIDER_VENDOR_PREFIX[provider];
	if (prefix && model && !model.includes("/")) {
		return `${prefix}/${model}`;
	}
	return model;
}

export function toProviderModelId(
	provider: ModelProviderId,
	catalogId: string,
): string {
	if (provider === "openrouter" || provider === "ollama") return catalogId;
	const prefix = PROVIDER_VENDOR_PREFIX[provider];
	if (prefix && catalogId.startsWith(`${prefix}/`)) {
		return catalogId.slice(prefix.length + 1);
	}
	return catalogId;
}

export function filterModelsForProvider(
	models: CatalogModel[],
	provider: ModelProviderId,
): CatalogModel[] {
	if (provider === "openrouter") return models;
	const prefix = PROVIDER_VENDOR_PREFIX[provider];
	if (!prefix) return models;
	return models.filter((m) => m.vendor === prefix || m.id.startsWith(`${prefix}/`));
}

export type ModelFilters = {
	query: string;
	vendors: string[];
	reasoning: boolean;
	vision: boolean;
	tools: boolean;
	fast: boolean;
	context128k: boolean;
	context1m: boolean;
};

export const DEFAULT_MODEL_FILTERS: ModelFilters = {
	query: "",
	vendors: [],
	reasoning: false,
	vision: false,
	tools: false,
	fast: false,
	context128k: false,
	context1m: false,
};

export function applyModelFilters(
	models: CatalogModel[],
	filters: ModelFilters,
): CatalogModel[] {
	const query = filters.query.trim().toLowerCase();

	return models.filter((model) => {
		if (query) {
			const matchesQuery =
				model.name.toLowerCase().includes(query) ||
				model.id.toLowerCase().includes(query) ||
				model.vendorLabel.toLowerCase().includes(query);
			if (!matchesQuery) return false;
		}

		if (filters.vendors.length > 0 && !filters.vendors.includes(model.vendor)) {
			return false;
		}

		if (filters.reasoning && !model.capabilities.reasoning) return false;
		if (filters.vision && !model.capabilities.vision) return false;
		if (filters.tools && !model.capabilities.tools) return false;
		if (filters.fast && !model.capabilities.fast) return false;
		if (filters.context128k && model.contextLength < 128_000) return false;
		if (filters.context1m && model.contextLength < 1_000_000) return false;

		return true;
	});
}

export function groupModelsByVendor(
	models: CatalogModel[],
): { vendor: string; label: string; models: CatalogModel[] }[] {
	const groups = new Map<string, CatalogModel[]>();

	for (const model of models) {
		const existing = groups.get(model.vendor) ?? [];
		existing.push(model);
		groups.set(model.vendor, existing);
	}

	return [...groups.entries()]
		.map(([vendor, vendorModels]) => ({
			vendor,
			label: getVendorLabel(vendor),
			models: vendorModels,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

export function resolvePresetModel(
	preset: ModelPreset,
	models: CatalogModel[],
): CatalogModel | null {
	for (const candidate of preset.candidates) {
		const match = models.find((m) => m.id === candidate);
		if (match) return match;
	}

	for (const pattern of preset.namePatterns) {
		const match = models.find((m) => pattern.test(m.name) || pattern.test(m.id));
		if (match) return match;
	}

	if (preset.id === "cheapest") {
		return [...models].sort(
			(a, b) => a.pricing.promptPerMillion - b.pricing.promptPerMillion,
		)[0] ?? null;
	}

	if (preset.id === "largest-context") {
		return [...models].sort((a, b) => b.contextLength - a.contextLength)[0] ?? null;
	}

	if (preset.id === "fastest") {
		const fastModels = models.filter((m) => m.capabilities.fast);
		return fastModels[0] ?? models[0] ?? null;
	}

	return null;
}

export function formatContextLength(length: number): string | null {
	if (!length) return null;
	if (length >= 1_000_000) {
		const millions = length / 1_000_000;
		return millions % 1 === 0 ? `${millions}M Context` : `${millions.toFixed(1)}M Context`;
	}
	if (length >= 1_000) {
		const thousands = length / 1_000;
		return thousands % 1 === 0 ? `${thousands}K Context` : `${Math.round(thousands)}K Context`;
	}
	return `${length} Context`;
}

export function formatPricePerMillion(value: number): string {
	if (!value) return "Free";
	if (value < 0.01) return `<$0.01 / M input`;
	return `$${value.toFixed(2)} / M input`;
}

export function findCatalogModel(
	models: CatalogModel[],
	provider: ModelProviderId,
	modelId: string,
): CatalogModel | undefined {
	const catalogId = toCatalogModelId(provider, modelId);
	return models.find((m) => m.id === catalogId || m.id === modelId);
}

export function getModelDisplayName(
	models: CatalogModel[],
	provider: ModelProviderId,
	modelId: string,
): string {
	const catalog = findCatalogModel(models, provider, modelId);
	if (catalog) return catalog.name;
	if (modelId.includes("/")) {
		return modelId.split("/").pop() ?? modelId;
	}
	return modelId;
}
