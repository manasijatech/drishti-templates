import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resolveModelForProvider } from "~/lib/models";
import { MODEL_COMPARE_MAX } from "~/lib/model-compare";
import { toCatalogModelId } from "~/lib/openrouter-models-core";
import { portfolioToContext } from "~/lib/portfolio-context";
import {
	DEFAULT_SUB_AGENT_PREFERENCES,
	normalizeSubAgentPreferences,
} from "~/lib/sub-agents";
import type {
	ChatSession,
	EncryptedApiKeyCredential,
	EncryptedModelConfig,
	LongTermMemory,
	ModelCompareTarget,
	ModelConfig,
	ModelProviderId,
	Portfolio,
	UserPreferences,
	Watchlist,
} from "~/types";

async function encryptApiKeyViaServer(apiKey: string) {
	const response = await fetch("/api/model-config/encrypt", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ apiKey }),
	});

	if (!response.ok) {
		const data = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(data?.error ?? "Failed to encrypt API key on server.");
	}

	return response.json() as Promise<{ encryptedApiKey: string; iv: string }>;
}

function sanitizeStoredModelConfig(
	config: EncryptedModelConfig,
): EncryptedModelConfig {
	if (config.provider !== "openrouter") return config;
	const model = resolveModelForProvider(
		"openrouter",
		config.model,
		config.model,
	);
	return { ...config, model };
}

export type OnboardingStatus = "pending" | "completed" | "skipped";

interface ModelStore {
	activeProvider: ModelProviderId;
	activeModel: string;
	configs: EncryptedModelConfig[];
	drishtiApiKey: EncryptedApiKeyCredential | null;
	onboardingStatus: OnboardingStatus;
	compareMode: boolean;
	compareModels: ModelCompareTarget[];
	setActiveModel: (provider: ModelProviderId, model: string) => void;
	setActiveProvider: (provider: ModelProviderId) => void;
	saveConfig: (config: ModelConfig) => Promise<void>;
	saveDrishtiApiKey: (apiKey: string) => Promise<void>;
	removeApiKey: (provider: ModelProviderId) => void;
	removeDrishtiApiKey: () => void;
	getActiveEncryptedConfig: () => EncryptedModelConfig | null;
	getEncryptedConfigForTarget: (target: ModelCompareTarget) => EncryptedModelConfig | null;
	getEncryptedDrishtiApiKey: () => EncryptedApiKeyCredential | null;
	hasStoredApiKey: (provider?: ModelProviderId) => boolean;
	hasStoredDrishtiApiKey: () => boolean;
	completeOnboarding: () => void;
	skipOnboarding: () => void;
	setCompareMode: (enabled: boolean) => void;
	toggleCompareModel: (target: ModelCompareTarget) => void;
	setCompareModels: (targets: ModelCompareTarget[]) => void;
}

