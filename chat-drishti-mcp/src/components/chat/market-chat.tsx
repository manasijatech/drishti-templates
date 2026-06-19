"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
	Bank,
	ChartLineUp,
	ChartPieSlice,
	Newspaper,
	Scales,
	WaveSine,
} from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import { AgentChat } from "~/components/agent-elements/agent-chat";
import { InputBar } from "~/components/agent-elements/input-bar";
import { DrishtiLoader } from "~/components/brand/drishti-loader";
import { ChatConfigPanel } from "~/components/chat/chat-config-panel";
import { ChatConfigSheet } from "~/components/chat/chat-config-sheet";
import { ChatShellSkeleton } from "~/components/chat/chat-skeleton";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import {
	ModelCompareResults,
	type CompareRun,
} from "~/components/chat/model-compare-results";
import { QueryCostMenu } from "~/components/chat/query-cost-menu";
import { OnboardingDialog } from "~/components/onboarding/onboarding-dialog";
import { Button } from "~/components/ui/button";
import { CHAT_TOOL_RENDERERS } from "~/lib/chat-tool-renderers";
import { getModelDisplayName } from "~/lib/openrouter-models-core";
import {
	MODEL_COMPARE_MIN,
} from "~/lib/model-compare";
import {
	getLastQueryUsageFromMessages,
	sumQueryUsageFromMessages,
} from "~/lib/query-usage-message";
import { getEnabledSubAgentIds, normalizeSubAgentPreferences } from "~/lib/sub-agents";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import {
	portfolioToContext,
	useChatStore,
	useMemoryStore,
	useModelStore,
} from "~/stores";

const SIDEBAR_COLLAPSED_KEY = "drishti-sidebar-collapsed";

const SUGGESTIONS = [
	{
		id: "1",
		label: "Reliance today",
		value: "What happened to Reliance today?",
		icon: <ChartLineUp className="size-3.5" weight="light" />,
	},
	{
		id: "2",
		label: "Compare IT majors",
		value: "Compare TCS and Infosys fundamentals and recent performance.",
		icon: <Scales className="size-3.5" weight="light" />,
	},
	{
		id: "3",
		label: "HDFC headlines",
		value: "Show recent announcements for HDFC Bank.",
		icon: <Newspaper className="size-3.5" weight="light" />,
	},
	{
		id: "4",
		label: "My portfolio",
		value: "Analyze my portfolio holdings, sector allocation, and risks.",
		icon: <ChartPieSlice className="size-3.5" weight="light" />,
	},
	{
		id: "5",
		label: "Banking movers",
		value: "Which banking stocks outperformed this quarter?",
		icon: <Bank className="size-3.5" weight="light" />,
	},
	{
		id: "6",
		label: "Market summary",
		value: "Summarize today's Indian stock market.",
		icon: <WaveSine className="size-3.5" weight="light" />,
	},
];

