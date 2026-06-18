import type { AgentTrace, ToolExecutionLog, UsageMetrics } from "~/types";

const traces: AgentTrace[] = [];
const toolLogs: ToolExecutionLog[] = [];
const usageBySession = new Map<string, UsageMetrics>();

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function logAgentTrace(
	sessionId: string,
	agentName: string,
	event: string,
	detail?: string,
): void {
	traces.push({
		id: generateId(),
		sessionId,
		agentName,
		event,
		detail,
		timestamp: new Date().toISOString(),
	});
	if (traces.length > 500) traces.shift();
}

export function logToolExecution(
	sessionId: string,
	toolName: string,
	options?: {
		serverName?: string;
		input?: unknown;
		output?: unknown;
		durationMs?: number;
	},
): void {
	toolLogs.push({
		id: generateId(),
		sessionId,
		toolName,
		serverName: options?.serverName,
		input: options?.input,
		output: options?.output,
		durationMs: options?.durationMs,
		timestamp: new Date().toISOString(),
	});
	if (toolLogs.length > 500) toolLogs.shift();
}

export function recordUsage(
	sessionId: string,
	metrics: Partial<UsageMetrics>,
): void {
	const current = usageBySession.get(sessionId) ?? {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
		estimatedCostUsd: 0,
	};
	usageBySession.set(sessionId, {
		promptTokens: current.promptTokens + (metrics.promptTokens ?? 0),
		completionTokens: current.completionTokens + (metrics.completionTokens ?? 0),
		totalTokens: current.totalTokens + (metrics.totalTokens ?? 0),
		estimatedCostUsd:
			current.estimatedCostUsd + (metrics.estimatedCostUsd ?? 0),
	});
}

export function getTracesForSession(sessionId: string): AgentTrace[] {
	return traces.filter((t) => t.sessionId === sessionId);
}

export function getToolLogsForSession(sessionId: string): ToolExecutionLog[] {
	return toolLogs.filter((t) => t.sessionId === sessionId);
}

export function getUsageForSession(sessionId: string): UsageMetrics | undefined {
	return usageBySession.get(sessionId);
}