export const useModelStore = create<ModelStore>()(
	persist(
		(set, get) => ({
			activeProvider: "openrouter",
			activeModel: "google/gemini-2.5-flash",
			configs: [],
			drishtiApiKey: null,
			onboardingStatus: "pending",
			compareMode: false,
			compareModels: [
				{ provider: "openrouter", model: "google/gemini-2.5-flash" },
				{ provider: "openrouter", model: "anthropic/claude-sonnet-4" },
			],

			setActiveModel: (provider, model) =>
				set({ activeProvider: provider, activeModel: model }),

			setActiveProvider: (provider) => {
				const state = get();
				const saved = state.configs.find((c) => c.provider === provider)?.model;
				const model = resolveModelForProvider(
					provider,
					state.activeProvider === provider ? state.activeModel : "",
					saved,
				);
				set({ activeProvider: provider, activeModel: model });
			},

			saveConfig: async (config) => {
				const existing = get().configs.find(
					(c) => c.provider === config.provider,
				);
				let encryptedApiKey = existing?.encryptedApiKey ?? "";
				let iv = existing?.iv ?? "";

				if (config.apiKey.trim()) {
					const encrypted = await encryptApiKeyViaServer(config.apiKey.trim());
					encryptedApiKey = encrypted.encryptedApiKey;
					iv = encrypted.iv;
				} else if (config.provider !== "ollama" && !encryptedApiKey) {
					throw new Error("API key is required.");
				}

				set((state) => {
					const filtered = state.configs.filter(
						(c) => c.provider !== config.provider,
					);
					return {
						configs: [
							...filtered,
							{
								provider: config.provider,
								model: config.model,
								encryptedApiKey,
								iv,
								baseUrl: config.baseUrl,
							},
						],
						activeProvider: config.provider,
						activeModel: config.model,
					};
				});
			},

			removeApiKey: (provider) =>
				set((state) => ({
					configs: state.configs.map((c) =>
						c.provider === provider ? { ...c, encryptedApiKey: "", iv: "" } : c,
					),
				})),

			saveDrishtiApiKey: async (apiKey) => {
				const trimmed = apiKey.trim();
				if (!trimmed) {
					throw new Error("Enter a Drishti MCP API key before saving.");
				}
				const encrypted = await encryptApiKeyViaServer(trimmed);
				set({
					drishtiApiKey: {
						encryptedApiKey: encrypted.encryptedApiKey,
						iv: encrypted.iv,
					},
				});
			},

			removeDrishtiApiKey: () => set({ drishtiApiKey: null }),

			getActiveEncryptedConfig: () => {
				const { activeProvider, activeModel } = get();
				const entry = get().configs.find((c) => c.provider === activeProvider);
				if (!entry) return null;
				return { ...entry, model: activeModel };
			},

			getEncryptedConfigForTarget: (target) => {
				const entry = get().configs.find((c) => c.provider === target.provider);
				if (!entry) return null;
				return { ...entry, model: target.model };
			},

			getEncryptedDrishtiApiKey: () => get().drishtiApiKey,

			hasStoredApiKey: (provider) => {
				const target = provider ?? get().activeProvider;
				if (target === "ollama") return true;
				const entry = get().configs.find((c) => c.provider === target);
				return Boolean(entry?.encryptedApiKey?.trim());
			},

			hasStoredDrishtiApiKey: () =>
				Boolean(get().drishtiApiKey?.encryptedApiKey?.trim()),

			completeOnboarding: () => set({ onboardingStatus: "completed" }),

			skipOnboarding: () => set({ onboardingStatus: "skipped" }),

			setCompareMode: (enabled) => set({ compareMode: enabled }),

			toggleCompareModel: (target) =>
				set((state) => {
					const normalized = {
						provider: target.provider,
						model: toCatalogModelId(target.provider, target.model),
					};
					const key = `${normalized.provider}:${normalized.model}`;
					const exists = state.compareModels.some(
						(entry) =>
							`${entry.provider}:${toCatalogModelId(entry.provider, entry.model)}` ===
							key,
					);
					if (exists) {
						return {
							compareModels: state.compareModels.filter(
								(entry) =>
									`${entry.provider}:${toCatalogModelId(entry.provider, entry.model)}` !==
									key,
							),
						};
					}
					if (state.compareModels.length >= MODEL_COMPARE_MAX) return state;
					return { compareModels: [...state.compareModels, normalized] };
				}),

			setCompareModels: (targets) =>
				set({ compareModels: targets.slice(0, MODEL_COMPARE_MAX) }),
		}),
		{
			name: "drishti-model-config",
			onRehydrateStorage: () => (state) => {
				if (!state) return;
				state.configs = state.configs.map(sanitizeStoredModelConfig);
				const saved = state.configs.find(
					(c) => c.provider === state.activeProvider,
				)?.model;
				state.activeModel = resolveModelForProvider(
					state.activeProvider,
					state.activeModel,
					saved,
				);

				const hasModelKey =
					state.activeProvider === "ollama" ||
					state.configs.some(
						(c) =>
							c.provider === state.activeProvider &&
							Boolean(c.encryptedApiKey?.trim()),
					);
				const hasDrishtiKey = Boolean(state.drishtiApiKey?.encryptedApiKey?.trim());

				if (!state.onboardingStatus) {
					state.onboardingStatus =
						hasModelKey && hasDrishtiKey ? "completed" : "pending";
				}
			},
		},
	),
);

interface MemoryStore extends LongTermMemory {
	updatePreferences: (prefs: Partial<UserPreferences>) => void;
	addWatchlist: (watchlist: Omit<Watchlist, "id" | "createdAt">) => void;
	removeWatchlist: (id: string) => void;
	addPortfolio: (
		portfolio: Omit<Portfolio, "id" | "createdAt" | "updatedAt">,
	) => void;
	updatePortfolio: (id: string, portfolio: Partial<Portfolio>) => void;
	removePortfolio: (id: string) => void;
	toContextString: () => string;
}

const defaultPreferences: UserPreferences = {
	favoriteSectors: [],
	subAgents: DEFAULT_SUB_AGENT_PREFERENCES,
};

