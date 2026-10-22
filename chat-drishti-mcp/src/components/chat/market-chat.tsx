"use client";

import { useChat } from "@ai-sdk/react";
import { List, NotePencil, Pulse } from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChat } from "~/components/agent-elements/agent-chat";
import {
	ChatConfigPanel,
	type ConfigFocusTarget,
} from "~/components/chat/chat-config-panel";
import { ChatConfigSheet } from "~/components/chat/chat-config-sheet";
import { ChatExportButton } from "~/components/chat/chat-export-button";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import { ChatShellSkeleton } from "~/components/chat/chat-skeleton";
import { QueryCostMenu } from "~/components/chat/query-cost-menu";
import { TracePanel } from "~/components/chat/trace-panel";
import { OnboardingDialog } from "~/components/onboarding/onboarding-dialog";
import { Button } from "~/components/ui/button";
import { useModelsCatalog } from "~/hooks/use-models-catalog";
import { DEMO_PROMPTS, SIDEBAR_ICONS } from "~/lib/chat-sidebar-utils";
import { CHAT_TOOL_RENDERERS } from "~/lib/chat-tool-renderers";
import { getModelDisplayName } from "~/lib/openrouter-models-core";
import {
	getLastQueryUsageFromMessages,
	sumQueryUsageFromMessages,
} from "~/lib/query-usage-message";
import { playCue, startSoundEffects } from "~/lib/sound";
import { cn } from "~/lib/utils";
import {
	portfolioToContext,
	useChatStore,
	useMemoryStore,
	useModelStore,
} from "~/stores";

const SIDEBAR_COLLAPSED_KEY = "drishti-sidebar-collapsed";
const TRACE_OPEN_KEY = "drishti-trace-open";

const SUGGESTIONS = DEMO_PROMPTS.slice(0, 6).map((item) => {
	const Icon = SIDEBAR_ICONS[item.icon];
	return {
		id: item.label,
		label: item.label,
		value: item.prompt,
		icon: <Icon className="size-3.5" weight="light" />,
	};
});

/** The API returns `{ error }` JSON; show just the message to the user. */
function toReadableError(error: Error | undefined): Error | undefined {
	if (!error) return undefined;
	try {
		const parsed = JSON.parse(error.message) as { error?: unknown };
		if (typeof parsed.error === "string") return new Error(parsed.error);
	} catch {
		// Not JSON; use the message as-is.
	}
	return error;
}

