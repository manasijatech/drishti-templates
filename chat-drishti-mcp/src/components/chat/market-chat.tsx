"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { BashTool } from "~/components/agent-elements/tools/bash-tool";
import { EditTool } from "~/components/agent-elements/tools/edit-tool";
import { SearchTool } from "~/components/agent-elements/tools/search-tool";
import { ThinkingTool } from "~/components/agent-elements/tools/thinking-tool";
import { TodoTool } from "~/components/agent-elements/tools/todo-tool";
import type { AgentChatProps } from "~/components/agent-elements/types";
import { DrishtiLoader } from "~/components/brand/drishti-loader";
import { ChatConfigPanel } from "~/components/chat/chat-config-panel";
import { ChatConfigSheet } from "~/components/chat/chat-config-sheet";
import { ChatShellSkeleton } from "~/components/chat/chat-skeleton";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import { QueryCostMenu } from "~/components/chat/query-cost-menu";
import { Button } from "~/components/ui/button";
import { getModelDisplayName } from "~/lib/openrouter-models-core";
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
const TOOL_RENDERERS = {
	Bash: BashTool,
	Edit: EditTool,
	Write: EditTool,
	Search: SearchTool,
	WebSearch: SearchTool,
	TodoWrite: TodoTool,
	Thinking: ThinkingTool,
} as unknown as NonNullable<AgentChatProps["toolRenderers"]>;

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
	const hasStoredApiKey = useModelStore((s) => s.hasStoredApiKey);
	const activeProvider = useModelStore((s) => s.activeProvider);
	const activeModel = useModelStore((s) => s.activeModel);
	const configs = useModelStore((s) => s.configs);
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
		const ready =
			hasStoredApiKey(activeProvider) || activeProvider === "ollama";
		setCanChat(ready);
		setConfigReady(true);
		if (ready) setInfoBarDismissed(false);
	}, [hasStoredApiKey, activeProvider, activeModel, configs]);

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				prepareSendMessagesRequest: async ({ messages, body }) => {
					const modelConfig = getActiveEncryptedConfig();
					if (
						!modelConfig ||
						(!hasStoredApiKey(modelConfig.provider) &&
							modelConfig.provider !== "ollama")
					) {
						throw new Error("Add your API key in Configuration.");
					}
					return {
						body: {
							...body,
							messages,
							modelConfig,
							sessionId: activeSessionId,
							memoryContext,
							portfolioContext: portfolioToContext(portfolios),
							enabledSubAgents,
						},
					};
				},
			}),
		[
			getActiveEncryptedConfig,
			hasStoredApiKey,
			activeSessionId,
			memoryContext,
			portfolios,
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

	const handleSend = useCallback(
		({ content }: { content: string }) => {
			if (!canChat || !content.trim()) return;
			void sendMessage({ text: content });
		},
		[canChat, sendMessage],
	);

	const modelBadgeLabel = useMemo(
		() => getModelDisplayName(catalogModels, activeProvider, activeModel),
		[activeProvider, activeModel, catalogModels],
	);

	const lastQueryUsage = useMemo(
		() => getLastQueryUsageFromMessages(messages),
		[messages],
	);
	const sessionQueryUsage = useMemo(
		() => sumQueryUsageFromMessages(messages),
		[messages],
	);

	const showSidebarSuggestions = messages.length === 0;
	const openModelConfig = useCallback(() => {
		if (typeof window !== "undefined" && window.innerWidth < 1280) {
			setConfigSheetOpen(true);
			setFocusSheetSignal((n) => n + 1);
			return;
		}
		setFocusPanelSignal((n) => n + 1);
	}, []);

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

	const inputInfoBar =
		!canChat && !infoBarDismissed
			? {
					title: "API key required",
					description: "Save one in Configuration.",
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
					) : (
						<AgentChat
							className="flex-1"
							classNames={{ inputBar: "pb-4" }}
							emptyStatePosition="center"
							emptySuggestionsPlacement="empty"
							emptySuggestionsPosition="bottom"
							error={error ?? undefined}
							infoBar={inputInfoBar}
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
							onStop={stop}
							placeholder="Ask about a stock, sector move, or your portfolio..."
							status={status}
							suggestions={{
								items: SUGGESTIONS,
								className: "justify-center",
								itemClassName: "h-8",
							}}
							toolRenderers={TOOL_RENDERERS}
						/>
					)}
				</div>
				<ChatConfigPanel focusModelSignal={focusPanelSignal} />
			</div>

		</div>
	);
}
