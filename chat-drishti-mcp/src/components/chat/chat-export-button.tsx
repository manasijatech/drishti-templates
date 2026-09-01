"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	buildChatExport,
	buildComparisonChatExport,
	type ComparisonExportResult,
	chatExportFilename,
} from "~/lib/chat-export";

type ChatExportSource = {
	messages: UIMessage[];
	title: string;
	comparison?: {
		query: string;
		results: ComparisonExportResult[];
	};
};

type ChatExportButtonProps = ChatExportSource & { disabled?: boolean };

function createExport(source: ChatExportSource, includeToolCalls: boolean) {
	const exportedAt = new Date();
	const content = source.comparison
		? buildComparisonChatExport({
				title: source.title,
				query: source.comparison.query,
				results: source.comparison.results,
				includeToolCalls,
				exportedAt,
			})
		: buildChatExport({
				title: source.title,
				messages: source.messages,
				includeToolCalls,
				exportedAt,
			});
	return {
		content,
		filename: chatExportFilename(source.title, exportedAt),
	};
}

function downloadMarkdown(source: ChatExportSource, includeToolCalls: boolean) {
	const { content, filename } = createExport(source, includeToolCalls);
	const url = URL.createObjectURL(
		new Blob([content], { type: "text/markdown" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ChatExportButton({
	disabled,
	messages,
	title,
	comparison,
}: ChatExportButtonProps) {
	const source = { title, messages, comparison };
	const unavailable =
		disabled ||
		(messages.length === 0 && (!comparison || comparison.results.length === 0));

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={unavailable}
				render={
					<Button size="sm" variant="outline">
						<DownloadSimple aria-hidden="true" />
						Export
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuItem onClick={() => downloadMarkdown(source, true)}>
					Export with tool calls
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => downloadMarkdown(source, false)}>
					Export without tool calls
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
