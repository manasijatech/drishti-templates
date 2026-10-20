"use client";

import {
	CaretRight,
	ChartPieSlice,
	CheckCircle,
	Cpu,
	Eye,
	EyeSlash,
	SpeakerHigh,
	Trash,
} from "@phosphor-icons/react";
import { play } from "cuelume";
import { type ReactNode, useEffect, useState } from "react";
import { ModelPicker, ProviderSelect } from "~/components/model/model-picker";
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
import { playCue, SOUND_THEMES, useSoundPrefs } from "~/lib/sound";
import { cn } from "~/lib/utils";
import { useMemoryStore, useModelStore } from "~/stores";
import type { PortfolioHolding } from "~/types";

type SectionStatus = { tone: "ok" | "warn" | "muted"; text: string };

function StatusPill({ status }: { status: SectionStatus }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[10px]",
				status.tone === "ok" &&
					"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
				status.tone === "warn" &&
					"bg-amber-500/10 text-amber-700 dark:text-amber-400",
				status.tone === "muted" && "bg-muted text-muted-foreground",
			)}
		>
			{status.tone !== "muted" ? (
				<span
					className={cn(
						"size-1.5 rounded-full",
						status.tone === "ok" ? "bg-emerald-500" : "bg-amber-500",
					)}
				/>
			) : null}
			{status.text}
		</span>
	);
}

function ConfigDropdown({
	title,
	icon: Icon,
	open,
	onToggle,
	status,
	children,
}: {
	title: string;
	icon: typeof Cpu;
	open: boolean;
	onToggle: () => void;
	status?: SectionStatus;
	children: ReactNode;
}) {
	return (
		<div className="border-border border-b last:border-b-0">
			<button
				aria-expanded={open}
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
				{status ? <StatusPill status={status} /> : null}
				<CaretRight
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
						open && "rotate-90",
					)}
					weight="bold"
				/>
			</button>
			{open ? (
				<div className="an-step-in space-y-3 px-3 pt-1 pb-4">{children}</div>
			) : null}
		</div>
	);
}

/** A saved key collapses to "Saved · Replace · Remove" instead of a dotted input. */
function KeyField({
	id,
	label,
	hint,
	saved,
	providedByServer = false,
	value,
	onChange,
	onRemove,
	placeholder,
	editSignal,
	savedSignal,
}: {
	id: string;
	label: string;
	hint?: string;
	saved: boolean;
	providedByServer?: boolean;
	value: string;
	onChange: (value: string) => void;
	onRemove: () => void;
	placeholder: string;
	editSignal: number;
	savedSignal: number;
}) {
	const [editing, setEditing] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (editSignal > 0) setEditing(true);
	}, [editSignal]);

	useEffect(() => {
		if (savedSignal > 0) setEditing(false);
	}, [savedSignal]);

	useEffect(() => {
		if (!value) setVisible(false);
	}, [value]);

	const showSummary = (saved || providedByServer) && !editing;

	return (
		<div className="space-y-1.5">
			<Label className="text-xs" htmlFor={id}>
				{label}
			</Label>
			{hint && !showSummary ? (
				<p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
			) : null}

			{showSummary ? (
				<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
					<CheckCircle
						className="size-4 shrink-0 text-emerald-600"
						weight="fill"
					/>
					<div className="min-w-0 flex-1">
						<p className="font-medium text-foreground text-xs">
							{saved ? "Saved" : "Provided by the server"}
						</p>
						<p className="truncate text-[11px] text-muted-foreground">
							{saved ? "Encrypted in this browser" : "No key needed here"}
						</p>
					</div>
					<Button
						className="h-7 px-2 text-xs"
						onClick={() => setEditing(true)}
						size="sm"
						variant="ghost"
					>
						{saved ? "Replace" : "Use my own"}
					</Button>
					{saved ? (
						<Button
							aria-label={`Remove ${label}`}
							className="size-7 text-muted-foreground hover:text-destructive"
							onClick={onRemove}
							size="icon"
							variant="ghost"
						>
							<Trash className="size-3.5" />
						</Button>
					) : null}
				</div>
			) : (
				<div className="space-y-1">
					<div className="relative">
						<Input
							autoComplete="off"
							className="h-8 pr-9 text-xs"
							id={id}
							onChange={(e) => onChange(e.target.value)}
							placeholder={placeholder}
							type={visible ? "text" : "password"}
							value={value}
						/>
						<Button
							aria-label={visible ? `Hide ${label}` : `Show ${label}`}
							className="absolute inset-y-0 right-1 my-auto size-6 text-muted-foreground hover:text-foreground"
							disabled={!value}
							onClick={() => setVisible((v) => !v)}
							size="icon"
							type="button"
							variant="ghost"
						>
							{visible ? (
								<EyeSlash className="size-3.5" />
							) : (
								<Eye className="size-3.5" />
							)}
						</Button>
					</div>
					{saved || providedByServer ? (
						<button
							className="text-[11px] text-muted-foreground hover:text-foreground"
							onClick={() => {
								onChange("");
								setEditing(false);
							}}
							type="button"
						>
							Cancel, keep the current key
						</button>
					) : null}
				</div>
			)}
		</div>
	);
}

