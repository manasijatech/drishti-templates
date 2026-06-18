import { Agent } from "@openai/agents";

import { SUB_AGENT_OPTIONS } from "~/lib/sub-agents";

import type { SubAgentId } from "~/types";

import { BASE_AGENT_CONTEXT, AGENT_GUARDRAIL_CONFIG, type AgentMcpServers, type AgentModel } from "./shared";



const SUB_AGENT_INSTRUCTIONS: Record<SubAgentId, string> = {

	research_agent: "data gathering, company research, tool calls",

	news_analyst: "news, announcements, event impact",

	market_analyst: "fundamentals, valuation, stock comparison",

	portfolio_agent: "portfolio analysis, allocation, risk",

};



const SUB_AGENT_TOOL_BUILDERS: Record<

	SubAgentId,

	(agent: Agent) => ReturnType<Agent["asTool"]>

> = {

	research_agent: (agent) =>

		agent.asTool({

			toolName: "research_agent",

			toolDescription:

				"Gather market data, company info, announcements, and earnings via Drishti MCP.",

		}),

	news_analyst: (agent) =>

		agent.asTool({

			toolName: "news_analyst",

			toolDescription:

				"Summarize news, announcements, and analyze market event impact.",

		}),

	market_analyst: (agent) =>

		agent.asTool({

			toolName: "market_analyst",

			toolDescription:

				"Analyze fundamentals, valuations, and compare Indian stocks.",

		}),

	portfolio_agent: (agent) =>

		agent.asTool({

			toolName: "portfolio_agent",

			toolDescription:

				"Analyze user portfolio holdings, allocation, and risk.",

		}),

};



function buildMcpPolicy(enabledSubAgents: SubAgentId[]): string {

	const disabledSubAgents = SUB_AGENT_OPTIONS.map((agent) => agent.id).filter(

		(id) => !enabledSubAgents.includes(id),

	);



	const lines = [

		"Drishti MCP tools are always available on you (the supervisor). Use them for live prices, top movers, company metadata, announcements, news, earnings, alerts, and portfolio summaries.",

		"Sub-agent toggles only control delegation — they never disable Drishti MCP tools.",

	];



	if (enabledSubAgents.length === 0) {

		lines.push(

			"All sub-agents are disabled. Call Drishti MCP tools directly for every data need. Do not attempt to delegate.",

		);

	} else if (disabledSubAgents.length > 0) {

		lines.push(

			`Disabled sub-agents (never call): ${disabledSubAgents.join(", ")}. For those responsibilities, call Drishti MCP tools directly instead of delegating.`,

		);

	} else {

		lines.push(

			"You may delegate to enabled specialists for deeper synthesis, but prefer Drishti MCP tools directly for factual lookups.",

		);

	}



	return lines.join("\n");

}



export function createSupervisorAgent(

	model: AgentModel,

	mcpServers: AgentMcpServers,

	specialists: Partial<Record<SubAgentId, Agent>>,

	context?: {

		memoryContext?: string;

		portfolioContext?: string;

		enabledSubAgents?: SubAgentId[];

	},

) {

	const enabledSubAgents =

		context?.enabledSubAgents ?? SUB_AGENT_OPTIONS.map((agent) => agent.id);



	const contextBlock = [

		context?.memoryContext ? `User memory:\n${context.memoryContext}` : "",

		context?.portfolioContext

			? `Configured user portfolios (from app — NOT from broker APIs):\n${context.portfolioContext}`

			: "",

	]

		.filter(Boolean)

		.join("\n\n");



	const portfolioInstructions = context?.portfolioContext

		? `

Portfolio rules:

- Holdings above are saved in the user's Drishti app. When they name a portfolio (e.g. "Deion", "my portfolio"), match it to a configured name and use those symbols.

- Never claim you cannot look up a named portfolio — read the configured portfolios section above.

- Never ask the user to paste holdings if that portfolio already lists symbols. Use Drishti MCP for live prices and analysis.

- Only ask for holdings if the named portfolio exists but has no symbols saved yet.`

		: "";



	const routingInstructions =

		enabledSubAgents.length === 0

			? "No specialist sub-agents are enabled."

			: `Optional specialists you may delegate to:\n${enabledSubAgents

					.map((id) => `- **${id}** — ${SUB_AGENT_INSTRUCTIONS[id]}`)

					.join("\n")}`;



	const mcpPolicy = buildMcpPolicy(enabledSubAgents);



	const tools = enabledSubAgents

		.map((id) => {

			const specialist = specialists[id];

			return specialist ? SUB_AGENT_TOOL_BUILDERS[id](specialist) : null;

		})

		.filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));



	return new Agent({

		name: "Supervisor",

		instructions: `${BASE_AGENT_CONTEXT}

You are the supervisor orchestrating market research with Drishti MCP.

${mcpPolicy}

${routingInstructions}

Workflow:
0. If the request is not about finance or Indian markets, refuse briefly and stop — do not answer off-topic requests
1. Understand user intent
2. Call Drishti MCP tools directly whenever live data is needed
3. Delegate to an enabled specialist only when extra synthesis helps — never for basic data fetches you can do via MCP
4. Synthesize a clear, well-structured answer and cite sources when you used tools
${portfolioInstructions}

${contextBlock}`.trim(),

		model: model as never,

		mcpServers: mcpServers as never[],

		tools,

		...AGENT_GUARDRAIL_CONFIG,

	});

}