export const useMemoryStore = create<MemoryStore>()(
	persist(
		(set, get) => ({
			preferences: defaultPreferences,
			watchlists: [],
			portfolios: [],

			updatePreferences: (prefs) =>
				set((state) => ({
					preferences: { ...state.preferences, ...prefs },
				})),

			addWatchlist: (watchlist) =>
				set((state) => ({
					watchlists: [
						...state.watchlists,
						{
							...watchlist,
							id: crypto.randomUUID(),
							createdAt: new Date().toISOString(),
						},
					],
				})),

			removeWatchlist: (id) =>
				set((state) => ({
					watchlists: state.watchlists.filter((w) => w.id !== id),
				})),

			addPortfolio: (portfolio) =>
				set((state) => ({
					portfolios: [
						...state.portfolios,
						{
							...portfolio,
							id: crypto.randomUUID(),
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
						},
					],
				})),

			updatePortfolio: (id, updates) =>
				set((state) => ({
					portfolios: state.portfolios.map((p) =>
						p.id === id
							? { ...p, ...updates, updatedAt: new Date().toISOString() }
							: p,
					),
				})),

			removePortfolio: (id) =>
				set((state) => ({
					portfolios: state.portfolios.filter((p) => p.id !== id),
				})),

			toContextString: () => {
				const { preferences, watchlists } = get();
				const parts: string[] = [];
				if (preferences.favoriteSectors.length) {
					parts.push(
						`Favorite sectors: ${preferences.favoriteSectors.join(", ")}`,
					);
				}
				if (watchlists.length) {
					parts.push(
						`Watchlists: ${watchlists.map((w) => `${w.name} (${w.symbols.join(", ")})`).join("; ")}`,
					);
				}
				return parts.join("\n");
			},
		}),
		{
			name: "drishti-memory",
			onRehydrateStorage: () => (state) => {
				if (!state) return;
				state.preferences = {
					...state.preferences,
					subAgents: normalizeSubAgentPreferences(state.preferences.subAgents),
				};
			},
		},
	),
);

interface ChatStore {
	sessions: ChatSession[];
	activeSessionId: string | null;
	createSession: () => string;
	setActiveSession: (id: string) => void;
	updateSession: (id: string, messages: ChatSession["messages"]) => void;
	deleteSession: (id: string) => void;
	togglePinSession: (id: string) => void;
}

function buildSessionTitle(messages: ChatSession["messages"]): string {
	const firstUser = messages.find((m) => m.role === "user");
	const titleText = firstUser?.parts
		?.filter((p) => p.type === "text")
		.map((p) => ("text" in p ? p.text : ""))
		.join(" ")
		.slice(0, 60);
	return titleText || "New chat";
}

export const useChatStore = create<ChatStore>()(
	persist(
		(set) => ({
			sessions: [],
			activeSessionId: null,

			createSession: () => {
				const id = crypto.randomUUID();
				set({ activeSessionId: id });
				return id;
			},

			setActiveSession: (id) => set({ activeSessionId: id }),

			updateSession: (id, messages) => {
				if (messages.length === 0) return;

				set((state) => {
					const now = new Date().toISOString();
					const existing = state.sessions.find((s) => s.id === id);

					if (existing) {
						return {
							sessions: state.sessions.map((s) =>
								s.id === id
									? {
											...s,
											messages,
											title: buildSessionTitle(messages),
											updatedAt: now,
										}
									: s,
							),
						};
					}

					return {
						sessions: [
							{
								id,
								title: buildSessionTitle(messages),
								messages,
								createdAt: now,
								updatedAt: now,
							},
							...state.sessions,
						],
					};
				});
			},

			deleteSession: (id) =>
				set((state) => {
					const remaining = state.sessions.filter((s) => s.id !== id);
					const wasActive = state.activeSessionId === id;
					return {
						sessions: remaining,
						activeSessionId: wasActive
							? (remaining[0]?.id ?? crypto.randomUUID())
							: state.activeSessionId,
					};
				}),

			togglePinSession: (id) =>
				set((state) => ({
					sessions: state.sessions.map((s) =>
						s.id === id ? { ...s, pinned: !s.pinned } : s,
					),
				})),
		}),
		{
			name: "drishti-chats",
			partialize: (state) => ({
				sessions: state.sessions.filter((s) => s.messages.length > 0),
				activeSessionId: state.activeSessionId,
			}),
			onRehydrateStorage: () => (state) => {
				if (!state) return;
				state.sessions = state.sessions.filter((s) => s.messages.length > 0);
				if (
					state.activeSessionId &&
					!state.sessions.some((s) => s.id === state.activeSessionId)
				) {
					// Keep draft active id when it has no stored messages yet.
					return;
				}
				if (!state.activeSessionId) {
					state.activeSessionId = crypto.randomUUID();
				}
			},
		},
	),
);

export { portfolioToContext };
