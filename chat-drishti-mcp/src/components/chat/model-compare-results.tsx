"use client";

import { X } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentChatProps } from "~/components/agent-elements/types";
import {
	type CompareColumnKey,
	type CompareColumnMeta,
	CompareModelColumn,
	type CompareRun,
	compareColumnKey,
} from "~/components/chat/compare-model-column";
import { Button } from "~/components/ui/button";
import {
	type ComparisonExportResult,
	hasExportableChatContent,
} from "~/lib/chat-export";
import {
	type CatalogModel,
	getModelDisplayName,
} from "~/lib/openrouter-models-core";
import { formatUsd } from "~/lib/query-cost";
import type {
	EncryptedApiKeyCredential,
	EncryptedModelConfig,
	ModelCompareTarget,
	ModelProviderId,
	SubAgentId,
} from "~/types";

type SortKey = "cost" | "tokens" | "duration";

type ModelCompareResultsProps = {
	compareModels: ModelCompareTarget[];
	run: CompareRun;
	catalogModels: CatalogModel[];
	getEncryptedConfigForTarget: (
		target: ModelCompareTarget,
	) => EncryptedModelConfig | null;
	sharedContext: {
		sessionId?: string;
		memoryContext?: string;
		portfolioContext?: string;
		enabledSubAgents?: SubAgentId[];
		drishtiApiKey: EncryptedApiKeyCredential;
	};
	toolRenderers: NonNullable<AgentChatProps["toolRenderers"]>;
	onClose: () => void;
	onUseModel?: (provider: ModelProviderId, model: string) => void;
	onRegisterStop?: (stopAll: () => void) => void;
	onStreamingChange?: (streaming: boolean) => void;
	onExportChange?: (results: ComparisonExportResult[]) => void;
};

