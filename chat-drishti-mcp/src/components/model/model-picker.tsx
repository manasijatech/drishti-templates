"use client";

import {
	Brain,
	CaretDown,
	Check,
	Coins,
	Eye,
	Funnel,
	Lightning,
	MagnifyingGlass,
	PencilSimple,
	Star,
	Wrench,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Switch } from "~/components/ui/switch";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import { MODEL_PRESETS } from "~/lib/model-presets";
import {
	applyModelFilters,
	DEFAULT_MODEL_FILTERS,
	filterModelsForProvider,
	findCatalogModel,
	formatContextLength,
	formatPricePerMillion,
	getModelDisplayName,
	groupModelsByVendor,
	PROVIDER_OPTIONS,
	resolvePresetModel,
	toCatalogModelId,
	toProviderModelId,
	type CatalogModel,
	type ModelFilters,
} from "~/lib/openrouter-models-core";
import { isCustomModelSelection } from "~/lib/models";
import { cn } from "~/lib/utils";
import type { ModelProviderId } from "~/types";

function ModelCapabilityBadges({ model }: { model: CatalogModel }) {
	const items: { key: string; label: string; icon: typeof Brain }[] = [];

	if (model.capabilities.fast) {
		items.push({ key: "fast", label: "Fast", icon: Lightning });
	}
	if (model.capabilities.reasoning) {
		items.push({ key: "reasoning", label: "Reasoning", icon: Brain });
	}
	if (model.capabilities.vision) {
		items.push({ key: "vision", label: "Vision", icon: Eye });
	}
	if (model.capabilities.tools) {
		items.push({ key: "tools", label: "Tools", icon: Wrench });
	}

	const context = formatContextLength(model.contextLength);
	if (context) {
		return (
			<div className="flex flex-wrap items-center gap-1">
				{items.map((item) => (
					<Badge className="gap-0.5 text-[10px]" key={item.key} variant="outline">
						<item.icon className="size-2.5" weight="bold" />
						{item.label}
					</Badge>
				))}
				<Badge className="text-[10px]" variant="secondary">
					{context}
				</Badge>
				<Badge className="gap-0.5 text-[10px]" variant="outline">
					<Coins className="size-2.5" weight="bold" />
					{formatPricePerMillion(model.pricing.promptPerMillion)}
				</Badge>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-1">
			{items.map((item) => (
				<Badge className="gap-0.5 text-[10px]" key={item.key} variant="outline">
					<item.icon className="size-2.5" weight="bold" />
					{item.label}
				</Badge>
			))}
		</div>
	);
}

function ModelRow({
	model,
	selected,
	onSelect,
}: {
	model: CatalogModel;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			className={cn(
				"flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60",
				selected && "bg-muted",
			)}
			onClick={onSelect}
			type="button"
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate font-medium text-foreground text-xs">{model.name}</p>
					<p className="truncate text-muted-foreground text-[10px]">
						{model.vendorLabel}
					</p>
				</div>
				{selected ? (
					<Check className="size-3.5 shrink-0 text-primary" weight="bold" />
				) : null}
			</div>
			<ModelCapabilityBadges model={model} />
		</button>
	);
}

export function ModelPicker({
	provider,
	model,
	onModelChange,
	ollamaBaseUrl,
	compact = false,
	showPowerFilters = true,
}: {
	provider: ModelProviderId;
	model: string;
	onModelChange: (model: string) => void;
	ollamaBaseUrl?: string;
	compact?: boolean;
	showPowerFilters?: boolean;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [filters, setFilters] = useState<ModelFilters>(DEFAULT_MODEL_FILTERS);
	const [showFilters, setShowFilters] = useState(false);
	const [customMode, setCustomMode] = useState(() =>
		isCustomModelSelection(provider, model),
	);
	const [customModelId, setCustomModelId] = useState(() =>
		isCustomModelSelection(provider, model) ? model : "",
	);

	const { models, loading, error, refresh } = useModelsCatalog({
		provider,
		ollamaBaseUrl,
	});

	const providerModels = useMemo(
		() => filterModelsForProvider(models, provider),
		[models, provider],
	);

	const availableVendors = useMemo(() => {
		const vendors = new Set(providerModels.map((m) => m.vendor));
		return [...vendors].sort();
	}, [providerModels]);

	const filteredModels = useMemo(
		() => applyModelFilters(providerModels, filters),
		[providerModels, filters],
	);

	const presetEntries = useMemo(() => {
		return MODEL_PRESETS.map((preset) => ({
			preset,
			model: resolvePresetModel(preset, providerModels),
		})).filter((entry): entry is { preset: (typeof MODEL_PRESETS)[number]; model: CatalogModel } =>
			Boolean(entry.model),
		);
	}, [providerModels]);

	const groupedModels = useMemo(
		() => groupModelsByVendor(filteredModels),
		[filteredModels],
	);

	const selectedCatalog = useMemo(
		() => findCatalogModel(models, provider, model),
		[models, provider, model],
	);

	const displayLabel = useMemo(() => {
		if (customMode) return customModelId || "Custom model ID";
		return getModelDisplayName(models, provider, model) || "Select model";
	}, [customMode, customModelId, model, models, provider]);

	useEffect(() => {
		setCustomMode(isCustomModelSelection(provider, model));
		if (isCustomModelSelection(provider, model)) {
			setCustomModelId(model);
		}
	}, [provider, model]);

	useEffect(() => {
		if (!open) return;
		const handlePointerDown = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [open]);

	const selectModel = (catalogModel: CatalogModel) => {
		setCustomMode(false);
		onModelChange(toProviderModelId(provider, catalogModel.id));
		setOpen(false);
	};

	const selectPreset = (catalogModel: CatalogModel) => {
		selectModel(catalogModel);
	};

	const enableCustomMode = () => {
		setCustomMode(true);
		setOpen(false);
		onModelChange(customModelId);
	};

	return (
		<div className="space-y-2" ref={rootRef}>
			<div className="relative">
				<Button
					className={cn(
						"h-auto w-full justify-between px-2.5 py-2 text-left font-normal",
						compact && "h-8 py-1",
					)}
					onClick={() => setOpen((value) => !value)}
					type="button"
					variant="outline"
				>
					<div className="min-w-0 flex-1">
						{selectedCatalog && !customMode ? (
							<div className="space-y-1">
								<p className="truncate font-medium text-xs">{selectedCatalog.name}</p>
								{!compact ? (
									<ModelCapabilityBadges model={selectedCatalog} />
								) : (
									<p className="truncate text-muted-foreground text-[10px]">
										{selectedCatalog.vendorLabel}
									</p>
								)}
							</div>
						) : (
							<p className="truncate text-xs">{displayLabel}</p>
						)}
					</div>
					<CaretDown
						className={cn(
							"size-3.5 shrink-0 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
						weight="bold"
					/>
				</Button>

				{open ? (
					<div className="absolute top-[calc(100%+4px)] right-0 left-0 z-50 rounded-lg border border-border bg-popover shadow-lg">
						<div className="space-y-2 border-border border-b p-2">
							<div className="relative">
								<MagnifyingGlass
									className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
									weight="bold"
								/>
								<Input
									className="h-8 pl-7 text-xs"
									onChange={(e) =>
										setFilters((current) => ({
											...current,
											query: e.target.value,
										}))
									}
									placeholder="Search models..."
									value={filters.query}
								/>
							</div>

							{showPowerFilters ? (
								<div className="space-y-2">
									<button
										className="flex w-full items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
										onClick={() => setShowFilters((value) => !value)}
										type="button"
									>
										<Funnel className="size-3.5" weight="bold" />
										Filters
										<CaretDown
											className={cn(
												"size-3 transition-transform",
												showFilters && "rotate-180",
											)}
											weight="bold"
										/>
									</button>

									{showFilters ? (
										<div className="space-y-2 rounded-md bg-muted/40 p-2">
											{availableVendors.length > 1 ? (
												<div className="space-y-1">
													<Label className="text-[10px]">Provider</Label>
													<div className="flex flex-wrap gap-1">
														{availableVendors.map((vendor) => {
															const active = filters.vendors.includes(vendor);
															return (
																<Button
																	className="h-6 px-2 text-[10px]"
																	key={vendor}
																	onClick={() =>
																		setFilters((current) => ({
																			...current,
																			vendors: active
																				? current.vendors.filter((v) => v !== vendor)
																				: [...current.vendors, vendor],
																		}))
																	}
																	size="sm"
																	type="button"
																	variant={active ? "default" : "outline"}
																>
																	{vendor}
																</Button>
															);
														})}
													</div>
												</div>
											) : null}

											<div className="grid grid-cols-2 gap-2">
												{(
													[
														["reasoning", "Reasoning"],
														["vision", "Vision"],
														["tools", "Tools"],
														["fast", "Fast"],
													] as const
												).map(([key, label]) => (
													<div
														className="flex items-center justify-between gap-2"
														key={key}
													>
														<Label className="text-[10px]">{label}</Label>
														<Switch
															checked={filters[key]}
															onCheckedChange={(checked) =>
																setFilters((current) => ({
																	...current,
																	[key]: checked,
																}))
															}
															size="sm"
														/>
													</div>
												))}
											</div>

											<div className="grid grid-cols-2 gap-2">
												{(
													[
														["context128k", "128K+"],
														["context1m", "1M+"],
													] as const
												).map(([key, label]) => (
													<div
														className="flex items-center justify-between gap-2"
														key={key}
													>
														<Label className="text-[10px]">{label}</Label>
														<Switch
															checked={filters[key]}
															onCheckedChange={(checked) =>
																setFilters((current) => ({
																	...current,
																	[key]: checked,
																}))
															}
															size="sm"
														/>
													</div>
												))}
											</div>
										</div>
									) : null}
								</div>
							) : null}
						</div>

						<ScrollArea className="max-h-72">
							<div className="p-1">
								{presetEntries.length > 0 ? (
									<div className="mb-2">
										<div className="flex items-center gap-1.5 px-2 py-1">
											<Star className="size-3 text-muted-foreground" weight="fill" />
											<p className="font-medium text-muted-foreground text-[10px] uppercase tracking-wide">
												Recommended
											</p>
										</div>
										{presetEntries.map(({ preset, model: presetModel }) => {
											const PresetIcon = preset.icon;
											const selected =
												!customMode &&
												toCatalogModelId(provider, model) === presetModel.id;
											return (
												<button
													className={cn(
														"flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60",
														selected && "bg-muted",
													)}
													key={preset.id}
													onClick={() => selectPreset(presetModel)}
													type="button"
												>
													<PresetIcon
														className="size-4 shrink-0 text-muted-foreground"
														weight="duotone"
													/>
													<div className="min-w-0 flex-1">
														<p className="font-medium text-xs">{preset.label}</p>
														<p className="truncate text-muted-foreground text-[10px]">
															{presetModel.name}
														</p>
													</div>
													{selected ? (
														<Check className="size-3.5 text-primary" weight="bold" />
													) : null}
												</button>
											);
										})}
									</div>
								) : null}

								{loading ? (
									<p className="px-2 py-3 text-center text-muted-foreground text-xs">
										Loading models...
									</p>
								) : null}

								{error ? (
									<div className="space-y-2 px-2 py-3">
										<p className="text-center text-destructive text-xs">{error}</p>
										<Button
											className="h-7 w-full text-xs"
											onClick={() => void refresh()}
											size="sm"
											type="button"
											variant="outline"
										>
											Retry
										</Button>
									</div>
								) : null}

								{!loading && groupedModels.length === 0 ? (
									<p className="px-2 py-3 text-center text-muted-foreground text-xs">
										No models match your search.
									</p>
								) : null}

								{groupedModels.map((group) => (
									<div className="mb-2" key={group.vendor}>
										<p className="px-2 py-1 font-medium text-muted-foreground text-[10px] uppercase tracking-wide">
											{group.label}
										</p>
										{group.models.map((catalogModel) => (
											<ModelRow
												key={catalogModel.id}
												model={catalogModel}
												onSelect={() => selectModel(catalogModel)}
												selected={
													!customMode &&
													toCatalogModelId(provider, model) === catalogModel.id
												}
											/>
										))}
									</div>
								))}

								<button
									className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60"
									onClick={enableCustomMode}
									type="button"
								>
									<PencilSimple
										className="size-4 shrink-0 text-muted-foreground"
										weight="duotone"
									/>
									<div>
										<p className="font-medium text-xs">Custom model ID</p>
										<p className="text-muted-foreground text-[10px]">
											Enter any {PROVIDER_OPTIONS[provider].label} model slug
										</p>
									</div>
								</button>
							</div>
						</ScrollArea>
					</div>
				) : null}
			</div>

			{customMode ? (
				<div className="space-y-1.5">
					<Label className="text-xs">Model ID</Label>
					<Input
						className="h-8 text-xs"
						onChange={(e) => {
							const value = e.target.value.trim();
							setCustomModelId(value);
							onModelChange(value);
						}}
						placeholder={
							provider === "openrouter"
								? "google/gemini-2.5-flash"
								: provider === "ollama"
									? "llama3.2"
									: "gpt-4.1"
						}
						value={customModelId}
					/>
				</div>
			) : null}
		</div>
	);
}

export function ProviderSelect({
	provider,
	onProviderChange,
	compact = false,
}: {
	provider: ModelProviderId;
	onProviderChange: (provider: ModelProviderId) => void;
	compact?: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-xs">Provider</Label>
			<div className="grid grid-cols-2 gap-1.5">
				{Object.entries(PROVIDER_OPTIONS).map(([id, opt]) => {
					const active = provider === id;
					return (
						<Button
							className={cn("h-8 justify-start text-xs", compact && "h-7")}
							key={id}
							onClick={() => onProviderChange(id as ModelProviderId)}
							type="button"
							variant={active ? "default" : "outline"}
						>
							{opt.label}
						</Button>
					);
				})}
			</div>
		</div>
	);
}
