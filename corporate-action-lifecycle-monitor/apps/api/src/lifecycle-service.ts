import type {
	CorporateActionLifecycle,
	LifecycleListResponse,
	LifecycleSnapshot,
	LifecycleSocketMessage,
	LifecycleStreamDetails,
	LifecycleSummary,
	WatchlistSymbol,
} from "@lifecycle/contracts";

import { buildLifecycles, type SourceAnnouncement } from "./domain";
import type { LifecycleValidator } from "./lifecycle-validator";
import type { MarketDataSource, StreamHandle } from "./market-data";
import type { LifecycleRepository } from "./repository";

const RECOVERY_OVERLAP_MS = 10 * 60 * 1_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

type SocketListener = (message: LifecycleSocketMessage) => void;

export class LifecycleService {
	private stream?: StreamHandle;
	private streamSetup?: Promise<void>;
	private readonly pipelines = new Map<string, Promise<unknown>>();
	private readonly removingSymbols = new Set<string>();
	private readonly degradedSymbols = new Set<string>();
	private readonly listeners = new Set<SocketListener>();
	private activeBackfills = 0;
	private heartbeat?: ReturnType<typeof setInterval>;
	private streamDetails: LifecycleStreamDetails;

	constructor(
		readonly repository: LifecycleRepository,
		private readonly market?: MarketDataSource,
		private readonly validator?: LifecycleValidator,
	) {
		this.streamDetails = {
			status: market ? "disconnected" : "not_configured",
		};
	}

	async start(): Promise<void> {
		this.startHeartbeat();
		if (!this.market) return;
		await this.ensureStream();
		await this.syncAll();
	}

	async stop(): Promise<void> {
		if (this.heartbeat) clearInterval(this.heartbeat);
		this.heartbeat = undefined;
		await this.stream?.close();
		this.stream = undefined;
	}

