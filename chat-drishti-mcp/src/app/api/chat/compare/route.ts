import { NextResponse } from "next/server";
import type { UIMessage } from "ai";
import { z } from "zod";
import {
	createGuardrailRefusalResponse,
	getRefusalMessage,
	validateChatInput,
} from "~/lib/guardrails";
import {
	hasEncryptedApiKey,
	resolveDrishtiApiKeyFromEncrypted,
	resolveModelConfigFromEncrypted,
} from "~/lib/model-config";
import {
	MODEL_COMPARE_MAX,
	MODEL_COMPARE_MIN,
	runModelComparison,
} from "~/lib/model-compare";

const uiMessageSchema = z.custom<UIMessage>(
	(val) =>
		typeof val === "object" &&
		val !== null &&
		"id" in val &&
		"role" in val &&
		"parts" in val &&
		Array.isArray((val as UIMessage).parts),
);

const subAgentIdSchema = z.enum([
	"research_agent",
	"news_analyst",
	"market_analyst",
	"portfolio_agent",
]);

const encryptedModelConfigSchema = z.object({
	provider: z.enum([
		"openai",
		"anthropic",
		"google",
		"openrouter",
		"groq",
		"ollama",
	]),
	model: z.string().min(1),
	encryptedApiKey: z.string(),
	iv: z.string(),
	baseUrl: z.string().optional(),
});

const encryptedApiKeySchema = z.object({
	encryptedApiKey: z.string(),
	iv: z.string(),
});

const compareRequestSchema = z.object({
	messages: z.array(uiMessageSchema).min(1),
	modelConfigs: z.array(encryptedModelConfigSchema).min(MODEL_COMPARE_MIN).max(MODEL_COMPARE_MAX),
	drishtiApiKey: encryptedApiKeySchema,
	sessionId: z.string().optional(),
	memoryContext: z.string().optional(),
	portfolioContext: z.string().optional(),
	enabledSubAgents: z.array(subAgentIdSchema).optional(),
});

export const maxDuration = 300;

export async function POST(req: Request) {
	let requestMessages: UIMessage[] = [];

	try {
		const body = await req.json();
		const parsed = compareRequestSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		for (const modelConfig of parsed.data.modelConfigs) {
			if (!hasEncryptedApiKey(modelConfig.provider, modelConfig)) {
				return NextResponse.json(
					{
						error: `API key required for ${modelConfig.provider}. Configure your model in Settings.`,
					},
					{ status: 401 },
				);
			}
		}

		const modelConfigs = parsed.data.modelConfigs.map((config) => {
			try {
				return resolveModelConfigFromEncrypted(config);
			} catch (error) {
				throw new Error(
					error instanceof Error
						? error.message
						: "Could not decrypt API key.",
				);
			}
		});

		let drishtiApiKey: string;
		try {
			drishtiApiKey = resolveDrishtiApiKeyFromEncrypted(parsed.data.drishtiApiKey);
		} catch (error) {
			console.error("[chat/compare] Drishti API key decrypt failed:", error);
			return NextResponse.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Could not decrypt Drishti MCP API key. Re-save it in Configuration.",
				},
				{ status: 401 },
			);
		}

		requestMessages = parsed.data.messages;

		const guardrailCheck = validateChatInput(requestMessages);
		if (!guardrailCheck.allowed) {
			return createGuardrailRefusalResponse(
				getRefusalMessage(guardrailCheck.violation),
				requestMessages,
			);
		}

		const results = await runModelComparison(
			{
				messages: parsed.data.messages,
				sessionId: parsed.data.sessionId,
				memoryContext: parsed.data.memoryContext,
				portfolioContext: parsed.data.portfolioContext,
				enabledSubAgents: parsed.data.enabledSubAgents,
				drishtiApiKey,
			},
			modelConfigs,
			{ signal: req.signal },
		);

		return NextResponse.json({ results });
	} catch (error) {
		if (req.signal.aborted) {
			return new Response(null, { status: 499 });
		}
		console.error("[chat/compare] error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to run model comparison",
			},
			{ status: 500 },
		);
	}
}
