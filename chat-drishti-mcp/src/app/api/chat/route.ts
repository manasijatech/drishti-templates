import { NextResponse } from "next/server";
import type { UIMessage } from "ai";
import { InputGuardrailTripwireTriggered } from "@openai/agents";
import { z } from "zod";
import {
	createGuardrailRefusalResponse,
	getRefusalMessage,
	validateChatInput,
	type GuardrailViolation,
} from "~/lib/guardrails";
import {
	hasEncryptedApiKey,
	resolveModelConfigFromEncrypted,
} from "~/lib/model-config";
import { runSupervisorChat } from "~/lib/orchestrator";

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
	sessionId: z.string().optional(),
	memoryContext: z.string().optional(),
	portfolioContext: z.string().optional(),
	enabledSubAgents: z.array(subAgentIdSchema).optional(),
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
				{ error: "API key required. Configure your model in Settings." },
				{ status: 401 },
			);
		}

		let modelConfig;
		try {
			modelConfig = resolveModelConfigFromEncrypted(parsed.data.modelConfig);
		} catch (error) {
			console.error("[chat] API key decrypt failed:", error);
			return NextResponse.json(
				{
					error:
						"Could not decrypt API key. Re-save your key in Configuration.",
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

		const { response, cleanup } = await runSupervisorChat(
			{
				messages: parsed.data.messages,
				modelConfig,
				sessionId: parsed.data.sessionId,
				memoryContext: parsed.data.memoryContext,
				portfolioContext: parsed.data.portfolioContext,
				enabledSubAgents: parsed.data.enabledSubAgents,
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