export function MarketChat() {
	const {
		sessions,
		activeSessionId,
		createSession,
		setActiveSession,
		updateSession,
		togglePinSession,
	} = useChatStore();
	const getActiveEncryptedConfig = useModelStore((s) => s.getActiveEncryptedConfig);
	const getEncryptedConfigForTarget = useModelStore(
		(s) => s.getEncryptedConfigForTarget,
	);
	const getEncryptedDrishtiApiKey = useModelStore((s) => s.getEncryptedDrishtiApiKey);
	const hasStoredApiKey = useModelStore((s) => s.hasStoredApiKey);
	const hasStoredDrishtiApiKey = useModelStore((s) => s.hasStoredDrishtiApiKey);
	const activeProvider = useModelStore((s) => s.activeProvider);
	const activeModel = useModelStore((s) => s.activeModel);
	const compareMode = useModelStore((s) => s.compareMode);
	const compareModels = useModelStore((s) => s.compareModels);
	const setActiveModel = useModelStore((s) => s.setActiveModel);
	const setCompareMode = useModelStore((s) => s.setCompareMode);
	const configs = useModelStore((s) => s.configs);
	const encryptedDrishtiKey = useModelStore((s) => s.drishtiApiKey);
	const onboardingStatus = useModelStore((s) => s.onboardingStatus);
	const { models: catalogModels } = useModelsCatalog({ provider: activeProvider });
	const memoryContext = useMemoryStore((s) => s.toContextString());
	const preferences = useMemoryStore((s) => s.preferences);
	const portfolios = useMemoryStore((s) => s.portfolios);
	const watchlists = useMemoryStore((s) => s.watchlists);	const enabledSubAgents = useMemo(
		() => getEnabledSubAgentIds(normalizeSubAgentPreferences(preferences.subAgents)),
		[preferences.subAgents],
	);

	const [storeHydrated, setStoreHydrated] = useState(false);
	const [configReady, setConfigReady] = useState(false);
	const [canChat, setCanChat] = useState(false);
	const [infoBarDismissed, setInfoBarDismissed] = useState(false);
	const [configSheetOpen, setConfigSheetOpen] = useState(false);
	const [focusPanelSignal, setFocusPanelSignal] = useState(0);
	const [focusSheetSignal, setFocusSheetSignal] = useState(0);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [compareRun, setCompareRun] = useState<CompareRun | null>(null);
	const [compareStreaming, setCompareStreaming] = useState(false);
	const [compareDraft, setCompareDraft] = useState("");
	const compareStopAllRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		try {
			const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
			if (stored === "true") setSidebarCollapsed(true);
		} catch {
			// ignore
		}
	}, []);

	const handleSidebarCollapsedChange = useCallback((collapsed: boolean) => {
		setSidebarCollapsed(collapsed);
		try {
			localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
		} catch {
			// ignore
		}
	}, []);
	useEffect(() => {
		const persistApi = useChatStore.persist;
		if (!persistApi) {
			setStoreHydrated(true);
			return;
		}
		if (persistApi.hasHydrated()) {
			setStoreHydrated(true);
			return;
		}
		return persistApi.onFinishHydration(() => {
			setStoreHydrated(true);
		});
	}, []);

	useEffect(() => {
		if (!storeHydrated || activeSessionId) return;
		createSession();
	}, [storeHydrated, activeSessionId, createSession]);

	useEffect(() => {
		const hasModelKey =
			hasStoredApiKey(activeProvider) || activeProvider === "ollama";
		const ready = hasModelKey && hasStoredDrishtiApiKey();
		setCanChat(ready);
		setConfigReady(true);
		if (ready) setInfoBarDismissed(false);
	}, [
		hasStoredApiKey,
		hasStoredDrishtiApiKey,
		activeProvider,
		activeModel,
		configs,
		encryptedDrishtiKey,
	]);

	const portfolioContext = useMemo(
		() => portfolioToContext(portfolios),
		[portfolios],
	);

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				prepareSendMessagesRequest: async ({ messages, body }) => {
					const modelConfig = getActiveEncryptedConfig();
					const drishtiApiKey = getEncryptedDrishtiApiKey();
					if (
						!modelConfig ||
						(!hasStoredApiKey(modelConfig.provider) &&
							modelConfig.provider !== "ollama")
					) {
						throw new Error("Add your API key in Configuration.");
					}
					if (!drishtiApiKey) {
						throw new Error("Add your Drishti MCP API key in Configuration.");
					}
					return {
						body: {
							...body,
							messages,
							modelConfig,
							drishtiApiKey,
							sessionId: activeSessionId,
							memoryContext,
							portfolioContext,
							enabledSubAgents,
						},
					};
				},
			}),
		[
			getActiveEncryptedConfig,
			getEncryptedDrishtiApiKey,
			hasStoredApiKey,
			activeSessionId,
			memoryContext,
			portfolioContext,
			enabledSubAgents,
		],
	);

	const { messages, status, sendMessage, stop, error, setMessages } = useChat({
		id: activeSessionId ?? "default",
		transport,
	});

	useEffect(() => {
		if (!activeSessionId || messages.length === 0) return;
		if (status === "streaming" || status === "submitted") return;
		updateSession(activeSessionId, messages);
	}, [activeSessionId, messages, status, updateSession]);

	useEffect(() => {
		const session = sessions.find((s) => s.id === activeSessionId);
		if (session?.messages.length && messages.length === 0) {
			setMessages(session.messages);
		}
	}, [activeSessionId, sessions, messages.length, setMessages]);

	const openModelConfig = useCallback(() => {
		if (typeof window !== "undefined" && window.innerWidth < 1280) {
			setConfigSheetOpen(true);
			setFocusSheetSignal((n) => n + 1);
			return;
		}
		setFocusPanelSignal((n) => n + 1);
	}, []);

	const handleSend = useCallback(
		({ content }: { content: string }) => {
			if (!canChat || !content.trim()) return;

			if (compareMode) {
				if (compareModels.length < MODEL_COMPARE_MIN) {
					openModelConfig();
					return;
				}

				const configuredCount = compareModels.filter((target) =>
					Boolean(getEncryptedConfigForTarget(target)),
				).length;

				if (configuredCount < MODEL_COMPARE_MIN) {
					openModelConfig();
					return;
				}

				compareStopAllRef.current?.();
				setCompareRun({
					id: crypto.randomUUID(),
					query: content.trim(),
					priorMessages: compareRun ? [] : messages,
				});
				return;
			}

			void sendMessage({ text: content });
		},
		[
			canChat,
			compareMode,
			compareModels,
			compareRun,
			getEncryptedConfigForTarget,
			messages,
			sendMessage,
			openModelConfig,
		],
	);

	const handleStop = useCallback(() => {
		if (compareRun) {
			compareStopAllRef.current?.();
			return;
		}
		stop();
	}, [compareRun, stop]);

	const handleCloseCompare = useCallback(() => {
		compareStopAllRef.current?.();
		setCompareRun(null);
		setCompareStreaming(false);
	}, []);

	const handleUseComparedModel = useCallback(
		(provider: typeof activeProvider, model: string) => {
			setActiveModel(provider, model);
			setCompareMode(false);
			setCompareRun(null);
			setCompareStreaming(false);
		},
		[setActiveModel, setCompareMode],
	);

	const modelBadgeLabel = useMemo(() => {
		if (compareMode) {
			return `Compare · ${compareModels.length} models`;
		}
		return getModelDisplayName(catalogModels, activeProvider, activeModel);
	}, [
		compareMode,
		compareModels.length,
		activeProvider,
		activeModel,
		catalogModels,
	]);

	const lastQueryUsage = useMemo(
		() => getLastQueryUsageFromMessages(messages),
		[messages],
	);
	const sessionQueryUsage = useMemo(
		() => sumQueryUsageFromMessages(messages),
		[messages],
	);

	const chatStatus = compareStreaming ? "submitted" : status;

	const compareSharedContext = useMemo(() => {
		if (!encryptedDrishtiKey) return null;
		return {
			sessionId: activeSessionId,
			memoryContext,
			portfolioContext,
			enabledSubAgents,
			drishtiApiKey: encryptedDrishtiKey,
		};
	}, [
		activeSessionId,
		memoryContext,
		portfolioContext,
		enabledSubAgents,
		encryptedDrishtiKey,
	]);

	const handleCompareRegisterStop = useCallback((stopAll: () => void) => {
		compareStopAllRef.current = stopAll;
	}, []);

	const showCompareResults = compareRun !== null;
	const showSidebarSuggestions = messages.length === 0 && !showCompareResults;

	const handleSidebarPrompt = useCallback(
		(prompt: string) => {
			if (!canChat) {
				openModelConfig();
				return;
			}
			void sendMessage({ text: prompt });
		},
		[canChat, openModelConfig, sendMessage],
	);

	const hasModelKey =
		hasStoredApiKey(activeProvider) || activeProvider === "ollama";
	const hasDrishtiKey = hasStoredDrishtiApiKey();

	const inputInfoBar =
		!canChat && !infoBarDismissed
			? {
					title:
						!hasModelKey && !hasDrishtiKey
							? "API keys required"
							: !hasDrishtiKey
								? "Drishti MCP API key required"
								: "Model API key required",
					description:
						!hasModelKey && !hasDrishtiKey
							? "Save your model and Drishti MCP keys in Configuration."
							: !hasDrishtiKey
								? "Save your Drishti MCP key in Configuration."
								: "Save your model API key in Configuration.",
					position: "bottom" as const,
					onClose: () => setInfoBarDismissed(true),
					action: {
						label: "Add key",
						onClick: openModelConfig,
					},
				}
			: undefined;

	if (!storeHydrated) {
		return <ChatShellSkeleton />;
	}

	return (
		<div className="flex h-screen flex-col">
			<OnboardingDialog open={storeHydrated && onboardingStatus === "pending"} />
			<div className="flex flex-1 overflow-hidden">
				<ChatSidebar
					activeSessionId={activeSessionId}
					collapsed={sidebarCollapsed}
					onCollapsedChange={handleSidebarCollapsedChange}
					onNewChat={() => createSession()}
					onSelectSession={setActiveSession}
					onSendPrompt={handleSidebarPrompt}
					onTogglePin={togglePinSession}
					portfolios={portfolios}
					sessions={sessions}
					showSuggestions={showSidebarSuggestions}
					watchlists={watchlists}
				/>
				<div className="flex min-h-0 flex-1 flex-col bg-background">
					<div className="flex items-center gap-2 border-border border-b px-3 py-2 lg:hidden">
						<Button
							onClick={() => createSession()}
							size="sm"
							variant="outline"
						>
							New chat
						</Button>
						<ChatConfigSheet
							focusModelSignal={focusSheetSignal}
							onOpenChange={setConfigSheetOpen}
							open={configSheetOpen}
						/>
					</div>
					{!configReady ? (
						<DrishtiLoader fullscreen label="Loading configuration" />
					) : showCompareResults && compareRun && compareSharedContext ? (
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
							<ModelCompareResults
								catalogModels={catalogModels}
								compareModels={compareModels}
								getEncryptedConfigForTarget={getEncryptedConfigForTarget}
								onClose={handleCloseCompare}
								onRegisterStop={handleCompareRegisterStop}
								onStreamingChange={setCompareStreaming}
								onUseModel={handleUseComparedModel}
								run={compareRun}
								sharedContext={compareSharedContext}
								toolRenderers={CHAT_TOOL_RENDERERS}
							/>
							<div className="shrink-0 border-border border-t px-4 pb-4">
								<InputBar
									className="pt-3"
									disabled={!canChat}
									infoBar={
										compareMode
											? {
													title: "Compare mode",
													description: `Next prompt runs on ${compareModels.length} models in parallel.`,
													position: "bottom" as const,
												}
											: undefined
									}
									modelBadge={modelBadgeLabel}
									onChange={setCompareDraft}
									onSend={({ content }) => {
										handleSend({ content });
										setCompareDraft("");
									}}
									onStop={handleStop}
									placeholder="Ask the same question across models..."
									rightActions={
										<QueryCostMenu
											catalogModels={catalogModels}
											isStreaming={compareStreaming}
											lastQueryUsage={null}
											modelId={activeModel}
											provider={activeProvider}
											sessionUsage={sessionQueryUsage}
										/>
									}
									status={chatStatus}
									value={compareDraft}
								/>
							</div>
						</div>
					) : (
						<AgentChat
							className="flex-1"
							classNames={{ inputBar: "pb-4" }}
							emptyStatePosition="center"
							emptySuggestionsPlacement="empty"
							emptySuggestionsPosition="bottom"
							error={error ?? undefined}
							infoBar={
								compareMode
									? {
											title: "Compare mode",
											description: `Select ${MODEL_COMPARE_MIN}+ models in Configuration, then send a prompt.`,
											position: "bottom" as const,
										}
									: inputInfoBar
							}
							inputDisabled={!canChat}
							inputRightActions={
								<QueryCostMenu
									catalogModels={catalogModels}
									isStreaming={
										status === "streaming" || status === "submitted"
									}
									lastQueryUsage={lastQueryUsage}
									modelId={activeModel}
									provider={activeProvider}
									sessionUsage={sessionQueryUsage}
								/>
							}
							modelBadge={modelBadgeLabel}
							messages={messages}
							onSend={handleSend}
							onStop={handleStop}
							placeholder={
								compareMode
									? "Ask the same question across models..."
									: "Ask about a stock, sector move, or your portfolio..."
							}
							status={chatStatus}
							suggestions={{
								items: SUGGESTIONS,
								className: "justify-center",
								itemClassName: "h-8",
							}}
							toolRenderers={CHAT_TOOL_RENDERERS}
						/>
					)}
				</div>
				<ChatConfigPanel focusModelSignal={focusPanelSignal} />
			</div>

		</div>
	);
}
