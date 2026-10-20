import { type RunStreamEvent, run } from "@openai/agents";
import {
	type AiSdkUiMessageStreamSource,
	createAiSdkUiMessageStream,
} from "@openai/agents-extensions/ai-sdk-ui";
import type { UIMessage } from "ai";
import { createUIMessageStreamResponse } from "ai";
import { createDrishtiAgent } from "~/agents/drishti-agent";
import {
	logAgentTrace,
	logToolExecution,
	recordUsage,
} from "~/lib/observability";
import { connectMarketDataServers } from "~/mcp/registry";
import { createAgentModel } from "~/providers";
import type { ChatRequestBody, QueryUsageMetadata } from "~/types";

/**
 * Each tool call is a model turn. The SDK default (10) is too low for answers
 * that look up many stocks, such as explaining every top mover.
 */
const MAX_TURNS = 30;

/** Thrown when the Drishti MCP server cannot be reached (usually a bad API key). */
export class DrishtiConnectionError extends Error {
	constructor() {
		super(
			"Could not connect to Drishti market data. Check your Drishti API key and try again.",
		);
		this.name = "DrishtiConnectionError";
	}
}

function messageText(message: UIMessage): string {
	return message.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

function buildPrompt(messages: UIMessage[]): string {
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	const history = messages
		.slice(-10, -1)
		.map((m) => `${m.role}: ${messageText(m)}`)
		.join("\n");

	return [
		history ? `Conversation so far:\n${history}` : "",
		`Latest user message:\n${lastUser ? messageText(lastUser) : ""}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

function logRunStreamEvent(sessionId: string, event: RunStreamEvent) {
	if (event.type !== "run_item_stream_event" || event.name !== "tool_called") {
		return;
	}
	const rawItem = "rawItem" in event.item ? event.item.rawItem : null;
	const toolName =
		rawItem && typeof rawItem === "object" && "name" in rawItem
			? String(rawItem.name)
			: "tool";
	logToolExecution(sessionId, toolName);
	logAgentTrace(sessionId, "Drishti", "tool_start", toolName);
}

type RunUsage = {
	runContext: {
		usage: {
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
			requests: number;
		};
	};
};

function toQueryUsageMetadata(runResult: RunUsage): QueryUsageMetadata | null {
	const usage = runResult.runContext.usage;
	if (usage.totalTokens <= 0 && usage.requests <= 0) return null;

	return {
		promptTokens: usage.inputTokens,
		completionTokens: usage.outputTokens,
		totalTokens: usage.totalTokens,
		requests: usage.requests,
	};
}

/** Appends token usage as message metadata once the run finishes. */
function appendQueryUsageToUiStream(
	uiStream: ReadableStream,
	runResult: RunUsage & { completed: Promise<void> },
): ReadableStream {
	const reader = uiStream.getReader();

	return new ReadableStream({
		async start(controller) {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}

				await runResult.completed.catch(() => undefined);

				const queryUsage = toQueryUsageMetadata(runResult);
				if (queryUsage) {
					controller.enqueue({
						type: "message-metadata",
						messageMetadata: { queryUsage },
					});
				}

				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
		cancel() {
			void reader.cancel();
		},
	});
}

export async function runAgentChat(
	body: ChatRequestBody,
	options?: { signal?: AbortSignal },
) {
	const sessionId = body.sessionId ?? crypto.randomUUID();
	const mcpServers = await connectMarketDataServers({
		drishtiApiKey: body.drishtiApiKey,
	});

	try {
		if (mcpServers.active.length === 0) {
			for (const [server, error] of mcpServers.errors) {
				console.error(`[chat] MCP server '${server.name}' failed:`, error);
			}
			throw new DrishtiConnectionError();
		}

		const agent = createDrishtiAgent(
			createAgentModel(body.modelConfig),
			mcpServers.active,
			{
				memoryContext: body.memoryContext,
				portfolioContext: body.portfolioContext,
			},
		);

		logAgentTrace(sessionId, "Drishti", "run_start");

		const runResult = await run(agent, buildPrompt(body.messages), {
			stream: true,
			signal: options?.signal,
			maxTurns: MAX_TURNS,
		});

		const observedStreamSource = {
			toStream: () => {
				const inner = runResult.toStream();
				return new ReadableStream<RunStreamEvent>({
					async start(controller) {
						try {
							for await (const event of inner) {
								logRunStreamEvent(sessionId, event);
								controller.enqueue(event);
							}
							controller.close();
						} catch (error) {
							controller.error(error);
						}
					},
				});
			},
		} as AiSdkUiMessageStreamSource;

		const uiStream = createAiSdkUiMessageStream(observedStreamSource);

		const response = createUIMessageStreamResponse({
			stream: appendQueryUsageToUiStream(uiStream, runResult),
			headers: { "X-Session-Id": sessionId },
		});

		void runResult.completed
			.then(() => {
				const queryUsage = toQueryUsageMetadata(runResult);
				if (!queryUsage) return;
				recordUsage(sessionId, queryUsage);
				logAgentTrace(
					sessionId,
					"Drishti",
					"usage",
					`${queryUsage.totalTokens} tokens`,
				);
			})
			.catch(() => undefined);

		return { response, cleanup: () => mcpServers.close() };
	} catch (error) {
		await mcpServers.close();
		throw error;
	}
}
