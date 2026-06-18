import type { UIMessage } from "ai";
import { addQueryUsage, EMPTY_QUERY_USAGE } from "~/lib/query-cost";
import type { QueryUsageMetadata } from "~/types";

export type QueryUsageMessageMetadata = {
	queryUsage?: QueryUsageMetadata;
};

export function isQueryUsageMetadata(
	value: unknown,
): value is QueryUsageMessageMetadata {
	if (!value || typeof value !== "object") return false;
	const queryUsage = (value as QueryUsageMessageMetadata).queryUsage;
	if (!queryUsage || typeof queryUsage !== "object") return false;
	return (
		typeof queryUsage.promptTokens === "number" &&
		typeof queryUsage.completionTokens === "number" &&
		typeof queryUsage.totalTokens === "number"
	);
}

export function getQueryUsageFromMessage(
	message: UIMessage,
): QueryUsageMetadata | null {
	if (!isQueryUsageMetadata(message.metadata)) return null;
	return message.metadata.queryUsage ?? null;
}

export function getLastQueryUsageFromMessages(
	messages: UIMessage[],
): QueryUsageMetadata | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		const usage = getQueryUsageFromMessage(message);
		if (usage) return usage;
	}
	return null;
}

export function sumQueryUsageFromMessages(
	messages: UIMessage[],
): QueryUsageMetadata {
	return messages.reduce((total, message) => {
		if (message.role !== "assistant") return total;
		const usage = getQueryUsageFromMessage(message);
		return usage ? addQueryUsage(total, usage) : total;
	}, EMPTY_QUERY_USAGE);
}
