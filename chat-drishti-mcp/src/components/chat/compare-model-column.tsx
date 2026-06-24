"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowRight, Clock, Coins } from "@phosphor-icons/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageList } from "~/components/agent-elements/message-list";
import type { AgentChatProps } from "~/components/agent-elements/types";
import { Button } from "~/components/ui/button";
import {
	estimateQueryCostUsd,
	formatTokenCount,
	formatUsd,
} from "~/lib/query-cost";
import {
	getModelDisplayName,
	type CatalogModel,
} from "~/lib/openrouter-models-core";
import { getLastQueryUsageFromMessages } from "~/lib/query-usage-message";
import { cn } from "~/lib/utils";
import type {
	EncryptedApiKeyCredential,
	EncryptedModelConfig,
	ModelCompareTarget,
	ModelProviderId,
	QueryUsageMetadata,
	SubAgentId,
} from "~/types";

export type CompareRun = {
	id: string;
	query: string;
	priorMessages: UIMessage[];
};

export type CompareColumnMeta = {
	provider: ModelProviderId;
	model: string;
	usage: QueryUsageMetadata | null;
	estimatedCost: number | null;
	durationMs: number;
	isStreaming: boolean;
	error?: string;
};

type CompareSharedContext = {
	sessionId?: string;
	memoryContext?: string;
	portfolioContext?: string;
	enabledSubAgents?: SubAgentId[];
	drishtiApiKey: EncryptedApiKeyCredential;
};

type CompareModelColumnProps = {
	target: ModelCompareTarget;
	encryptedConfig: EncryptedModelConfig | null;
	run: CompareRun | null;
	sharedContext: CompareSharedContext;
	catalogModels: CatalogModel[];
	toolRenderers: NonNullable<AgentChatProps["toolRenderers"]>;
	onMetaUpdate: (key: string, meta: CompareColumnMeta) => void;
	onRegisterStop: (key: string, stop: () => void) => void;
	onUseModel?: (provider: ModelProviderId, model: string) => void;
};