	subscribe(listener: SocketListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	listSymbols(): Promise<WatchlistSymbol[]> {
		return this.repository.listSymbols();
	}

	async snapshot(): Promise<LifecycleSnapshot> {
		const response = await this.listLifecycles();
		return { ...response, symbols: await this.repository.listSymbols() };
	}

	async addSymbol(input: string): Promise<WatchlistSymbol> {
		if (!this.market) throw new ServiceUnavailableError();
		const symbol = normalizeSymbol(input);
		const identity = await this.market.resolveSymbol(symbol);
		if (!identity) throw new UnknownSymbolError(symbol);
		this.removingSymbols.delete(identity.symbol);
		const saved = await this.repository.addSymbol(
			identity.symbol,
			identity.companyName,
			identity.companyLogo,
		);
		await this.repository.setSyncState(identity.symbol, {
			syncStatus: saved.backfillCompletedAt ? "live" : "pending",
		});
		try {
			await this.ensureStream();
			await this.syncSymbol(identity.symbol);
		} catch (error) {
			if (!saved.backfillCompletedAt) {
				await this.repository.removeSymbol(symbol);
				await this.ensureStream().catch(() => undefined);
			}
			await this.broadcastSnapshot();
			throw error;
		}
		await this.broadcastSnapshot();
		return (await this.repository.getSymbol(identity.symbol)) ?? saved;
	}

	async removeSymbol(input: string): Promise<boolean> {
		const symbol = normalizeSymbol(input);
		this.removingSymbols.add(symbol);
		await this.pipelines.get(symbol)?.catch(() => undefined);
		const removed = await this.repository.removeSymbol(symbol);
		if (removed) {
			this.degradedSymbols.delete(symbol);
			await this.ensureStream();
			await this.broadcastSnapshot();
		}
		return removed;
	}

	async listLifecycles(): Promise<LifecycleListResponse> {
		const data = await this.repository.listLifecycles();
		return {
			data,
			summary: summarize(data),
			stream: this.streamStatus(),
			streamDetails: { ...this.streamDetails },
		};
	}

	streamStatus(): LifecycleListResponse["stream"] {
		if (!this.market) return "not_configured";
		if (this.activeBackfills > 0) return "backfilling";
		return this.streamDetails.status;
	}

	getLifecycle(id: string): Promise<CorporateActionLifecycle | undefined> {
		return this.repository.getLifecycle(id);
	}

	async getSourceDocument(id: string): Promise<Response> {
		if (!this.market) throw new ServiceUnavailableError();
		if (!(await this.repository.hasAnnouncement(id)))
			return new Response(null, { status: 404 });
		return this.market.getSourceDocument(id);
	}

	async syncAll(): Promise<void> {
		const symbols = await this.repository.listSymbols();
		await Promise.allSettled(
			symbols.map((item) => this.syncSymbol(item.symbol)),
		);
	}

	async syncSymbol(symbol: string): Promise<CorporateActionLifecycle[]> {
		if (!this.market) throw new ServiceUnavailableError();
		const normalized = normalizeSymbol(symbol);
		if (this.removingSymbols.has(normalized)) return [];
		if (!(await this.repository.getSymbol(normalized)))
			throw new UnknownSymbolError(normalized);
		return this.enqueue(normalized, () => this.performSync(normalized));
	}

	private async performSync(
		symbol: string,
	): Promise<CorporateActionLifecycle[]> {
		const watched = await this.repository.getSymbol(symbol);
		if (!watched || this.removingSymbols.has(symbol)) return [];
		const cutoff = new Date().toISOString();
		const from = watched.backfillCompletedAt
			? recoveryStart(watched.lastAnnouncementAt ?? watched.lastSyncedAt)
			: undefined;
		this.activeBackfills += 1;
		await this.repository.setSyncState(symbol, { syncStatus: "backfilling" });
		this.setStreamState("backfilling");
		try {
			const announcements = (
				await this.market?.listAnnouncements(symbol, { from, to: cutoff })
			)?.map((announcement) => ({
				...announcement,
				companyLogo: announcement.companyLogo ?? watched.companyLogo,
			}));
			if (this.removingSymbols.has(symbol)) return [];
			await this.repository.upsertAnnouncements(announcements ?? []);
			const allAnnouncements = await this.repository.listAnnouncements(symbol);
			const previous = (await this.repository.listLifecycles()).filter(
				(item) => item.symbol === symbol,
			);
			const lifecycles = await this.validateLifecycles(
				buildLifecycles(allAnnouncements, {
					existing: previous,
				}),
			);
			await this.repository.replaceLifecycles(symbol, lifecycles);
			const latest = allAnnouncements.at(-1)?.date;
			await this.repository.setSyncState(symbol, {
				lastSyncedAt: cutoff,
				lastAnnouncementAt: latest,
				backfillCompletedAt: watched.backfillCompletedAt ?? cutoff,
				syncStatus: "live",
			});
			this.degradedSymbols.delete(symbol);
			this.streamDetails.lastCatchupAt = cutoff;
			await this.broadcastLifecycleDiff(previous, lifecycles);
			return lifecycles;
		} catch (error) {
			this.degradedSymbols.add(symbol);
			await this.repository.setSyncState(symbol, {
				lastSyncedAt: cutoff,
				syncStatus: "degraded",
				syncError: publicError(error),
			});
			this.setStreamState("degraded", publicError(error));
			throw error;
		} finally {
			this.activeBackfills = Math.max(0, this.activeBackfills - 1);
			if (this.activeBackfills === 0 && this.stream?.connected()) {
				this.setStreamState(
					this.degradedSymbols.size > 0 ? "degraded" : "connected",
				);
			}
		}
	}

	private ingestAnnouncement(announcement: SourceAnnouncement): void {
		void this.enqueue(announcement.symbol, () =>
			this.performIngest(announcement),
		).catch((error) => {
			this.setStreamState("degraded", publicError(error));
		});
	}

	private async performIngest(announcement: SourceAnnouncement): Promise<void> {
		if (this.removingSymbols.has(announcement.symbol)) return;
		const watched = await this.repository.getSymbol(announcement.symbol);
		if (!watched) return;
		const previous = (await this.repository.listLifecycles()).filter(
			(item) => item.symbol === announcement.symbol,
		);
		await this.repository.upsertAnnouncements([
			{
				...announcement,
				companyLogo: announcement.companyLogo ?? watched.companyLogo,
			},
		]);
		const lifecycles = await this.validateLifecycles(
			buildLifecycles(
				await this.repository.listAnnouncements(announcement.symbol),
				{ existing: previous },
			),
		);
		await this.repository.replaceLifecycles(announcement.symbol, lifecycles);
		const receivedAt = new Date().toISOString();
		await this.repository.setSyncState(announcement.symbol, {
			lastSyncedAt: receivedAt,
			lastAnnouncementAt: maxIso(watched.lastAnnouncementAt, announcement.date),
			syncStatus: "live",
		});
		this.degradedSymbols.delete(announcement.symbol);
		if (
			this.degradedSymbols.size === 0 &&
			this.activeBackfills === 0 &&
			this.stream?.connected()
		)
			this.setStreamState("connected");
		this.streamDetails.lastEventAt = receivedAt;
		await this.broadcastLifecycleDiff(previous, lifecycles);
	}

	private async ensureStream(): Promise<void> {
		if (!this.market) return;
		if (this.streamSetup) return this.streamSetup;
		this.streamSetup = this.configureStream().finally(() => {
			this.streamSetup = undefined;
		});
		return this.streamSetup;
	}

	private async configureStream(): Promise<void> {
		const market = this.market;
		if (!market) return;
		const symbols = (await this.repository.listSymbols()).map(
			(item) => item.symbol,
		);
		if (symbols.length === 0) {
			await this.stream?.close();
			this.stream = undefined;
			this.setStreamState("disconnected");
			return;
		}
		this.setStreamState("connecting");
		if (this.stream) {
			await this.stream.replaceSymbols(symbols);
			if (this.stream.connected()) this.setStreamState("connected");
			return;
		}
		this.stream = await market.openStream(
			symbols,
			(announcement) => this.ingestAnnouncement(announcement),
			{
				onConnected: (reconnected) => {
					this.streamDetails.connectedAt = new Date().toISOString();
					this.setStreamState(
						this.activeBackfills > 0 ? "backfilling" : "connected",
					);
					if (reconnected) void this.syncAll();
				},
				onDisconnected: (reason) => {
					this.streamDetails.disconnectedAt = new Date().toISOString();
					this.setStreamState("disconnected", reason);
				},
				onError: (error) => this.setStreamState("degraded", error.message),
			},
		);
		if (this.stream.connected()) this.setStreamState("connected");
	}

	private enqueue<T>(symbol: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.pipelines.get(symbol) ?? Promise.resolve();
		const next = previous.catch(() => undefined).then(operation);
		const tracked = next.finally(() => {
			if (this.pipelines.get(symbol) === tracked) this.pipelines.delete(symbol);
		});
		this.pipelines.set(symbol, tracked);
		return next;
	}

	private async validateLifecycles(
		lifecycles: CorporateActionLifecycle[],
	): Promise<CorporateActionLifecycle[]> {
		if (!this.validator) return lifecycles;
		return Promise.all(
			lifecycles.map(async (lifecycle) => {
				try {
					const aiValidation = await this.validator?.validate(lifecycle);
					return aiValidation ? { ...lifecycle, aiValidation } : lifecycle;
				} catch {
					return lifecycle;
				}
			}),
		);
	}

	private setStreamState(
		status: LifecycleStreamDetails["status"],
		error?: string,
	): void {
		this.streamDetails = {
			...this.streamDetails,
			status,
			error,
		};
		this.broadcast({
			type: "stream.status",
			stream: status,
			streamDetails: { ...this.streamDetails },
		});
	}

	private async broadcastLifecycleDiff(
		previous: CorporateActionLifecycle[],
		next: CorporateActionLifecycle[],
	): Promise<void> {
		const currentIds = new Set(next.map((item) => item.id));
		const summary = summarize(await this.repository.listLifecycles());
		for (const lifecycle of next) {
			this.broadcast({
				type: "lifecycle.upsert",
				data: lifecycle,
				summary,
			});
		}
		for (const lifecycle of previous) {
			if (!currentIds.has(lifecycle.id)) {
				this.broadcast({
					type: "lifecycle.delete",
					id: lifecycle.id,
					symbol: lifecycle.symbol,
					summary,
				});
			}
		}
	}

	private async broadcastSnapshot(): Promise<void> {
		this.broadcast({ type: "snapshot", ...(await this.snapshot()) });
	}

	private broadcast(message: LifecycleSocketMessage): void {
		for (const listener of this.listeners) listener(message);
	}

	private startHeartbeat(): void {
		if (this.heartbeat) return;
		this.heartbeat = setInterval(
			() => this.broadcast({ type: "heartbeat", at: new Date().toISOString() }),
			HEARTBEAT_INTERVAL_MS,
		);
	}
}

export class UnknownSymbolError extends Error {
	constructor(symbol: string) {
		super(`No listed company was found for ${symbol}.`);
	}
}

export class ServiceUnavailableError extends Error {
	constructor() {
		super("Drishti is not configured. Set DRISHTI_API_KEY on the backend.");
	}
}

export function normalizeSymbol(value: string): string {
	const symbol = value.trim().toUpperCase();
	if (!/^[A-Z0-9&.-]{1,24}$/.test(symbol)) {
		throw new Error("Enter a valid NSE or BSE symbol.");
	}
	return symbol;
}

function recoveryStart(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const timestamp = new Date(value).getTime();
	return Number.isNaN(timestamp)
		? undefined
		: new Date(timestamp - RECOVERY_OVERLAP_MS).toISOString();
}

function maxIso(left: string | undefined, right: string): string {
	if (!left) return right;
	return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function summarize(data: CorporateActionLifecycle[]): LifecycleSummary {
	const today = new Date().toISOString().slice(0, 10);
	return data.reduce<LifecycleSummary>(
		(summary, item) => {
			if (item.state === "active") summary.active += 1;
			if (item.state === "completed") summary.completed += 1;
			if (item.state === "needs_review") summary.needsReview += 1;
			if (item.updatedAt.slice(0, 10) === today) summary.updatedToday += 1;
			if (item.nextExpectedDate) summary.upcomingDates += 1;
			return summary;
		},
		{
			active: 0,
			upcomingDates: 0,
			updatedToday: 0,
			completed: 0,
			needsReview: 0,
		},
	);
}

function publicError(error: unknown): string {
	return error instanceof Error ? "Sync failed. Try again." : "Sync failed.";
}
