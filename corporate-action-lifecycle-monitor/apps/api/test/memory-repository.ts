import type {
	CorporateActionLifecycle,
	WatchlistSymbol,
} from "@lifecycle/contracts";

import type { SourceAnnouncement } from "../src/domain";
import type { LifecycleRepository } from "../src/repository";

export class MemoryLifecycleRepository implements LifecycleRepository {
	private readonly symbols = new Map<string, WatchlistSymbol>();
	private readonly announcements = new Map<string, SourceAnnouncement>();
	private readonly lifecycles = new Map<string, CorporateActionLifecycle>();

	async close(): Promise<void> {}

	async listSymbols(): Promise<WatchlistSymbol[]> {
		return [...this.symbols.values()].sort((a, b) =>
			a.symbol.localeCompare(b.symbol),
		);
	}

	async getSymbol(symbol: string): Promise<WatchlistSymbol | undefined> {
		return this.symbols.get(symbol);
	}

	async addSymbol(
		symbol: string,
		companyName: string,
		companyLogo?: string,
	): Promise<WatchlistSymbol> {
		const saved = {
			...this.symbols.get(symbol),
			symbol,
			companyName,
			companyLogo: companyLogo ?? this.symbols.get(symbol)?.companyLogo,
			addedAt: this.symbols.get(symbol)?.addedAt ?? new Date().toISOString(),
		};
		this.symbols.set(symbol, saved);
		return saved;
	}

	async removeSymbol(symbol: string): Promise<boolean> {
		const removed = this.symbols.delete(symbol);
		for (const [id, row] of this.lifecycles) {
			if (row.symbol === symbol) this.lifecycles.delete(id);
		}
		return removed;
	}

	async setSyncState(
		symbol: string,
		update: Partial<
			Pick<
				WatchlistSymbol,
				| "lastSyncedAt"
				| "lastAnnouncementAt"
				| "backfillCompletedAt"
				| "syncStatus"
				| "syncError"
			>
		>,
	): Promise<void> {
		const row = this.symbols.get(symbol);
		if (!row) return;
		this.symbols.set(symbol, {
			...row,
			...update,
			syncError: update.syncError,
		});
	}

	async upsertAnnouncements(rows: SourceAnnouncement[]): Promise<number> {
		for (const row of rows) this.announcements.set(row.id, row);
		return rows.length;
	}

	async listAnnouncements(symbol: string): Promise<SourceAnnouncement[]> {
		return [...this.announcements.values()]
			.filter((row) => row.symbol === symbol)
			.sort((a, b) => a.date.localeCompare(b.date));
	}

	async replaceLifecycles(
		symbol: string,
		rows: CorporateActionLifecycle[],
	): Promise<void> {
		for (const [id, row] of this.lifecycles) {
			if (row.symbol === symbol) this.lifecycles.delete(id);
		}
		for (const row of rows) this.lifecycles.set(row.id, row);
	}

	async listLifecycles(): Promise<CorporateActionLifecycle[]> {
		return [...this.lifecycles.values()].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
	}

	async getLifecycle(
		id: string,
	): Promise<CorporateActionLifecycle | undefined> {
		return this.lifecycles.get(id);
	}

	async hasAnnouncement(id: string): Promise<boolean> {
		return this.announcements.has(id);
	}
}