function columnKey(target: ModelCompareTarget): string {
	return `${target.provider}:${target.model}`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function CompareModelColumn({
	target,
	encryptedConfig,
	run,
	sharedContext,
	catalogModels,
	toolRenderers,
	onMetaUpdate,
	onRegisterStop,
	onUseModel,
}: CompareModelColumnProps) {
	const key = columnKey(target);
	const lastRunIdRef = useRef<string | null>(null);
	const hasSeededRef = useRef(false);
	const startedAtRef = useRef<number | null>(null);

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				prepareSendMessagesRequest: async ({ messages, body }) => {
					if (!encryptedConfig) {
						throw new Error("Add your API key in Configuration.");
					}
					if (!sharedContext.drishtiApiKey) {
						throw new Error("Add your Drishti MCP API key in Configuration.");
					}
					return {
						body: {
							...body,
							messages,
							modelConfig: encryptedConfig,
							drishtiApiKey: sharedContext.drishtiApiKey,
							sessionId: `compare-${key}-${run?.id ?? "idle"}`,
							memoryContext: sharedContext.memoryContext,
							portfolioContext: sharedContext.portfolioContext,
							enabledSubAgents: sharedContext.enabledSubAgents,
						},
					};
				},
			}),
		[encryptedConfig, key, run?.id, sharedContext.memoryContext, sharedContext.portfolioContext, sharedContext.enabledSubAgents],
	);

	const { messages, sendMessage, status, stop, setMessages, error } = useChat({
		id: `model-compare-${key}`,
		transport,
	});

	useEffect(() => {
		onRegisterStop(key, stop);
	}, [key, onRegisterStop, stop]);

	useEffect(() => {
		if (!run || !encryptedConfig) return;
		if (lastRunIdRef.current === run.id) return;
		lastRunIdRef.current = run.id;
		startedAtRef.current = Date.now();

		const startRun = async () => {
			if (!hasSeededRef.current && run.priorMessages.length > 0) {
				setMessages(run.priorMessages);
				hasSeededRef.current = true;
				await new Promise<void>((resolve) => {
					window.setTimeout(resolve, 0);
				});
			}
			await sendMessage({ text: run.query });
		};

		void startRun();
	}, [run?.id, encryptedConfig, sendMessage, setMessages]);

	const usage = useMemo(
		() => getLastQueryUsageFromMessages(messages),
		[messages],
	);
	const estimatedCost = useMemo(
		() =>
			usage
				? estimateQueryCostUsd(
						usage,
						target.provider,
						target.model,
						catalogModels,
					)
				: null,
		[usage, target.provider, target.model, catalogModels],
	);
	const isStreaming = status === "streaming" || status === "submitted";
	const [durationMs, setDurationMs] = useState(0);

	useEffect(() => {
		if (!startedAtRef.current) return;

		const updateDuration = () => {
			if (!startedAtRef.current) return;
			setDurationMs(Date.now() - startedAtRef.current);
		};

		updateDuration();
		if (!isStreaming) return;

		const intervalId = window.setInterval(updateDuration, 1000);
		return () => window.clearInterval(intervalId);
	}, [isStreaming, run?.id]);

	const prevMetaSignatureRef = useRef("");

	useEffect(() => {
		const meta: CompareColumnMeta = {
			provider: target.provider,
			model: target.model,
			usage,
			estimatedCost,
			durationMs,
			isStreaming,
			error: error?.message,
		};

		const signature = JSON.stringify({
			provider: meta.provider,
			model: meta.model,
			usage: meta.usage,
			estimatedCost: meta.estimatedCost,
			isStreaming: meta.isStreaming,
			error: meta.error,
			durationMs: isStreaming
				? Math.floor(meta.durationMs / 1000)
				: meta.durationMs,
		});

		if (prevMetaSignatureRef.current === signature) return;
		prevMetaSignatureRef.current = signature;
		onMetaUpdate(key, meta);
	}, [
		key,
		target.provider,
		target.model,
		usage,
		estimatedCost,
		durationMs,
		isStreaming,
		error?.message,
		onMetaUpdate,
	]);

	const displayName = getModelDisplayName(
		catalogModels,
		target.provider,
		target.model,
	);

	const listMessages =
		error && messages.length === 0
			? ([
					{
						id: `compare-error-${key}`,
						role: "assistant",
						parts: [
							{
								type: "error",
								title: "Request failed",
								message: error.message,
							},
						],
					} as unknown as UIMessage,
				] as UIMessage[])
			: messages;

	return (
		<article
			className={cn(
				"flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card",
				error && "border-destructive/40",
			)}
		>
			<header className="shrink-0 space-y-2 border-border border-b px-3 py-2.5">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate font-medium text-foreground text-sm">
							{displayName}
						</p>
						<p className="truncate text-muted-foreground text-[11px]">
							{target.model}
						</p>
					</div>
					{onUseModel && !error ? (
						<Button
							className="h-7 shrink-0 gap-1 px-2 text-xs"
							disabled={isStreaming}
							onClick={() => onUseModel(target.provider, target.model)}
							size="sm"
							variant="outline"
						>
							Use
							<ArrowRight className="size-3" />
						</Button>
					) : null}
				</div>

				<div className="flex flex-wrap gap-1.5 text-[11px]">
					<span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-foreground">
						<Coins className="size-3 text-muted-foreground" />
						{target.provider === "ollama"
							? "Local"
							: formatUsd(estimatedCost)}
					</span>
					{usage ? (
						<span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-foreground">
							{formatTokenCount(usage.totalTokens)} tokens
						</span>
					) : null}
					<span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-foreground">
						<Clock className="size-3 text-muted-foreground" />
						{formatDuration(durationMs)}
					</span>
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-hidden">
				<MessageList
					className="h-full"
					messages={listMessages}
					status={status}
					toolRenderers={toolRenderers}
				/>
			</div>
		</article>
	);
}
