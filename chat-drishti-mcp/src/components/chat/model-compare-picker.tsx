"use client";

import { Check, MagnifyingGlass, Scales, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import {
	MODEL_COMPARE_MAX,
	MODEL_COMPARE_MIN,
} from "~/lib/model-compare";
import {
	filterModelsForProvider,
	getModelDisplayName,
	toCatalogModelId,
	type CatalogModel,
} from "~/lib/openrouter-models-core";
import { cn } from "~/lib/utils";
import { useModelStore } from "~/stores";
import type { ModelCompareTarget, ModelProviderId } from "~/types";

function targetKey(target: ModelCompareTarget): string {
	return `${target.provider}:${toCatalogModelId(target.provider, target.model)}`;
}

type ModelComparePickerProps = {
	provider: ModelProviderId;
	compact?: boolean;
};

const BROWSE_PAGE_SIZE = 40;

export function ModelComparePicker({
	provider,
	compact = false,
}: ModelComparePickerProps) {
	const {
		compareMode,
		compareModels,
		setCompareMode,
		toggleCompareModel,
		hasStoredApiKey,
	} = useModelStore();
	const { models: catalogModels } = useModelsCatalog({ provider });
	const [search, setSearch] = useState("");

	const selectedForProvider = useMemo(
		() => compareModels.filter((entry) => entry.provider === provider),
		[compareModels, provider],
	);

	const selectedKeys = useMemo(
		() => new Set(selectedForProvider.map(targetKey)),
		[selectedForProvider],
	);

	const browseModels = useMemo(() => {
		const providerModels = filterModelsForProvider(catalogModels, provider);
		const query = search.trim().toLowerCase();

		const matchesSearch = (model: CatalogModel) =>
			!query ||
			model.name.toLowerCase().includes(query) ||
			model.id.toLowerCase().includes(query);

		return providerModels.filter(
			(model) =>
				!selectedKeys.has(`${provider}:${toCatalogModelId(provider, model.id)}`) &&
				matchesSearch(model),
		);
	}, [catalogModels, provider, search, selectedKeys]);

	const browseResetKey = `${provider}:${search}:${selectedForProvider.length}:${browseModels.length}`;

	const canCompare = hasStoredApiKey(provider) || provider === "ollama";

	return (
		<div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="flex items-center gap-1.5">
						<Scales className="size-3.5 text-muted-foreground" weight="light" />
						<Label className="text-xs">Compare models</Label>
					</div>
					<p className="type-body-prose text-[11px] text-muted-foreground leading-relaxed">
						Run one query on {MODEL_COMPARE_MIN}–{MODEL_COMPARE_MAX} models in
						parallel and review answers with cost.
					</p>
				</div>
				<Switch
					checked={compareMode}
					disabled={!canCompare}
					onCheckedChange={setCompareMode}
				/>
			</div>

			{compareMode ? (
				<div className="space-y-3">
					<div className="space-y-2">
						<div className="flex items-center justify-between gap-2">
							<p className="font-medium text-foreground text-xs">
								Selected models
							</p>
							<p className="text-[11px] text-muted-foreground">
								{selectedForProvider.length}/{MODEL_COMPARE_MAX} (min{" "}
								{MODEL_COMPARE_MIN})
							</p>
						</div>

						{selectedForProvider.length === 0 ? (
							<p className="rounded-md border border-border/60 border-dashed bg-background px-3 py-2.5 text-center text-muted-foreground text-xs">
								No models selected yet. Pick from the list below.
							</p>
						) : (
							<div className="space-y-1 rounded-md border border-border/60 bg-background p-1">
								{selectedForProvider.map((target) => (
									<SelectedModelRow
										catalogModels={catalogModels}
										key={targetKey(target)}
										onRemove={() => toggleCompareModel(target)}
										provider={provider}
										target={target}
									/>
								))}
							</div>
						)}
					</div>

					<div className="space-y-2">
						<p className="font-medium text-foreground text-xs">Add models</p>
						<div className="relative">
							<MagnifyingGlass
								className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
								weight="light"
							/>
							<Input
								className="h-8 pl-8 text-xs"
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search models to compare"
								value={search}
							/>
						</div>

						<CompareModelBrowseList
							browseModels={browseModels}
							browseResetKey={browseResetKey}
							catalogModels={catalogModels}
							compact={compact}
							disabled={selectedForProvider.length >= MODEL_COMPARE_MAX}
							onSelect={(modelId) =>
								toggleCompareModel({ provider, model: modelId })
							}
							provider={provider}
							selectionFull={selectedForProvider.length >= MODEL_COMPARE_MAX}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

function CompareModelBrowseList({
	browseModels,
	browseResetKey,
	catalogModels,
	provider,
	onSelect,
	disabled,
	selectionFull,
	compact,
}: {
	browseModels: CatalogModel[];
	browseResetKey: string;
	catalogModels: CatalogModel[];
	provider: ModelProviderId;
	onSelect: (modelId: string) => void;
	disabled: boolean;
	selectionFull: boolean;
	compact?: boolean;
}) {
	const [visibleCount, setVisibleCount] = useState(BROWSE_PAGE_SIZE);
	const scrollRef = useRef<HTMLDivElement>(null);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setVisibleCount(BROWSE_PAGE_SIZE);
		scrollRef.current?.scrollTo({ top: 0 });
	}, [browseResetKey]);

	const visibleModels = useMemo(
		() => browseModels.slice(0, visibleCount),
		[browseModels, visibleCount],
	);
	const hasMore = visibleCount < browseModels.length;

	useEffect(() => {
		const root = scrollRef.current;
		const sentinel = loadMoreRef.current;
		if (!root || !sentinel || !hasMore) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				setVisibleCount((current) =>
					Math.min(current + BROWSE_PAGE_SIZE, browseModels.length),
				);
			},
			{ root, rootMargin: "120px" },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [browseModels.length, hasMore]);

	if (browseModels.length === 0) {
		return (
			<div
				className={cn(
					"rounded-md border border-border/60 bg-background p-1",
					compact ? "max-h-40" : "max-h-48",
				)}
			>
				<p className="px-2 py-3 text-center text-muted-foreground text-xs">
					{selectionFull
						? "Maximum models selected. Remove one to add another."
						: "No models match your search."}
				</p>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background p-1",
				compact && "max-h-40",
			)}
			ref={scrollRef}
		>
			{visibleModels.map((model) => (
				<CompareModelRow
					catalogModels={catalogModels}
					disabled={disabled}
					key={model.id}
					model={model}
					onToggle={() => onSelect(model.id)}
					provider={provider}
				/>
			))}
			{hasMore ? (
				<div
					className="px-2 py-2 text-center text-[10px] text-muted-foreground"
					ref={loadMoreRef}
				>
					Scroll for more ({visibleModels.length} of {browseModels.length})
				</div>
			) : browseModels.length > BROWSE_PAGE_SIZE ? (
				<p className="px-2 py-2 text-center text-[10px] text-muted-foreground">
					All {browseModels.length} models loaded
				</p>
			) : null}
		</div>
	);
}

function SelectedModelRow({
	target,
	provider,
	catalogModels,
	onRemove,
}: {
	target: ModelCompareTarget;
	provider: ModelProviderId;
	catalogModels: CatalogModel[];
	onRemove: () => void;
}) {
	const displayName = getModelDisplayName(
		catalogModels,
		provider,
		target.model,
	);

	return (
		<div className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5">
			<span className="flex size-4 shrink-0 items-center justify-center rounded border border-primary bg-primary text-primary-foreground">
				<Check className="size-2.5" weight="bold" />
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-foreground text-xs">
					{displayName}
				</p>
				<p className="truncate text-[10px] text-muted-foreground">
					{target.model}
				</p>
			</div>
			<button
				aria-label={`Remove ${displayName}`}
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
				onClick={onRemove}
				type="button"
			>
				<X className="size-3.5" />
			</button>
		</div>
	);
}

function CompareModelRow({
	model,
	provider,
	onToggle,
	catalogModels,
	disabled = false,
}: {
	model: CatalogModel;
	provider: ModelProviderId;
	onToggle: () => void;
	catalogModels: CatalogModel[];
	disabled?: boolean;
}) {
	const displayName = getModelDisplayName(catalogModels, provider, model.id);

	return (
		<button
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
				disabled
					? "cursor-not-allowed opacity-50"
					: "text-foreground hover:bg-muted/60",
			)}
			disabled={disabled}
			onClick={onToggle}
			type="button"
		>
			<span className="flex size-4 shrink-0 items-center justify-center rounded border border-border bg-background" />
			<span className="min-w-0 flex-1 truncate">{displayName}</span>
		</button>
	);
}
