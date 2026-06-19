import type { UIMessage } from "ai";

export type ModelProviderId =
	| "openai"
	| "anthropic"
	| "google"
	| "openrouter"
	| "groq"
	| "ollama";

export interface ModelConfig {
	provider: ModelProviderId;
	model: string;
	apiKey: string;
	baseUrl?: string;
}

export interface EncryptedModelConfig {
	provider: ModelProviderId;
	model: string;
	encryptedApiKey: string;
	iv: string;
	baseUrl?: string;
}

export interface EncryptedApiKeyCredential {
	encryptedApiKey: string;
	iv: string;
}

export interface PortfolioHolding {
	symbol: string;
	quantity: number;
	averagePrice: number;
}

export interface Portfolio {
	id: string;
	name: string;
	holdings: PortfolioHolding[];
	createdAt: string;
	updatedAt: string;
}

export interface Watchlist {
	id: string;
	name: string;
	symbols: string[];
	createdAt: string;
}

export type SubAgentId =
	| "research_agent"
	| "news_analyst"
	| "market_analyst"
	| "portfolio_agent";

export type SubAgentPreferences = Record<SubAgentId, boolean>;

export interface UserPreferences {
	favoriteSectors: string[];
	defaultModelProvider?: ModelProviderId;
	subAgents: SubAgentPreferences;
}

export interface LongTermMemory {
	preferences: UserPreferences;
	watchlists: Watchlist[];
	portfolios: Portfolio[];
}

export interface ChatSession {
	id: string;
	title: string;
	messages: UIMessage[];
	createdAt: string;
	updatedAt: string;
	pinned?: boolean;
}

export interface AgentTrace {
	id: string;
	sessionId: string;
	agentName: string;
	event: string;
	detail?: string;
	timestamp: string;
}

export interface ToolExecutionLog {
	id: string;
	sessionId: string;
	toolName: string;
	serverName?: string;
	input?: unknown;
	output?: unknown;
	durationMs?: number;
	timestamp: string;
}

export interface UsageMetrics {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	estimatedCostUsd: number;
}

/** Token usage for a single user query (all agent turns combined). */
export interface QueryUsageMetadata {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	requests: number;
}

export interface ChatRequestBody {
	messages: UIMessage[];
	modelConfig: ModelConfig;
	sessionId?: string;
	memoryContext?: string;
	portfolioContext?: string;
	enabledSubAgents?: SubAgentId[];
	drishtiApiKey: string;
}

export interface ModelCompareTarget {
	provider: ModelProviderId;
	model: string;
}

export interface ModelCompareResult {
	provider: ModelProviderId;
	model: string;
	text: string;
	usage: QueryUsageMetadata | null;
	durationMs: number;
	error?: string;
}

export interface CompareChatRequestBody {
	messages: UIMessage[];
	modelConfigs: EncryptedModelConfig[];
	sessionId?: string;
	memoryContext?: string;
	portfolioContext?: string;
	enabledSubAgents?: SubAgentId[];
}

