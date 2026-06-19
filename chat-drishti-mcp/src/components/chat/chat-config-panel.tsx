"use client";

import {
	CaretRight,
	ChartPieSlice,
	Cpu,
	Eye,
	EyeSlash,
	SlidersHorizontal,
	Trash,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { ModelPicker, ProviderSelect } from "~/components/model/model-picker";
import { ModelComparePicker } from "~/components/chat/model-compare-picker";
import {
	PortfolioCard,
	PortfolioCreateForm,
	PortfolioEmptyState,
	PortfolioSectionDivider,
	WatchlistSection,
} from "~/components/portfolio/portfolio-ui";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Switch } from "~/components/ui/switch";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import { isValidModelForProvider } from "~/lib/models";
import {
	normalizeSubAgentPreferences,
	SUB_AGENT_OPTIONS,
} from "~/lib/sub-agents";
import { cn } from "~/lib/utils";
import { useMemoryStore, useModelStore } from "~/stores";
import type { PortfolioHolding } from "~/types";

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
				<Icon
					className="size-4 shrink-0 text-muted-foreground"
					weight="light"
				/>
				<span className="flex-1 font-medium text-foreground text-sm">
					{title}
				</span>
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

type ConfigSectionId = "model" | "preferences" | "portfolio";

export type ConfigFocusTarget = "model" | "drishti";