export function ModelCompareResults({
	compareModels,
	run,
	catalogModels,
	getEncryptedConfigForTarget,
	sharedContext,
	toolRenderers,
	onClose,
	onUseModel,
	onRegisterStop,
	onStreamingChange,
	onExportChange,
}: ModelCompareResultsProps) {
	const [sortBy, setSortBy] = useState<SortKey>("cost");
	const [columnMeta, setColumnMeta] = useState<
		Partial<Record<CompareColumnKey, CompareColumnMeta>>
	>({});
	const stopHandlersRef = useRef<Partial<Record<CompareColumnKey, () => void>>>(
		{},
	);
	const [columnMessages, setColumnMessages] = useState<
		Partial<Record<CompareColumnKey, UIMessage[]>>
	>({});

	const handleMetaUpdate = useCallback(
		(key: CompareColumnKey, meta: CompareColumnMeta) => {
			setColumnMeta((current) => {
				const prev = current[key];
				if (
					prev &&
					prev.provider === meta.provider &&
					prev.model === meta.model &&
					prev.usage === meta.usage &&
					prev.estimatedCost === meta.estimatedCost &&
					prev.isStreaming === meta.isStreaming &&
					prev.error === meta.error &&
					prev.durationMs === meta.durationMs
				) {
					return current;
				}
				return { ...current, [key]: meta };
			});
		},
		[],
	);

	const handleRegisterStop = useCallback(
		(key: CompareColumnKey, stop: () => void) => {
			stopHandlersRef.current[key] = stop;
		},
		[],
	);

	const handleMessagesUpdate = useCallback(
		(key: CompareColumnKey, messages: UIMessage[]) => {
			setColumnMessages((current) =>
				current[key] === messages ? current : { ...current, [key]: messages },
			);
		},
		[],
	);

	const stopAll = useCallback(() => {
		for (const stop of Object.values(stopHandlersRef.current)) {
			stop?.();
		}
	}, []);

	useEffect(() => {
		onRegisterStop?.(stopAll);
	}, [onRegisterStop, stopAll]);

	const sortedModels = useMemo(() => {
		return [...compareModels].sort((a, b) => {
			const aKey = compareColumnKey(a);
			const bKey = compareColumnKey(b);
			const aMeta = columnMeta[aKey];
			const bMeta = columnMeta[bKey];

			if (sortBy === "cost") {
				const aCost = aMeta?.estimatedCost ?? Number.POSITIVE_INFINITY;
				const bCost = bMeta?.estimatedCost ?? Number.POSITIVE_INFINITY;
				return aCost - bCost;
			}
			if (sortBy === "tokens") {
				return (
					(bMeta?.usage?.totalTokens ?? 0) - (aMeta?.usage?.totalTokens ?? 0)
				);
			}
			return (bMeta?.durationMs ?? 0) - (aMeta?.durationMs ?? 0);
		});
	}, [compareModels, columnMeta, sortBy]);

	const totalCost = useMemo(() => {
		let sum = 0;
		let hasCost = false;
		for (const meta of Object.values(columnMeta)) {
			if (!meta) continue;
			if (meta.estimatedCost === null) continue;
			hasCost = true;
			sum += meta.estimatedCost;
		}
		return hasCost ? sum : null;
	}, [columnMeta]);

	const allModelsReported = compareModels.every(
		(target) => columnMeta[compareColumnKey(target)],
	);
	const isAnyStreaming =
		!allModelsReported ||
		Object.values(columnMeta).some((meta) => meta?.isStreaming);

	useEffect(() => {
		onStreamingChange?.(isAnyStreaming);
	}, [isAnyStreaming, onStreamingChange]);

	useEffect(() => {
		const results = compareModels
			.map((target) => {
				const messages = columnMessages[compareColumnKey(target)] ?? [];
				return {
					label: getModelDisplayName(
						catalogModels,
						target.provider,
						target.model,
					),
					messages,
				};
			})
			.filter(({ messages }) => hasExportableChatContent(messages));
		onExportChange?.(results);
	}, [catalogModels, columnMessages, compareModels, onExportChange]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-4 py-3">
				<div className="min-w-0 space-y-0.5">
					<p className="font-medium text-foreground text-sm">
						Model comparison
					</p>
					<p className="truncate text-muted-foreground text-xs">{run.query}</p>
				</div>
				<div className="flex items-center gap-2">
					{totalCost !== null ? (
						<span className="type-mono-data rounded-md border border-border bg-muted/50 px-2 py-1 text-foreground text-xs">
							Total {formatUsd(totalCost)}
						</span>
					) : null}
					{isAnyStreaming ? (
						<span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
							Running…
						</span>
					) : null}
					<Button
						aria-label="Close comparison"
						className="size-8"
						onClick={onClose}
						size="icon"
						variant="ghost"
					>
						<X className="size-4" />
					</Button>
				</div>
			</div>

			<div className="flex items-center gap-2 border-border border-b px-4 py-2">
				<span className="text-muted-foreground text-xs">Sort by</span>
				{(["cost", "tokens", "duration"] as const).map((key) => (
					<Button
						className="h-7 px-2 text-xs"
						key={key}
						onClick={() => setSortBy(key)}
						size="sm"
						variant={sortBy === key ? "secondary" : "ghost"}
					>
						{key === "cost" ? "Cost" : key === "tokens" ? "Tokens" : "Time"}
					</Button>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div
					className={
						sortedModels.length > 1
							? "grid gap-4 md:grid-cols-2"
							: "grid grid-cols-1 gap-4"
					}
				>
					{sortedModels.map((target) => {
						const key = compareColumnKey(target);
						return (
							<CompareModelColumn
								catalogModels={catalogModels}
								encryptedConfig={getEncryptedConfigForTarget(target)}
								key={key}
								onMessagesUpdate={handleMessagesUpdate}
								onMetaUpdate={handleMetaUpdate}
								onRegisterStop={handleRegisterStop}
								onUseModel={onUseModel}
								run={run}
								sharedContext={sharedContext}
								target={target}
								toolRenderers={toolRenderers}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}

export type { CompareRun };