type ConfigSectionId = "model" | "portfolio";

export type ConfigFocusTarget = "model" | "drishti";

export function ChatConfigPanelContent({
	focusSignal = 0,
	focusTarget = "model",
	apiKeyInputId = "chat-llm-provider-token",
	drishtiApiKeyInputId = "chat-drishti-mcp-token",
	serverHasDrishtiKey = false,
}: {
	focusSignal?: number;
	focusTarget?: ConfigFocusTarget;
	apiKeyInputId?: string;
	drishtiApiKeyInputId?: string;
	serverHasDrishtiKey?: boolean;
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
		portfolios,
		watchlists,
		addPortfolio,
		updatePortfolio,
		removePortfolio,
		addWatchlist,
		removeWatchlist,
	} = useMemoryStore();
	const [soundPrefs, setSoundPrefs] = useSoundPrefs();

	const [apiKey, setApiKey] = useState("");
	const [drishtiApiKey, setDrishtiApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [saving, setSaving] = useState(false);
	const [justSaved, setJustSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newPortfolioName, setNewPortfolioName] = useState("");
	const [newWatchlistName, setNewWatchlistName] = useState("");
	const [newWatchlistSymbols, setNewWatchlistSymbols] = useState("");
	const [openSection, setOpenSection] = useState<ConfigSectionId | null>(
		"model",
	);
	const [modelKeyEditSignal, setModelKeyEditSignal] = useState(0);
	const [drishtiKeyEditSignal, setDrishtiKeyEditSignal] = useState(0);
	const [savedSignal, setSavedSignal] = useState(0);

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
		if (focusTarget === "drishti") setDrishtiKeyEditSignal((n) => n + 1);
		else setModelKeyEditSignal((n) => n + 1);
		const inputId =
			focusTarget === "drishti" ? drishtiApiKeyInputId : apiKeyInputId;
		const timer = window.setTimeout(() => {
			const input = document.getElementById(inputId);
			input?.scrollIntoView({ block: "center", behavior: "smooth" });
			input?.focus();
		}, 80);
		return () => window.clearTimeout(timer);
	}, [focusSignal, focusTarget, apiKeyInputId, drishtiApiKeyInputId]);

	const existingConfig = configs.find((c) => c.provider === activeProvider);
	const { models: catalogModels } = useModelsCatalog({
		provider: activeProvider,
		ollamaBaseUrl: baseUrl || existingConfig?.baseUrl,
	});

	const hasModelKey =
		activeProvider === "ollama" || Boolean(existingConfig?.encryptedApiKey);
	const hasDrishtiKey =
		serverHasDrishtiKey || Boolean(storedDrishtiApiKey?.encryptedApiKey);
	const modelStatus: SectionStatus =
		hasModelKey && hasDrishtiKey
			? { tone: "ok", text: "Ready" }
			: { tone: "warn", text: "Needs key" };

	const isDirty =
		Boolean(apiKey.trim()) ||
		Boolean(drishtiApiKey.trim()) ||
		Boolean(baseUrl.trim()) ||
		(existingConfig
			? existingConfig.model !== activeModel
			: activeProvider === "ollama");

	const handleSave = async () => {
		setError(null);
		if (!isValidModelForProvider(activeProvider, activeModel, catalogModels)) {
			setError("Pick a model from the list first.");
			return;
		}
		const trimmedKey = apiKey.trim();
		if (
			activeProvider !== "ollama" &&
			!trimmedKey &&
			!existingConfig?.encryptedApiKey
		) {
			setError("Enter your API key first.");
			return;
		}

		setSaving(true);
		try {
			await saveConfig({
				provider: activeProvider,
				model: activeModel,
				apiKey: trimmedKey,
				baseUrl: baseUrl || existingConfig?.baseUrl || undefined,
			});
			const trimmedDrishtiKey = drishtiApiKey.trim();
			if (trimmedDrishtiKey) await saveDrishtiApiKey(trimmedDrishtiKey);

			setApiKey("");
			setDrishtiApiKey("");
			setBaseUrl("");
			setSavedSignal((n) => n + 1);
			setJustSaved(true);
			playCue("success");
			window.setTimeout(() => setJustSaved(false), 2000);
		} catch (e) {
			playCue("error");
			setError(
				e instanceof Error ? e.message : "Could not save. Please try again.",
			);
		} finally {
			setSaving(false);
		}
	};

	const portfolioStatus: SectionStatus | undefined =
		portfolios.length + watchlists.length > 0
			? {
					tone: "muted",
					text: `${portfolios.length + watchlists.length} saved`,
				}
			: undefined;

	return (
		<div className="py-1">
			<ConfigDropdown
				icon={Cpu}
				onToggle={() => toggleSection("model")}
				open={openSection === "model"}
				status={modelStatus}
				title="AI model & keys"
			>
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

				{activeProvider !== "ollama" ? (
					<KeyField
						editSignal={modelKeyEditSignal}
						id={apiKeyInputId}
						label="Model API key"
						onChange={setApiKey}
						onRemove={() => {
							removeApiKey(activeProvider);
							setApiKey("");
						}}
						placeholder="Paste your API key"
						saved={Boolean(existingConfig?.encryptedApiKey)}
						savedSignal={savedSignal}
						value={apiKey}
					/>
				) : null}

				{activeProvider === "ollama" ? (
					<div className="space-y-1.5">
						<Label className="text-xs" htmlFor="chat-baseUrl">
							Ollama URL
						</Label>
						<Input
							className="h-8 text-xs"
							id="chat-baseUrl"
							onChange={(e) => setBaseUrl(e.target.value)}
							placeholder={
								existingConfig?.baseUrl ?? "http://localhost:11434/v1"
							}
							value={baseUrl}
						/>
					</div>
				) : activeProvider === "openrouter" ? (
					<div>
						<button
							aria-expanded={showAdvanced}
							className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
							onClick={() => setShowAdvanced((v) => !v)}
							type="button"
						>
							<CaretRight
								className={cn(
									"size-3 transition-transform duration-200",
									showAdvanced && "rotate-90",
								)}
								weight="bold"
							/>
							Advanced
						</button>
						{showAdvanced ? (
							<div className="an-step-in mt-2 space-y-1.5">
								<Label className="text-xs" htmlFor="chat-baseUrl">
									Base URL
								</Label>
								<Input
									className="h-8 text-xs"
									id="chat-baseUrl"
									onChange={(e) => setBaseUrl(e.target.value)}
									placeholder={
										existingConfig?.baseUrl ?? "https://openrouter.ai/api/v1"
									}
									value={baseUrl}
								/>
							</div>
						) : null}
					</div>
				) : null}

				<div className="border-border border-t pt-3">
					<KeyField
						editSignal={drishtiKeyEditSignal}
						hint="Gives the assistant live prices, news, filings and results."
						id={drishtiApiKeyInputId}
						label="Drishti API key"
						onChange={setDrishtiApiKey}
						onRemove={() => {
							removeDrishtiApiKey();
							setDrishtiApiKey("");
						}}
						placeholder="Paste your Drishti API key"
						providedByServer={serverHasDrishtiKey}
						saved={Boolean(storedDrishtiApiKey?.encryptedApiKey)}
						savedSignal={savedSignal}
						value={drishtiApiKey}
					/>
				</div>

				{error ? (
					<p className="an-step-in rounded-md bg-destructive/10 px-2.5 py-1.5 text-destructive text-xs">
						{error}
					</p>
				) : null}

				<Button
					className="h-8 w-full text-xs"
					disabled={!isDirty || saving}
					onClick={() => void handleSave()}
				>
					{saving ? (
						"Saving…"
					) : justSaved ? (
						<span className="an-pop inline-flex items-center gap-1.5">
							<CheckCircle className="size-3.5" weight="fill" />
							Saved
						</span>
					) : isDirty ? (
						"Save changes"
					) : hasModelKey ? (
						"All changes saved"
					) : (
						"Save"
					)}
				</Button>
			</ConfigDropdown>

			<ConfigDropdown
				icon={ChartPieSlice}
				onToggle={() => toggleSection("portfolio")}
				open={openSection === "portfolio"}
				status={portfolioStatus}
				title="Portfolio & watchlists"
			>
				<p className="text-muted-foreground text-xs leading-snug">
					Saved stocks show under{" "}
					<span className="font-medium text-foreground">My stocks</span> in the
					sidebar. Click one for a briefing.
				</p>

				<div className="space-y-2">
					<p className="font-medium text-foreground text-xs">
						Portfolios
						{portfolios.length > 0 ? (
							<span className="ml-1 text-muted-foreground">
								({portfolios.length})
							</span>
						) : null}
					</p>
					<PortfolioCreateForm
						name={newPortfolioName}
						onNameChange={setNewPortfolioName}
						onSubmit={() => {
							if (!newPortfolioName.trim()) return;
							addPortfolio({ name: newPortfolioName.trim(), holdings: [] });
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
									<div className="an-step-in" key={portfolio.id}>
										<PortfolioCard
											autoSave
											holdings={holdings}
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
									</div>
								);
							})}
						</div>
					)}
				</div>

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
			</ConfigDropdown>

			<div className="space-y-3 px-3 py-3">
				<div className="flex items-center gap-2.5">
					<SpeakerHigh
						className="size-4 shrink-0 text-muted-foreground"
						weight="light"
					/>
					<div className="min-w-0 flex-1">
						<p className="font-medium text-foreground text-sm">Sound effects</p>
						<p className="text-[11px] text-muted-foreground">
							Clicks, toggles, and a chime when an answer is ready
						</p>
					</div>
					<Switch
						aria-label="Sound effects"
						checked={soundPrefs.enabled}
						onCheckedChange={(checked) => setSoundPrefs({ enabled: checked })}
					/>
				</div>

				{soundPrefs.enabled ? (
					<div className="an-step-in space-y-3 pl-6.5">
						<div className="flex items-center justify-between gap-2">
							<p className="text-foreground text-xs">Typing sounds</p>
							<Switch
								aria-label="Typing sounds"
								checked={soundPrefs.typing}
								onCheckedChange={(checked) =>
									setSoundPrefs({ typing: checked })
								}
								size="sm"
							/>
						</div>
						<div className="space-y-1.5">
							<p className="text-foreground text-xs">Sound style</p>
							<div className="grid grid-cols-4 gap-1" data-sfx="off">
								{SOUND_THEMES.map((theme) => {
									const active = soundPrefs.theme === theme.id;
									return (
										<button
											aria-pressed={active}
											className={cn(
												"h-7 rounded-md border text-[11px] transition-colors",
												active
													? "border-primary bg-primary text-primary-foreground"
													: "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
											)}
											key={theme.id}
											onClick={() => {
												setSoundPrefs({ theme: theme.id });
												play("success", { theme: theme.id });
											}}
											type="button"
										>
											{theme.label}
										</button>
									);
								})}
							</div>
							<p className="text-[10px] text-muted-foreground">
								Tap a style to hear it.
							</p>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

export function ChatConfigPanel({
	focusSignal = 0,
	focusTarget = "model",
	serverHasDrishtiKey = false,
}: {
	focusSignal?: number;
	focusTarget?: ConfigFocusTarget;
	serverHasDrishtiKey?: boolean;
}) {
	return (
		<aside className="hidden h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-border border-l bg-card xl:flex">
			<div className="shrink-0 border-border border-b px-4 py-3">
				<p className="type-eyebrow">Settings</p>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<ChatConfigPanelContent
					apiKeyInputId="chat-llm-provider-token-panel"
					drishtiApiKeyInputId="chat-drishti-mcp-token-panel"
					focusSignal={focusSignal}
					focusTarget={focusTarget}
					serverHasDrishtiKey={serverHasDrishtiKey}
				/>
			</ScrollArea>
		</aside>
	);
}
