import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import type { ModelConfig } from "~/types";

export function createAgentModel(config: ModelConfig) {
	const { provider, model, apiKey, baseUrl } = config;

	switch (provider) {
		case "openai": {
			const client = createOpenAI({
				apiKey,
				...(baseUrl ? { baseURL: baseUrl } : {}),
			});
			return aisdk(client(model));
		}
		case "anthropic": {
			const client = createAnthropic({
				apiKey,
				...(baseUrl ? { baseURL: baseUrl } : {}),
			});
			return aisdk(client(model));
		}
		case "google": {
			const client = createGoogleGenerativeAI({
				apiKey,
				...(baseUrl ? { baseURL: baseUrl } : {}),
			});
			return aisdk(client(model));
		}
		case "groq": {
			const client = createGroq({
				apiKey,
				...(baseUrl ? { baseURL: baseUrl } : {}),
			});
			return aisdk(client(model));
		}
		case "openrouter": {
			const client = createOpenAI({
				apiKey,
				baseURL: baseUrl ?? "https://openrouter.ai/api/v1",
			});
			return aisdk(client(model));
		}
		case "ollama": {
			const client = createOpenAI({
				apiKey: apiKey || "ollama",
				baseURL: baseUrl ?? "http://localhost:11434/v1",
			});
			return aisdk(client(model));
		}
		default:
			throw new Error(`Unsupported provider: ${provider as string}`);
	}
}
