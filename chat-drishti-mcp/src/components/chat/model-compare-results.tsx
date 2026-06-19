"use client";

import { X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentChatProps } from "~/components/agent-elements/types";
import {
	CompareModelColumn,
	type CompareColumnMeta,
	type CompareRun,
} from "~/components/chat/compare-model-column";
import { Button } from "~/components/ui/button";
import { formatUsd } from "~/lib/query-cost";
import type { CatalogModel } from "~/lib/openrouter-models-core";
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
}: ModelCompareResultsProps) {
	const [sortBy, setSortBy] = useState<SortKey>("cost");
	const [columnMeta, setColumnMeta] = useState<Record<string, CompareColumnMeta>>(
		{},
	);
	const stopHandlersRef = useRef<Record<string, () => void>>({});

	const handleMetaUpdate = useCallback((key: string, meta: CompareColumnMeta) => {
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
	}, []);

	const handleRegisterStop = useCallback((key: string, stop: () => void) => {
		stopHandlersRef.current[key] = stop;
	}, []);

	const stopAll = useCallback(() => {
		for (const stop of Object.values(stopHandlersRef.current)) {
			stop();
		}
	}, []);

	useEffect(() => {
		onRegisterStop?.(stopAll);
	}, [onRegisterStop, stopAll]);

	const sortedModels = useMemo(() => {
		return [...compareModels].sort((a, b) => {
			const aKey = `${a.provider}:${a.model}`;
			const bKey = `${b.provider}:${b.model}`;
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
			if (meta.estimatedCost === null) continue;
			hasCost = true;
			sum += meta.estimatedCost;
		}
		return hasCost ? sum : null;
	}, [columnMeta]);

	const isAnyStreaming = Object.values(columnMeta).some((meta) => meta.isStreaming);

	useEffect(() => {
		onStreamingChange?.(isAnyStreaming);
	}, [isAnyStreaming, onStreamingChange]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-4 py-3">
				<div className="min-w-0 space-y-0.5">
					<p className="font-medium text-foreground text-sm">Model comparison</p>
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
						const key = `${target.provider}:${target.model}`;
						return (
							<CompareModelColumn
								catalogModels={catalogModels}
								encryptedConfig={getEncryptedConfigForTarget(target)}
								key={key}
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
