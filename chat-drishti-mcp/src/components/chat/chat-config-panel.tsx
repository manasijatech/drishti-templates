"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
	CaretRight,
	ChartPieSlice,
	Cpu,
	Plus,
	SlidersHorizontal,
	Trash,
} from "@phosphor-icons/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Switch } from "~/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { ModelPicker, ProviderSelect } from "~/components/model/model-picker";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import { cn } from "~/lib/utils";
import { SUB_AGENT_OPTIONS, normalizeSubAgentPreferences } from "~/lib/sub-agents";
import { useMemoryStore, useModelStore } from "~/stores";
import { isValidModelForProvider } from "~/lib/models";
import type { PortfolioHolding } from "~/types";

type ConfigSectionId = "model" | "preferences" | "portfolio";

function ConfigDropdown({
	title,
	icon: Icon,
	open,
	onToggle,
	children,
}: {
	title: string;
	icon: typeof Cpu;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
}) {
	return (
		<div className="border-border border-b last:border-b-0">
			<button
				className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
				onClick={onToggle}
				type="button"
			>
				<Icon className="size-4 shrink-0 text-muted-foreground" weight="light" />
				<span className="flex-1 font-medium text-foreground text-sm">{title}</span>
				<CaretRight
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
						open && "rotate-90",
					)}
					weight="bold"
				/>
			</button>
			{open ? <div className="space-y-3 px-3 pt-1 pb-3">{children}</div> : null}
		</div>
	);
}
function HoldingRow({
	holding,
	onChange,
	onRemove,
}: {
	holding: PortfolioHolding;
	onChange: (h: PortfolioHolding) => void;
	onRemove: () => void;
}) {
	const currentValue = holding.quantity * holding.averagePrice;
	return (
		<div className="grid grid-cols-[1fr_56px_72px_64px_32px] items-center gap-1.5">
			<Input
				className="h-8 text-xs"
				onChange={(e) =>
					onChange({ ...holding, symbol: e.target.value.toUpperCase() })
				}
				placeholder="RELIANCE"
				value={holding.symbol}
			/>
			<Input
				className="h-8 text-xs"
				min={0}
				onChange={(e) =>
					onChange({ ...holding, quantity: Number(e.target.value) || 0 })
				}
				placeholder="Qty"
				type="number"
				value={holding.quantity || ""}
			/>
			<Input
				className="h-8 text-xs"
				min={0}
				onChange={(e) =>
					onChange({
						...holding,
						averagePrice: Number(e.target.value) || 0,
					})
				}
				placeholder="Avg ₹"
				type="number"
				value={holding.averagePrice || ""}
			/>
			<span className="type-mono-data text-muted-foreground text-xs">
				₹{currentValue.toLocaleString("en-IN")}
			</span>
			<Button className="size-8" onClick={onRemove} size="icon" variant="ghost">
				<Trash className="size-3.5" />
			</Button>
		</div>
	);
}

