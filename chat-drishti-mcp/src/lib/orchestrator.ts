import { run, type RunStreamEvent } from "@openai/agents";
import {
	createAiSdkUiMessageStreamResponse,
	type AiSdkUiMessageStreamSource,
} from "@openai/agents-extensions/ai-sdk-ui";
import type { UIMessage } from "ai";
import {
	createMarketAnalystAgent,
	createNewsAnalystAgent,
	createPortfolioAgent,
	createResearchAgent,
	createSupervisorAgent,
} from "~/agents";
import { logAgentTrace, logToolExecution } from "~/lib/observability";
import { connectMarketDataServers } from "~/mcp/registry";
import { createAgentModel } from "~/providers";
import { getEnabledSubAgentIds, normalizeSubAgentPreferences } from "~/lib/sub-agents";
import type { ChatRequestBody, SubAgentId } from "~/types";

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

export async function runSupervisorChat(
	body: ChatRequestBody,
	options?: { signal?: AbortSignal },
) {
	const sessionId = body.sessionId ?? crypto.randomUUID();
	const { modelConfig, memoryContext, portfolioContext, enabledSubAgents } = body;
	const userQuery = extractTextFromMessages(body.messages);
	const conversationContext = buildConversationContext(body.messages);

	const model = createAgentModel(modelConfig);
	const mcpServers = await connectMarketDataServers({
		drishtiApiKey: process.env.DRISHTI_API_KEY,
	});

	logAgentTrace(sessionId, "Supervisor", "session_start", userQuery);

	try {
		const activeServers = mcpServers.active;
		const enabledAgents: SubAgentId[] =
			enabledSubAgents ??
			getEnabledSubAgentIds(normalizeSubAgentPreferences());

		const specialists: Partial<Record<SubAgentId, Awaited<ReturnType<typeof createResearchAgent>>>> =
			{};

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

		const prompt = conversationContext
			? `Conversation so far:\n${conversationContext}\n\nLatest user message:\n${userQuery}`
			: userQuery;

		logAgentTrace(sessionId, "Supervisor", "run_start");

		const runResult = await run(supervisor, prompt, {
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

		const response = createAiSdkUiMessageStreamResponse(observedStreamSource, {
			headers: {
				"X-Session-Id": sessionId,
			},
		});

		return { response, cleanup: () => mcpServers.close() };
	} catch (error) {
		await mcpServers.close();
		throw error;
	}
}
