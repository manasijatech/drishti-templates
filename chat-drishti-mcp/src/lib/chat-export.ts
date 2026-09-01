import type { UIMessage } from "ai";

type ChatExportInput = {
	title: string;
	messages: UIMessage[];
	includeToolCalls?: boolean;
	exportedAt?: Date;
};

export type ComparisonExportResult = {
	label: string;
	messages: UIMessage[];
};

type ComparisonChatExportInput = {
	title: string;
	query: string;
	results: ComparisonExportResult[];
	includeToolCalls?: boolean;
	exportedAt?: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function toolValue(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

function toolCallContent(part: Record<string, unknown>): string {
	const name =
		typeof part.toolName === "string"
			? part.toolName
			: String(part.type).replace(/^tool-/, "");
	const status =
		typeof part.state === "string"
			? part.state.replaceAll("-", " ")
			: "unknown";
	const input = part.input ?? part.args;
	const output = part.output ?? part.result;
	const sections = [
		`### Tool call: ${name}`,
		`**Status:** ${status.charAt(0).toUpperCase()}${status.slice(1)}`,
	];

	if (input !== undefined) {
		sections.push(
			`**Arguments**\n\n\`\`\`\`json\n${toolValue(input)}\n\`\`\`\``,
		);
	}
	if (output !== undefined) {
		sections.push(`**Result**\n\n\`\`\`\`json\n${toolValue(output)}\n\`\`\`\``);
	}
	return sections.join("\n\n");
}

function partContent(part: unknown, includeToolCalls: boolean): string | null {
	if (!isRecord(part) || typeof part.type !== "string") return null;
	if (part.type === "text" && typeof part.text === "string") {
		return part.text.trim();
	}
	if (part.type === "error" && typeof part.message === "string") {
		return `> Error: ${part.message}`;
	}
	if (part.type === "image" || part.type === "data-image") {
		return "[Image attachment]";
	}
	if (part.type === "file") {
		const filename = [part.filename, part.name, part.fileName].find(
			(value): value is string => typeof value === "string" && value.length > 0,
		);
		const image =
			typeof part.mimeType === "string" && part.mimeType.startsWith("image/");
		return `[${image ? "Image attachment" : "Attachment"}: ${filename ?? "Unnamed file"}]`;
	}
	if (part.type === "source-url" && typeof part.url === "string") {
		const title = typeof part.title === "string" ? part.title : part.url;
		return `[Source: ${title}](${part.url})`;
	}
	if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
		return includeToolCalls ? toolCallContent(part) : null;
	}
	return null;
}

function visibleContent(message: UIMessage, includeToolCalls: boolean): string {
	return message.parts
		.map((part) => partContent(part, includeToolCalls))
		.filter(Boolean)
		.join("\n\n");
}

function roleLabel(role: UIMessage["role"]): string {
	if (role === "user") return "You";
	if (role === "assistant") return "Drishti";
	return "System";
}

function exportTimestamp(date: Date): string {
	const formatted = new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone: "Asia/Kolkata",
	}).format(date);
	return `${formatted} IST`;
}

function exportDate(date: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		timeZone: "Asia/Kolkata",
	}).formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

function safeHeading(value: string, fallback: string): string {
	return value.replace(/\s+/g, " ").trim() || fallback;
}

function transcript(
	messages: UIMessage[],
	headingLevel: 2 | 3,
	includeToolCalls = true,
): string {
	const heading = "#".repeat(headingLevel);
	return messages
		.map((message) => ({
			label: roleLabel(message.role),
			text: visibleContent(message, includeToolCalls),
		}))
		.filter(({ text }) => text.length > 0)
		.map(({ label, text }) => `${heading} ${label}\n\n${text}`)
		.join("\n\n");
}

export function hasExportableChatContent(messages: UIMessage[]): boolean {
	return transcript(messages, 2).length > 0;
}

function exportHeader(title: string, exportedAt: Date): string {
	return `# ${safeHeading(title, "Drishti chat")}\n\nExported from Drishti Chat on ${exportTimestamp(exportedAt)}.`;
}

export function buildChatExport({
	title,
	messages,
	includeToolCalls = true,
	exportedAt = new Date(),
}: ChatExportInput): string {
	return `${exportHeader(title, exportedAt)}\n\n${transcript(messages, 2, includeToolCalls)}\n`;
}

export function buildComparisonChatExport({
	title,
	query,
	results,
	includeToolCalls = true,
	exportedAt = new Date(),
}: ComparisonChatExportInput): string {
	const sections = results
		.map(({ label, messages }) => {
			const resultTranscript = transcript(messages, 3, includeToolCalls);
			if (!resultTranscript) return "";
			return `## ${safeHeading(label, "Model response")}\n\n${resultTranscript}`;
		})
		.filter(Boolean)
		.join("\n\n");

	return `${exportHeader(title, exportedAt)}\n\n## Prompt\n\n${query.trim()}\n\n${sections}\n`;
}

export function chatExportFilename(
	title: string,
	exportedAt = new Date(),
): string {
	const slug = title
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return `${slug || "drishti-chat"}-${exportDate(exportedAt)}.md`;
}