export function ChatConfigPanelContent({
	focusSignal = 0,
	focusTarget = "model",
	apiKeyInputId = "chat-llm-provider-token",
	drishtiApiKeyInputId = "chat-drishti-mcp-token",
}: {
	focusSignal?: number;
	focusTarget?: ConfigFocusTarget;
	apiKeyInputId?: string;
	drishtiApiKeyInputId?: string;
}) {
	const {
		activeProvider,
		activeModel,
		setActiveModel,
		setActiveProvider,
		saveConfig,
		removeApiKey,
		saveDrishtiApiKey,
		removeDrishtiApiKey,
		drishtiApiKey: storedDrishtiApiKey,
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
	const [drishtiApiKey, setDrishtiApiKey] = useState("");
	const [showApiKey, setShowApiKey] = useState(false);
	const [showDrishtiApiKey, setShowDrishtiApiKey] = useState(false);
	const [baseUrl, setBaseUrl] = useState("");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newPortfolioName, setNewPortfolioName] = useState("");
	const [newWatchlistName, setNewWatchlistName] = useState("");
	const [newWatchlistSymbols, setNewWatchlistSymbols] = useState("");
	const [openSection, setOpenSection] = useState<ConfigSectionId | null>(
		"model",
	);

	const updatePortfolioHoldings = (
		portfolioId: string,
		holdings: PortfolioHolding[],
	) => {
		updatePortfolio(portfolioId, { holdings });
	};

	const toggleSection = (section: ConfigSectionId) => {
		setOpenSection((current) => (current === section ? null : section));
	};

	useEffect(() => {
		if (focusSignal === 0) return;
		setOpenSection("model");
		const inputId =
			focusTarget === "drishti" ? drishtiApiKeyInputId : apiKeyInputId;
		const timer = window.setTimeout(() => {
			const input = document.getElementById(inputId);
			input?.scrollIntoView({ block: "center", behavior: "smooth" });
			input?.focus();
		}, 50);
		return () => window.clearTimeout(timer);
	}, [focusSignal, focusTarget, apiKeyInputId, drishtiApiKeyInputId]);

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

			const trimmedDrishtiKey = drishtiApiKey.trim();
			if (trimmedDrishtiKey) {
				await saveDrishtiApiKey(trimmedDrishtiKey);
				setDrishtiApiKey("");
				setShowDrishtiApiKey(false);
			}

			setSaved(true);
			setApiKey("");
			setTimeout(() => setSaved(false), 2000);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save");
		}
	};

	const handleRemoveKey = () => {
		removeApiKey(activeProvider);
		setApiKey("");
		setShowApiKey(false);
		setError(null);
		setSaved(false);
	};

	const handleRemoveDrishtiKey = () => {
		removeDrishtiApiKey();
		setDrishtiApiKey("");
		setShowDrishtiApiKey(false);
		setError(null);
		setSaved(false);
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
					Provider, model, and API keys. Keys are encrypted server-side and
					stored locally as ciphertext.
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

					<ModelComparePicker compact provider={activeProvider} />

					<div className="space-y-1.5">
						<Label className="text-xs" htmlFor={apiKeyInputId}>
							API Key
							{existingConfig?.encryptedApiKey ? (
								<span className="ml-1.5 text-emerald-600 text-xs">(saved)</span>
							) : null}
						</Label>
						<div className="relative">
							<Input
								className="h-8 pr-16 text-xs"
								id={apiKeyInputId}
								name="llm-provider-token"
								onChange={(e) => setApiKey(e.target.value)}
								placeholder={
									activeProvider === "ollama"
										? "Optional for local Ollama"
										: existingConfig?.encryptedApiKey
											? "••••••••  (saved)"
											: "Enter API key"
								}
								type={showApiKey ? "text" : "password"}
								value={apiKey}
							/>
							<div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
								<Button
									aria-label={showApiKey ? "Hide API key" : "Show API key"}
									className="size-6 text-muted-foreground hover:text-foreground"
									disabled={!apiKey}
									onClick={() => setShowApiKey((v) => !v)}
									size="icon"
									title={showApiKey ? "Hide" : "Show"}
									type="button"
									variant="ghost"
								>
									{showApiKey ? (
										<EyeSlash className="size-3.5" weight="regular" />
									) : (
										<Eye className="size-3.5" weight="regular" />
									)}
								</Button>
								{existingConfig?.encryptedApiKey || apiKey ? (
									<Button
										aria-label="Delete API key"
										className="size-6 text-muted-foreground hover:text-destructive"
										onClick={handleRemoveKey}
										size="icon"
										title="Delete saved key"
										type="button"
										variant="ghost"
									>
										<Trash className="size-3.5" weight="regular" />
									</Button>
								) : null}
							</div>
						</div>
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

					<div className="space-y-1.5 border-border border-t pt-3">
						<div className="space-y-1">
							<Label className="text-xs" htmlFor={drishtiApiKeyInputId}>
								Drishti MCP API Key
								{storedDrishtiApiKey?.encryptedApiKey ? (
									<span className="ml-1.5 text-emerald-600 text-xs">(saved)</span>
								) : null}
							</Label>
							<p className="type-body-prose text-[11px] text-muted-foreground">
								Required for market data tools (news, movers, portfolio,
								filings).
							</p>
						</div>
						<div className="relative">
							<Input
								autoComplete="off"
								className="h-8 pr-16 text-xs"
								id={drishtiApiKeyInputId}
								name="drishti-mcp-token"
								onChange={(e) => setDrishtiApiKey(e.target.value)}
								placeholder={
									storedDrishtiApiKey?.encryptedApiKey
										? "••••••••  (saved)"
										: "Enter Drishti MCP API key"
								}
								type={showDrishtiApiKey ? "text" : "password"}
								value={drishtiApiKey}
							/>
							<div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
								<Button
									aria-label={
										showDrishtiApiKey
											? "Hide Drishti MCP API key"
											: "Show Drishti MCP API key"
									}
									className="size-6 text-muted-foreground hover:text-foreground"
									disabled={!drishtiApiKey}
									onClick={() => setShowDrishtiApiKey((v) => !v)}
									size="icon"
									title={showDrishtiApiKey ? "Hide" : "Show"}
									type="button"
									variant="ghost"
								>
									{showDrishtiApiKey ? (
										<EyeSlash className="size-3.5" weight="regular" />
									) : (
										<Eye className="size-3.5" weight="regular" />
									)}
								</Button>
								{storedDrishtiApiKey?.encryptedApiKey || drishtiApiKey ? (
									<Button
										aria-label="Delete Drishti MCP API key"
										className="size-6 text-muted-foreground hover:text-destructive"
										onClick={handleRemoveDrishtiKey}
										size="icon"
										title="Delete saved key"
										type="button"
										variant="ghost"
									>
										<Trash className="size-3.5" weight="regular" />
									</Button>
								) : null}
							</div>
						</div>
					</div>

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
					Holdings and watchlists shared with the assistant. Name a portfolio
					(e.g. Deion) and add symbols — the agent uses it when you ask by name.
				</p>
				<div className="space-y-4">
					<PortfolioCreateForm
						name={newPortfolioName}
						onNameChange={setNewPortfolioName}
						onSubmit={() => {
							if (!newPortfolioName.trim()) return;
							addPortfolio({
								name: newPortfolioName.trim(),
								holdings: [],
							});
							setNewPortfolioName("");
						}}
						variant="compact"
					/>

					{portfolios.length === 0 ? (
						<PortfolioEmptyState />
					) : (
						<div className="space-y-3">
							{portfolios.map((portfolio) => {
								const holdings = portfolio.holdings;

								return (
									<PortfolioCard
										autoSave
										holdings={holdings}
										key={portfolio.id}
										onAddHolding={() => {
											updatePortfolioHoldings(portfolio.id, [
												...holdings,
												{ symbol: "", quantity: 0, averagePrice: 0 },
											]);
										}}
										onHoldingChange={(index, holding) => {
											const updated = [...holdings];
											updated[index] = holding;
											updatePortfolioHoldings(portfolio.id, updated);
										}}
										onHoldingRemove={(index) => {
											updatePortfolioHoldings(
												portfolio.id,
												holdings.filter((_, i) => i !== index),
											);
										}}
										onRemove={() => removePortfolio(portfolio.id)}
										portfolio={portfolio}
										variant="compact"
									/>
								);
							})}
						</div>
					)}

					<PortfolioSectionDivider />

					<WatchlistSection
						newName={newWatchlistName}
						newSymbols={newWatchlistSymbols}
						onAdd={() => {
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
						onNameChange={setNewWatchlistName}
						onRemove={removeWatchlist}
						onSymbolsChange={setNewWatchlistSymbols}
						variant="compact"
						watchlists={watchlists}
					/>
				</div>
			</ConfigDropdown>
		</div>
	);
}

export function ChatConfigPanel({
	focusSignal = 0,
	focusTarget = "model",
}: {
	focusSignal?: number;
	focusTarget?: ConfigFocusTarget;
}) {
	return (
		<aside className="hidden h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-border border-l bg-card xl:flex">
			<div className="shrink-0 border-border border-b px-4 py-3">
				<p className="type-eyebrow">Configuration</p>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<ChatConfigPanelContent
					apiKeyInputId="chat-llm-provider-token-panel"
					drishtiApiKeyInputId="chat-drishti-mcp-token-panel"
					focusSignal={focusSignal}
					focusTarget={focusTarget}
				/>
			</ScrollArea>
		</aside>
	);
}
