"use client";

import { Info } from "@phosphor-icons/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	estimateQueryCostUsd,
	formatTokenCount,
	formatUsd,
} from "~/lib/query-cost";
import type { CatalogModel } from "~/lib/openrouter-models-core";
import type { ModelProviderId, QueryUsageMetadata } from "~/types";

type QueryCostMenuProps = {
	lastQueryUsage: QueryUsageMetadata | null;
	sessionUsage: QueryUsageMetadata;
	provider: ModelProviderId;
	modelId: string;
	catalogModels: CatalogModel[];
	isStreaming?: boolean;
};

function UsageSection({
	title,
	usage,
	provider,
	modelId,
	catalogModels,
}: {
	title: string;
	usage: QueryUsageMetadata | null;
	provider: ModelProviderId;
	modelId: string;
	catalogModels: CatalogModel[];
}) {
	if (!usage || usage.totalTokens <= 0) {
		return (
			<div className="space-y-1 px-1.5 py-1">
				<p className="font-medium text-foreground text-xs">{title}</p>
				<p className="text-muted-foreground text-xs">No usage yet</p>
			</div>
		);
	}

	const estimatedCost = estimateQueryCostUsd(
		usage,
		provider,
		modelId,
		catalogModels,
	);

	return (
		<div className="space-y-1.5 px-1.5 py-1">
			<p className="font-medium text-foreground text-xs">{title}</p>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-muted-foreground text-xs">Estimated cost</span>
				<span className="type-mono-data font-medium text-foreground text-xs">
					{provider === "ollama" ? "Local" : formatUsd(estimatedCost)}
				</span>
			</div>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-muted-foreground text-xs">Total tokens</span>
				<span className="type-mono-data text-foreground text-xs">
					{formatTokenCount(usage.totalTokens)}
				</span>
			</div>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-muted-foreground text-xs">Input</span>
				<span className="type-mono-data text-foreground text-xs">
					{formatTokenCount(usage.promptTokens)}
				</span>
			</div>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-muted-foreground text-xs">Output</span>
				<span className="type-mono-data text-foreground text-xs">
					{formatTokenCount(usage.completionTokens)}
				</span>
			</div>
			{usage.requests > 1 ? (
				<div className="flex items-baseline justify-between gap-3">
					<span className="text-muted-foreground text-xs">Model calls</span>
					<span className="type-mono-data text-foreground text-xs">
						{usage.requests}
					</span>
				</div>
			) : null}
		</div>
	);
}

export function QueryCostMenu({
	lastQueryUsage,
	sessionUsage,
	provider,
	modelId,
	catalogModels,
	isStreaming = false,
}: QueryCostMenuProps) {
	const lastCost = lastQueryUsage
		? estimateQueryCostUsd(
				lastQueryUsage,
				provider,
				modelId,
				catalogModels,
			)
		: null;
	const hasUsage = sessionUsage.totalTokens > 0 || Boolean(lastQueryUsage);
	const buttonLabel =
		provider === "ollama"
			? "Local"
			: lastCost !== null
				? formatUsd(lastCost)
				: hasUsage
					? formatTokenCount(lastQueryUsage?.totalTokens ?? 0)
					: "Usage";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Query usage and cost"
				className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground text-xs hover:bg-muted/50 hover:text-foreground"
			>
				<Info className="size-3.5" weight="regular" />
				<span className="type-mono-data hidden sm:inline">{buttonLabel}</span>
				{isStreaming ? (
					<span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
				) : null}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56 p-1">
				<p className="px-1.5 py-1 font-medium text-muted-foreground text-xs">
					Query usage
				</p>
				<UsageSection
					catalogModels={catalogModels}
					modelId={modelId}
					provider={provider}
					title="This query"
					usage={lastQueryUsage}
				/>
				<DropdownMenuSeparator />
				<UsageSection
					catalogModels={catalogModels}
					modelId={modelId}
					provider={provider}
					title="This chat"
					usage={sessionUsage.totalTokens > 0 ? sessionUsage : null}
				/>
				<p className="px-1.5 py-1 text-[10px] text-muted-foreground leading-relaxed">
					{provider === "ollama"
						? "Ollama runs locally with no API billing."
						: "Costs are estimated from model pricing and include all agent steps."}
				</p>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