export function MarketChat({
	serverHasDrishtiKey = false,
}: {
	serverHasDrishtiKey?: boolean;
}) {
	const {
		sessions,
		activeSessionId,
		createSession,
		setActiveSession,
		updateSession,
		togglePinSession,
	} = useChatStore();
	const getActiveEncryptedConfig = useModelStore(
		(s) => s.getActiveEncryptedConfig,
	);
	const encryptedDrishtiKey = useModelStore((s) => s.drishtiApiKey);
	const configs = useModelStore((s) => s.configs);
	const activeProvider = useModelStore((s) => s.activeProvider);
	const activeModel = useModelStore((s) => s.activeModel);
	const onboardingStatus = useModelStore((s) => s.onboardingStatus);
	const { models: catalogModels } = useModelsCatalog({
		provider: activeProvider,
	});
	const memoryContext = useMemoryStore((s) => s.toContextString());
	const portfolios = useMemoryStore((s) => s.portfolios);
	const watchlists = useMemoryStore((s) => s.watchlists);

	const [storeHydrated, setStoreHydrated] = useState(false);
	const [infoBarDismissed, setInfoBarDismissed] = useState(false);
	const [configSheetOpen, setConfigSheetOpen] = useState(false);
	const [panelFocus, setPanelFocus] = useState<{
		signal: number;
		target: ConfigFocusTarget;
	}>({ signal: 0, target: "model" });
	const [sheetFocus, setSheetFocus] = useState<{
		signal: number;
		target: ConfigFocusTarget;
	}>({ signal: 0, target: "model" });
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const [prefill, setPrefill] = useState({ text: "", signal: 0 });
	const [traceOpen, setTraceOpen] = useState(false);

	const hasModelKey =
		activeProvider === "ollama" ||
		configs.some(
			(c) =>
				c.provider === activeProvider && Boolean(c.encryptedApiKey?.trim()),
		);
	const hasDrishtiKey =
		serverHasDrishtiKey ||
		Boolean(encryptedDrishtiKey?.encryptedApiKey?.trim());
	const canChat = hasModelKey && hasDrishtiKey;

	useEffect(() => {
		try {
			const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
			if (stored === "true") setSidebarCollapsed(true);
		} catch {
			// ignore
		}
	}, []);

	// Trace panel: open with ?trace=1 (or ?trace=0 to close); remembered after that.
	useEffect(() => {
		try {
			const param = new URLSearchParams(window.location.search).get("trace");
			if (param === "1" || param === "0") {
				setTraceOpen(param === "1");
				localStorage.setItem(TRACE_OPEN_KEY, String(param === "1"));
				return;
			}
			if (localStorage.getItem(TRACE_OPEN_KEY) === "true") setTraceOpen(true);
		} catch {
			// ignore
		}
	}, []);

	const handleTraceOpenChange = useCallback((open: boolean) => {
		setTraceOpen(open);
		try {
			localStorage.setItem(TRACE_OPEN_KEY, String(open));
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
		if (!persistApi || persistApi.hasHydrated()) {
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
		if (canChat) setInfoBarDismissed(false);
	}, [canChat]);

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
					if (!modelConfig && activeProvider !== "ollama") {
						throw new Error("Add your AI model API key in Settings.");
					}
					return {
						body: {
							...body,
							messages,
							modelConfig: modelConfig ?? {
								provider: activeProvider,
								model: activeModel,
								encryptedApiKey: "",
								iv: "",
							},
							drishtiApiKey: encryptedDrishtiKey ?? undefined,
							sessionId: activeSessionId,
							memoryContext,
							portfolioContext,
						},
					};
				},
			}),
		[
			getActiveEncryptedConfig,
			activeProvider,
			activeModel,
			encryptedDrishtiKey,
			activeSessionId,
			memoryContext,
			portfolioContext,
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

	const openSettings = useCallback(
		(target?: ConfigFocusTarget) => {
			const resolvedTarget: ConfigFocusTarget =
				target ?? (hasModelKey && !hasDrishtiKey ? "drishti" : "model");

			if (typeof window !== "undefined" && window.innerWidth < 1280) {
				setConfigSheetOpen(true);
				setSheetFocus((current) => ({
					signal: current.signal + 1,
					target: resolvedTarget,
				}));
				return;
			}
			// Settings and the trace share the right-hand column.
			handleTraceOpenChange(false);
			setPanelFocus((current) => ({
				signal: current.signal + 1,
				target: resolvedTarget,
			}));
		},
		[hasModelKey, hasDrishtiKey, handleTraceOpenChange],
	);

	const sendPrompt = useCallback(
		(prompt: string) => {
			if (!prompt.trim()) return;
			if (!canChat) {
				openSettings();
				return;
			}
			playCue("tap", "strong");
			void sendMessage({ text: prompt });
		},
		[canChat, openSettings, sendMessage],
	);

	// Sidebar prompts go into the message box so the user can edit, then send.
	const pickPrompt = useCallback((prompt: string) => {
		setPrefill((current) => ({ text: prompt, signal: current.signal + 1 }));
	}, []);

	useEffect(() => startSoundEffects(), []);

	// Sound cue when an answer finishes or fails, so a long run is never silent.
	const prevStatusRef = useRef(status);
	useEffect(() => {
		const wasBusy =
			prevStatusRef.current === "streaming" ||
			prevStatusRef.current === "submitted";
		prevStatusRef.current = status;
		if (!wasBusy) return;
		if (status === "ready") playCue("ready");
		if (status === "error") playCue("error");
	}, [status]);

	const modelBadgeLabel = useMemo(
		() =>
			// "DeepSeek: DeepSeek V4 Flash" -> "DeepSeek V4 Flash" so it fits the badge.
			getModelDisplayName(catalogModels, activeProvider, activeModel).replace(
				/^[^:]+:\s*/,
				"",
			),
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

	const activeSession = sessions.find(
		(session) => session.id === activeSessionId,
	);
	const activeChatTitle = activeSession?.title ?? "New chat";
	const isBusy = status === "streaming" || status === "submitted";

	const setupInfoBar =
		!canChat && !infoBarDismissed
			? {
					title: "Finish setup to start chatting",
					description: !hasModelKey
						? "Add your AI model API key in Settings."
						: "Add your Drishti API key in Settings.",
					position: "bottom" as const,
					onClose: () => setInfoBarDismissed(true),
					action: {
						label: "Open settings",
						onClick: () => openSettings(),
					},
				}
			: undefined;

	if (!storeHydrated) {
		return <ChatShellSkeleton />;
	}

	return (
		<div className="flex h-dvh flex-col">
			<OnboardingDialog
				open={onboardingStatus === "pending"}
				serverHasDrishtiKey={serverHasDrishtiKey}
			/>
			<div className="flex flex-1 overflow-hidden">
				<ChatSidebar
					activeSessionId={activeSessionId}
					collapsed={sidebarCollapsed}
					mobileOpen={mobileNavOpen}
					onCollapsedChange={handleSidebarCollapsedChange}
					onMobileOpenChange={setMobileNavOpen}
					onNewChat={() => createSession()}
					onPickPrompt={pickPrompt}
					onSelectSession={setActiveSession}
					onTogglePin={togglePinSession}
					portfolios={portfolios}
					sessions={sessions}
					watchlists={watchlists}
				/>
				<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
					<div className="flex items-center gap-1 border-border border-b px-2 py-2 sm:gap-2 sm:px-3">
						<Button
							aria-label="Open menu"
							className="size-9 lg:hidden"
							onClick={() => setMobileNavOpen(true)}
							size="icon"
							variant="ghost"
						>
							<List className="size-5" />
						</Button>
						<p className="min-w-0 flex-1 truncate px-1 font-medium text-sm">
							{activeChatTitle}
						</p>
						<Button
							aria-label="New chat"
							className="size-9 lg:hidden"
							onClick={() => createSession()}
							size="icon"
							title="New chat"
							variant="ghost"
						>
							<NotePencil className="size-5" />
						</Button>
						<Button
							aria-label={traceOpen ? "Hide trace" : "Show trace"}
							aria-pressed={traceOpen}
							className={cn(
								"hidden h-9 gap-1.5 px-2.5 lg:inline-flex",
								traceOpen && "bg-muted",
							)}
							onClick={() => handleTraceOpenChange(!traceOpen)}
							title="Show every MCP call: request, response and timing"
							variant="ghost"
						>
							<Pulse className="size-4" weight="light" />
							<span className="text-xs">Trace</span>
						</Button>
						<ChatExportButton
							disabled={messages.length === 0 || isBusy}
							messages={messages}
							title={activeChatTitle}
						/>
						<div className="xl:hidden">
							<ChatConfigSheet
								focusSignal={sheetFocus.signal}
								focusTarget={sheetFocus.target}
								onOpenChange={setConfigSheetOpen}
								open={configSheetOpen}
								serverHasDrishtiKey={serverHasDrishtiKey}
							/>
						</div>
					</div>
					<AgentChat
						className="flex-1"
						classNames={{ inputBar: "pb-1" }}
						emptyStatePosition="center"
						emptySuggestionsPlacement="empty"
						emptySuggestionsPosition="bottom"
						error={toReadableError(error)}
						infoBar={setupInfoBar}
						inputDisabled={!canChat}
						inputRightActions={
							<QueryCostMenu
								catalogModels={catalogModels}
								isStreaming={isBusy}
								lastQueryUsage={lastQueryUsage}
								modelId={activeModel}
								provider={activeProvider}
								sessionUsage={sessionQueryUsage}
							/>
						}
						messages={messages}
						modelBadge={modelBadgeLabel}
						onSend={({ content }) => sendPrompt(content)}
						onStop={stop}
						placeholder="Ask about stocks, results or F&O event risk, in English, Hindi or Gujarati..."
						prefill={prefill}
						status={status}
						suggestions={{
							items: SUGGESTIONS,
							className: "justify-center",
							itemClassName: "h-8",
						}}
						toolRenderers={CHAT_TOOL_RENDERERS}
					/>
					<p className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[10px] text-muted-foreground sm:text-[11px]">
						Response speed and answer quality depend on the AI model you choose.
						Drishti only supplies the market data.
					</p>
				</div>
				{traceOpen ? (
					<TracePanel
						messages={messages}
						onClose={() => handleTraceOpenChange(false)}
					/>
				) : null}
				<div className={cn("flex min-h-0", traceOpen && "hidden")}>
					<ChatConfigPanel
						focusSignal={panelFocus.signal}
						focusTarget={panelFocus.target}
						serverHasDrishtiKey={serverHasDrishtiKey}
					/>
				</div>
			</div>
		</div>
	);
}
