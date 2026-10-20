import { InputGuardrailTripwireTriggered } from "@openai/agents";
import type { UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "~/env";
import {
	createGuardrailRefusalResponse,
	type GuardrailViolation,
	getRefusalMessage,
	validateChatInput,
} from "~/lib/guardrails";
import {
	hasEncryptedApiKey,
	resolveDrishtiApiKeyFromEncrypted,
	resolveModelConfigFromEncrypted,
} from "~/lib/model-config";
import { DrishtiConnectionError, runAgentChat } from "~/lib/orchestrator";
import type { ModelConfig } from "~/types";

const uiMessageSchema = z.custom<UIMessage>(
	(val) =>
		typeof val === "object" &&
		val !== null &&
		"id" in val &&
		"role" in val &&
		"parts" in val &&
		Array.isArray((val as UIMessage).parts),
);

const encryptedApiKeySchema = z.object({
	encryptedApiKey: z.string(),
	iv: z.string(),
});

const chatRequestSchema = z.object({
	messages: z.array(uiMessageSchema).min(1),
	modelConfig: z.object({
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
	}),
	/** Optional when the server has DRISHTI_API_KEY set. */
	drishtiApiKey: encryptedApiKeySchema.optional(),
	sessionId: z.string().optional(),
	memoryContext: z.string().optional(),
	portfolioContext: z.string().optional(),
});

export const maxDuration = 120;

export async function POST(req: Request) {
	let requestMessages: UIMessage[] = [];

	try {
		const body = await req.json();
		const parsed = chatRequestSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		if (
			!hasEncryptedApiKey(
				parsed.data.modelConfig.provider,
				parsed.data.modelConfig,
			)
		) {
			return NextResponse.json(
				{ error: "Add your AI model API key in Settings." },
				{ status: 401 },
			);
		}

		let modelConfig: ModelConfig;
		try {
			modelConfig = resolveModelConfigFromEncrypted(parsed.data.modelConfig);
		} catch (error) {
			console.error("[chat] API key decrypt failed:", error);
			return NextResponse.json(
				{
					error:
						"Could not read your saved API key. Please save it again in Settings.",
				},
				{ status: 401 },
			);
		}

		let drishtiApiKey = env.DRISHTI_API_KEY;
		if (parsed.data.drishtiApiKey?.encryptedApiKey) {
			try {
				drishtiApiKey = resolveDrishtiApiKeyFromEncrypted(
					parsed.data.drishtiApiKey,
				);
			} catch (error) {
				console.error("[chat] Drishti API key decrypt failed:", error);
				return NextResponse.json(
					{
						error:
							"Could not read your saved Drishti API key. Please save it again in Settings.",
					},
					{ status: 401 },
				);
			}
		}
		if (!drishtiApiKey) {
			return NextResponse.json(
				{ error: "Add your Drishti API key in Settings." },
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

		const { response, cleanup } = await runAgentChat(
			{
				messages: parsed.data.messages,
				modelConfig,
				sessionId: parsed.data.sessionId,
				memoryContext: parsed.data.memoryContext,
				portfolioContext: parsed.data.portfolioContext,
				drishtiApiKey,
			},
			{ signal: req.signal },
		);

		const originalBody = response.body;
		if (originalBody) {
			const reader = originalBody.getReader();
			let cleanedUp = false;
			const runCleanup = async () => {
				if (cleanedUp) return;
				cleanedUp = true;
				await cleanup();
			};

			const onAbort = () => {
				void reader.cancel().catch(() => undefined);
			};
			req.signal.addEventListener("abort", onAbort);

			const stream = new ReadableStream({
				async start(controller) {
					try {
						while (true) {
							if (req.signal.aborted) break;
							const { done, value } = await reader.read();
							if (done) break;
							controller.enqueue(value);
						}
					} catch {
						// Client disconnected or stream cancelled
					} finally {
						req.signal.removeEventListener("abort", onAbort);
						await runCleanup();
						try {
							controller.close();
						} catch {
							// Already closed
						}
					}
				},
				cancel() {
					onAbort();
					void runCleanup();
				},
			});

			return new Response(stream, {
				status: response.status,
				headers: response.headers,
			});
		}

		await cleanup();
		return response;
	} catch (error) {
		if (req.signal.aborted) {
			return new Response(null, { status: 499 });
		}
		if (error instanceof InputGuardrailTripwireTriggered) {
			const outputInfo = error.result.output.outputInfo as
				| { violation?: GuardrailViolation }
				| undefined;
			return createGuardrailRefusalResponse(
				getRefusalMessage(outputInfo?.violation),
				requestMessages,
			);
		}
		if (error instanceof DrishtiConnectionError) {
			return NextResponse.json({ error: error.message }, { status: 502 });
		}
		console.error("[chat] error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to process chat",
			},
			{ status: 500 },
		);
	}
}
