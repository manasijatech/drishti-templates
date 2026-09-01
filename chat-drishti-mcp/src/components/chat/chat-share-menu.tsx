"use client";

import { DownloadSimple, Export, ShareNetwork } from "@phosphor-icons/react";
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

type ChatShareMenuProps = ChatExportSource & { disabled?: boolean };

function createExport(source: ChatExportSource) {
	const exportedAt = new Date();
	const content = source.comparison
		? buildComparisonChatExport({
				title: source.title,
				query: source.comparison.query,
				results: source.comparison.results,
				exportedAt,
			})
		: buildChatExport({
				title: source.title,
				messages: source.messages,
				exportedAt,
			});
	return {
		content,
		filename: chatExportFilename(source.title, exportedAt),
	};
}

function downloadMarkdown(source: ChatExportSource) {
	const { content, filename } = createExport(source);
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

async function shareChat(source: ChatExportSource) {
	const { content, filename } = createExport(source);
	if (!navigator.share) {
		downloadMarkdown(source);
		return;
	}

	try {
		const file = new File([content], filename, { type: "text/markdown" });
		const data: ShareData = navigator.canShare?.({ files: [file] })
			? { title: source.title, text: "Shared from Drishti Chat", files: [file] }
			: { title: source.title, text: content };
		await navigator.share(data);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return;
		downloadMarkdown(source);
	}
}

export function ChatShareMenu({
	disabled,
	messages,
	title,
	comparison,
}: ChatShareMenuProps) {
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
						<Export aria-hidden="true" />
						Share
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem onClick={() => void shareChat(source)}>
					<ShareNetwork aria-hidden="true" />
					Share chat
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => downloadMarkdown(source)}>
					<DownloadSimple aria-hidden="true" />
					Export Markdown
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
