import { run, type RunStreamEvent } from "@openai/agents";
import {
	createAiSdkUiMessageStream,
	type AiSdkUiMessageStreamSource,
} from "@openai/agents-extensions/ai-sdk-ui";
import { createUIMessageStreamResponse } from "ai";
import type { UIMessage } from "ai";
import {
	createMarketAnalystAgent,
	createNewsAnalystAgent,
	createPortfolioAgent,
	createResearchAgent,
	createSupervisorAgent,
} from "~/agents";
import {
	logAgentTrace,
	logToolExecution,
	recordUsage,
} from "~/lib/observability";
import { connectMarketDataServers } from "~/mcp/registry";
import { createAgentModel } from "~/providers";
import { getEnabledSubAgentIds, normalizeSubAgentPreferences } from "~/lib/sub-agents";
import type { ChatRequestBody, QueryUsageMetadata, SubAgentId } from "~/types";

function extractTextFromMessages(messages: UIMessage[]): string {
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	if (!lastUser) return "";

	return lastUser.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

function buildConversationContext(messages: UIMessage[]): string {
	return messages
		.slice(-10)
		.map((m) => {
			const text = m.parts
				.filter((p): p is { type: "text"; text: string } => p.type === "text")
				.map((p) => p.text)
				.join(" ");
			return `${m.role}: ${text}`;
		})
		.join("\n");
}

function logRunStreamEvent(sessionId: string, event: RunStreamEvent) {
	if (event.type !== "run_item_stream_event") return;

	if (event.name === "tool_called") {
		const toolName =
			"rawItem" in event.item &&
			event.item.rawItem &&
			typeof event.item.rawItem === "object" &&
			"name" in event.item.rawItem
				? String(event.item.rawItem.name)
				: "tool";
		logToolExecution(sessionId, toolName);
		logAgentTrace(sessionId, "Supervisor", "tool_start", toolName);
	}

	if (event.name === "handoff_occurred") {
		logAgentTrace(sessionId, "Supervisor", "handoff");
	}
}

function extractFinalOutputText(runResult: {
	finalOutput: unknown;
}): string {
	const out = runResult.finalOutput;
	if (typeof out === "string") return out;
	if (out == null) return "";
	return JSON.stringify(out, null, 2);
}

function toQueryUsageMetadata(runResult: {
	runContext: { usage: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number } };
}): QueryUsageMetadata | null {
	const usage = runResult.runContext.usage;
	if (usage.totalTokens <= 0 && usage.requests <= 0) return null;

	return {
		promptTokens: usage.inputTokens,
		completionTokens: usage.outputTokens,
		totalTokens: usage.totalTokens,
		requests: usage.requests,
	};
}

function appendQueryUsageToUiStream(
	uiStream: ReadableStream,
	runResult: {
		completed: Promise<void>;
		runContext: { usage: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number } };
	},
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

async function prepareSupervisorRun(body: ChatRequestBody) {
	const sessionId = body.sessionId ?? crypto.randomUUID();
	const { modelConfig, memoryContext, portfolioContext, enabledSubAgents } = body;
	const userQuery = extractTextFromMessages(body.messages);
	const conversationContext = buildConversationContext(body.messages);

	const model = createAgentModel(modelConfig);
	const mcpServers = await connectMarketDataServers({
		drishtiApiKey: process.env.DRISHTI_API_KEY,
	});

	logAgentTrace(sessionId, "Supervisor", "session_start", userQuery);

	const activeServers = mcpServers.active;
	const enabledAgents: SubAgentId[] =
		enabledSubAgents ??
		getEnabledSubAgentIds(normalizeSubAgentPreferences());

	const specialists: Partial<
		Record<SubAgentId, Awaited<ReturnType<typeof createResearchAgent>>>
	> = {};

	if (enabledAgents.includes("research_agent")) {
		specialists.research_agent = createResearchAgent(model, activeServers);
	}
	if (enabledAgents.includes("news_analyst")) {
		specialists.news_analyst = createNewsAnalystAgent(model, activeServers);
	}
	if (enabledAgents.includes("market_analyst")) {
		specialists.market_analyst = createMarketAnalystAgent(model, activeServers);
	}
	if (enabledAgents.includes("portfolio_agent")) {
		specialists.portfolio_agent = createPortfolioAgent(model, activeServers);
	}

	const supervisor = createSupervisorAgent(model, activeServers, specialists, {
		memoryContext,
		portfolioContext,
		enabledSubAgents: enabledAgents,
	});

	const sessionContext = [
		memoryContext ? `User memory:\n${memoryContext}` : "",
		portfolioContext
			? `Configured portfolios for this session:\n${portfolioContext}`
			: "",
	]
		.filter(Boolean)
		.join("\n\n");

	const prompt = [
		sessionContext,
		conversationContext ? `Conversation so far:\n${conversationContext}` : "",
		`Latest user message:\n${userQuery}`,
	]
		.filter(Boolean)
		.join("\n\n");

	return { sessionId, supervisor, prompt, mcpServers, userQuery };
}

export async function runSupervisorChatSync(
	body: ChatRequestBody,
	options?: { signal?: AbortSignal },
) {
	const setup = await prepareSupervisorRun(body);

	try {
		logAgentTrace(setup.sessionId, "Supervisor", "run_start");

		const runResult = await run(setup.supervisor, setup.prompt, {
			stream: false,
			signal: options?.signal,
		});

		const text = extractFinalOutputText(runResult);
		const queryUsage = toQueryUsageMetadata(runResult);

		if (queryUsage) {
			recordUsage(setup.sessionId, {
				promptTokens: queryUsage.promptTokens,
				completionTokens: queryUsage.completionTokens,
				totalTokens: queryUsage.totalTokens,
			});
			logAgentTrace(
				setup.sessionId,
				"Supervisor",
				"usage",
				`${queryUsage.totalTokens} tokens`,
			);
		}

		return {
			text,
			usage: queryUsage,
			sessionId: setup.sessionId,
		};
	} finally {
		await setup.mcpServers.close();
	}
}

export async function runSupervisorChat(
	body: ChatRequestBody,
	options?: { signal?: AbortSignal },
) {
	const setup = await prepareSupervisorRun(body);

	try {
		logAgentTrace(setup.sessionId, "Supervisor", "run_start");

		const runResult = await run(setup.supervisor, setup.prompt, {
			stream: true,
			signal: options?.signal,
		});

		const observedStreamSource = {
			toStream: () => {
				const inner = runResult.toStream();
				return new ReadableStream<RunStreamEvent>({
					async start(controller) {
						try {
							for await (const event of inner) {
								logRunStreamEvent(setup.sessionId, event);
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
		const streamWithUsage = appendQueryUsageToUiStream(uiStream, runResult);

		const response = createUIMessageStreamResponse({
			stream: streamWithUsage,
			headers: {
				"X-Session-Id": setup.sessionId,
			},
		});

		void runResult.completed
			.then(() => {
				const queryUsage = toQueryUsageMetadata(runResult);
				if (!queryUsage) return;
				recordUsage(setup.sessionId, {
					promptTokens: queryUsage.promptTokens,
					completionTokens: queryUsage.completionTokens,
					totalTokens: queryUsage.totalTokens,
				});
				logAgentTrace(
					setup.sessionId,
					"Supervisor",
					"usage",
					`${queryUsage.totalTokens} tokens`,
				);
			})
			.catch(() => undefined);

		return { response, cleanup: () => setup.mcpServers.close() };
	} catch (error) {
		await setup.mcpServers.close();
		throw error;
	}
}