export function ChatConfigPanelContent({
	focusModelSignal = 0,
	apiKeyInputId = "chat-apiKey",
}: {
	focusModelSignal?: number;
	apiKeyInputId?: string;
}) {
	const {
		activeProvider,
		activeModel,
		setActiveModel,
		setActiveProvider,
		saveConfig,
		configs,
	} = useModelStore();
	const {
		preferences,
		updatePreferences,
		portfolios,
		watchlists,
		addPortfolio,
		updatePortfolio,
		removePortfolio,
		addWatchlist,
		removeWatchlist,
	} = useMemoryStore();

	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newPortfolioName, setNewPortfolioName] = useState("");
	const [newWatchlistName, setNewWatchlistName] = useState("");
	const [newWatchlistSymbols, setNewWatchlistSymbols] = useState("");
	const [editingHoldings, setEditingHoldings] = useState<
		Record<string, PortfolioHolding[]>
	>({});
	const [openSection, setOpenSection] = useState<ConfigSectionId | null>("model");

	const toggleSection = (section: ConfigSectionId) => {
		setOpenSection((current) => (current === section ? null : section));
	};

	useEffect(() => {
		if (focusModelSignal === 0) return;
		setOpenSection("model");
		const timer = window.setTimeout(() => {
			document.getElementById(apiKeyInputId)?.focus();
		}, 50);
		return () => window.clearTimeout(timer);
	}, [focusModelSignal, apiKeyInputId]);

	const existingConfig = configs.find((c) => c.provider === activeProvider);
	const subAgentPrefs = normalizeSubAgentPreferences(preferences.subAgents);
	const { models: catalogModels } = useModelsCatalog({
		provider: activeProvider,
		ollamaBaseUrl: baseUrl || existingConfig?.baseUrl,
	});

	const handleSave = async () => {
		setError(null);
		if (!isValidModelForProvider(activeProvider, activeModel, catalogModels)) {
			setError("Select or enter a valid model ID before saving.");
			return;
		}
		try {
			const trimmedKey = apiKey.trim();
			if (activeProvider !== "ollama" && !trimmedKey) {
				const existing = useModelStore
					.getState()
					.configs.find((c) => c.provider === activeProvider);
				if (!existing?.encryptedApiKey) {
					setError("Enter an API key before saving.");
					return;
				}
			}

			await saveConfig({
				provider: activeProvider,
				model: activeModel,
				apiKey: trimmedKey,
				baseUrl: baseUrl || undefined,
			});
			setSaved(true);
			setApiKey("");
			setTimeout(() => setSaved(false), 2000);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save");
		}
	};

	const getHoldings = (portfolioId: string, defaultHoldings: PortfolioHolding[]) =>
		editingHoldings[portfolioId] ?? defaultHoldings;

	const saveHoldings = (portfolioId: string) => {
		const holdings = editingHoldings[portfolioId];
		if (holdings) {
			updatePortfolio(portfolioId, { holdings });
		}
	};

	return (
		<div className="py-1">
			<ConfigDropdown
				icon={Cpu}
				onToggle={() => toggleSection("model")}
				open={openSection === "model"}
				title="Model"
			>
				<p className="type-body-prose text-xs">
					Provider, model, and API key. Keys are encrypted server-side and stored
					locally as ciphertext.
				</p>
				<div className="space-y-3">
					<ProviderSelect
						compact
						onProviderChange={setActiveProvider}
						provider={activeProvider}
					/>

					<div className="space-y-1.5">
						<Label className="text-xs">Model</Label>
						<ModelPicker
							compact
							model={activeModel}
							ollamaBaseUrl={baseUrl || existingConfig?.baseUrl}
							onModelChange={(nextModel) =>
								setActiveModel(activeProvider, nextModel)
							}
							provider={activeProvider}
						/>
					</div>

					<div className="space-y-1.5">
						<Label className="text-xs" htmlFor={apiKeyInputId}>
							API Key
							{existingConfig ? (
								<span className="ml-1.5 text-emerald-600 text-xs">(saved)</span>
							) : null}
						</Label>
						<Input
							className="h-8 text-xs"
							id={apiKeyInputId}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder={
								activeProvider === "ollama"
									? "Optional for local Ollama"
									: "Enter API key"
							}
							type="password"
							value={apiKey}
						/>
					</div>

					{(activeProvider === "openrouter" || activeProvider === "ollama") && (
						<div className="space-y-1.5">
							<Label className="text-xs" htmlFor="chat-baseUrl">
								Base URL (optional)
							</Label>
							<Input
								className="h-8 text-xs"
								id="chat-baseUrl"
								onChange={(e) => setBaseUrl(e.target.value)}
								placeholder={
									activeProvider === "ollama"
										? "http://localhost:11434/v1"
										: "https://openrouter.ai/api/v1"
								}
								value={baseUrl}
							/>
						</div>
					)}

					{error ? <p className="text-destructive text-xs">{error}</p> : null}

					<Button className="h-8 w-full text-xs" onClick={handleSave}>
						{saved ? "Saved!" : "Save configuration"}
					</Button>
				</div>
			</ConfigDropdown>

			<ConfigDropdown
				icon={SlidersHorizontal}
				onToggle={() => toggleSection("preferences")}
				open={openSection === "preferences"}
				title="Preferences"
			>
				<p className="type-body-prose text-xs">
					Included in agent context automatically.
				</p>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label className="text-xs">Risk profile</Label>
						<Select
							onValueChange={(v) =>
								updatePreferences({
									riskProfile: v as "conservative" | "moderate" | "aggressive",
								})
							}
							value={preferences.riskProfile}
						>
							<SelectTrigger className="h-8 w-full text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="conservative">Conservative</SelectItem>
								<SelectItem value="moderate">Moderate</SelectItem>
								<SelectItem value="aggressive">Aggressive</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<Label className="text-xs" htmlFor="chat-sectors">
							Favorite sectors
						</Label>
						<Input
							className="h-8 text-xs"
							id="chat-sectors"
							onChange={(e) =>
								updatePreferences({
									favoriteSectors: e.target.value
										.split(",")
										.map((s) => s.trim())
										.filter(Boolean),
								})
							}
							placeholder="IT, Banking, Pharma"
							value={preferences.favoriteSectors.join(", ")}
						/>
					</div>

					<div className="space-y-2">
						<div>
							<Label className="text-xs">Sub-agents</Label>
							<p className="type-body-prose mt-1 text-xs">
								Toggle specialist delegation. Drishti MCP tools always stay
								available on the supervisor.
							</p>
						</div>
						{SUB_AGENT_OPTIONS.map((agent) => (
							<div
								className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 px-2.5 py-2"
								key={agent.id}
							>
								<div className="min-w-0">
									<p className="font-medium text-foreground text-xs">
										{agent.label}
									</p>
									<p className="type-body-prose text-muted-foreground text-xs">
										{agent.description}
									</p>
								</div>
								<Switch
									checked={subAgentPrefs[agent.id]}
									onCheckedChange={(checked) =>
										updatePreferences({
											subAgents: {
												...subAgentPrefs,
												[agent.id]: checked,
											},
										})
									}
									size="sm"
								/>
							</div>
						))}
					</div>
				</div>
			</ConfigDropdown>

			<ConfigDropdown
				icon={ChartPieSlice}
				onToggle={() => toggleSection("portfolio")}
				open={openSection === "portfolio"}
				title="Portfolio"
			>
				<p className="type-body-prose text-xs">
					Holdings and watchlists shared with the assistant.
				</p>
				<div className="space-y-4">
					<div className="flex gap-2">
						<Input
							className="h-8 text-xs"
							onChange={(e) => setNewPortfolioName(e.target.value)}
							placeholder="Portfolio name"
							value={newPortfolioName}
						/>
						<Button
							className="h-8 shrink-0 text-xs"
							onClick={() => {
								if (!newPortfolioName.trim()) return;
								addPortfolio({
									name: newPortfolioName.trim(),
									holdings: [],
								});
								setNewPortfolioName("");
							}}
							size="sm"
						>
							<Plus className="mr-1 size-3.5" />
							Add
						</Button>
					</div>

					{portfolios.map((portfolio) => {
						const holdings = getHoldings(portfolio.id, portfolio.holdings);
						const totalInvested = holdings.reduce(
							(sum, h) => sum + h.quantity * h.averagePrice,
							0,
						);

						return (
							<div
								className="space-y-2 rounded-lg bg-muted/40 p-3"
								key={portfolio.id}
							>
								<div className="flex items-start justify-between gap-2">
									<div>
										<p className="font-medium text-sm">{portfolio.name}</p>
										<p className="type-mono-data text-muted-foreground text-xs">
											{holdings.length} holdings · ₹
											{totalInvested.toLocaleString("en-IN")}
										</p>
									</div>
									<Button
										className="size-7"
										onClick={() => removePortfolio(portfolio.id)}
										size="icon"
										variant="ghost"
									>
										<Trash className="size-3.5" />
									</Button>
								</div>

								{holdings.map((holding, idx) => (
									<HoldingRow
										holding={holding}
										key={`${portfolio.id}-${idx}`}
										onChange={(h) => {
											const updated = [...holdings];
											updated[idx] = h;
											setEditingHoldings((prev) => ({
												...prev,
												[portfolio.id]: updated,
											}));
										}}
										onRemove={() => {
											const updated = holdings.filter((_, i) => i !== idx);
											setEditingHoldings((prev) => ({
												...prev,
												[portfolio.id]: updated,
											}));
										}}
									/>
								))}

								<div className="flex gap-2">
									<Button
										className="h-7 text-xs"
										onClick={() => {
											const current = getHoldings(
												portfolio.id,
												portfolio.holdings,
											);
											setEditingHoldings((prev) => ({
												...prev,
												[portfolio.id]: [
													...current,
													{ symbol: "", quantity: 0, averagePrice: 0 },
												],
											}));
										}}
										size="sm"
										variant="outline"
									>
										<Plus className="mr-1 size-3.5" />
										Holding
									</Button>
									<Button
										className="h-7 text-xs"
										onClick={() => saveHoldings(portfolio.id)}
										size="sm"
									>
										Save
									</Button>
								</div>
							</div>
						);
					})}

					{portfolios.length === 0 ? (
						<p className="text-center text-muted-foreground text-xs">
							No portfolios yet.
						</p>
					) : null}

					<div className="space-y-2 pt-1">
						<p className="font-medium text-foreground text-xs">Watchlists</p>
						<Input
							className="h-8 text-xs"
							onChange={(e) => setNewWatchlistName(e.target.value)}
							placeholder="Watchlist name"
							value={newWatchlistName}
						/>
						<Input
							className="h-8 text-xs"
							onChange={(e) => setNewWatchlistSymbols(e.target.value)}
							placeholder="TCS, INFY, RELIANCE"
							value={newWatchlistSymbols}
						/>
						<Button
							className="h-8 w-full text-xs"
							onClick={() => {
								if (!newWatchlistName.trim()) return;
								addWatchlist({
									name: newWatchlistName.trim(),
									symbols: newWatchlistSymbols
										.split(",")
										.map((s) => s.trim().toUpperCase())
										.filter(Boolean),
								});
								setNewWatchlistName("");
								setNewWatchlistSymbols("");
							}}
							size="sm"
							variant="outline"
						>
							<Plus className="mr-1 size-3.5" />
							Add watchlist
						</Button>

						{watchlists.map((wl) => (
							<div
								className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-3"
								key={wl.id}
							>
								<div>
									<p className="font-medium text-sm">{wl.name}</p>
									<div className="mt-1.5 flex flex-wrap gap-1">
										{wl.symbols.map((sym) => (
											<Badge className="text-xs" key={sym} variant="secondary">
												{sym}
											</Badge>
										))}
									</div>
								</div>
								<Button
									className="size-7"
									onClick={() => removeWatchlist(wl.id)}
									size="icon"
									variant="ghost"
								>
									<Trash className="size-3.5" />
								</Button>
							</div>
						))}
					</div>
				</div>
			</ConfigDropdown>
		</div>
	);
}

export function ChatConfigPanel({
	focusModelSignal = 0,
}: {
	focusModelSignal?: number;
}) {
	return (
		<aside className="hidden w-72 shrink-0 flex-col border-border border-l bg-card xl:flex">
			<div className="border-border border-b px-4 py-3">
				<p className="type-eyebrow">Configuration</p>
			</div>
			<ScrollArea className="flex-1">
				<ChatConfigPanelContent
					apiKeyInputId="chat-apiKey-panel"
					focusModelSignal={focusModelSignal}
				/>
			</ScrollArea>
		</aside>
	);
}
