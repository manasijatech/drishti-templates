import type {
	CorporateActionLifecycle,
	WatchlistSymbol,
} from "@lifecycle/contracts";
import mongoose, { type Connection, type Model, Schema } from "mongoose";

import type { SourceAnnouncement } from "./domain";

type WatchlistDocument = {
	_id: string;
	companyName: string;
	companyLogo?: string;
	addedAt: string;
	lastSyncedAt?: string;
	lastAnnouncementAt?: string;
	backfillCompletedAt?: string;
	syncStatus?: WatchlistSymbol["syncStatus"];
	syncError?: string;
};

type AnnouncementDocument = {
	_id: string;
	symbol: string;
	occurredAt: Date;
	data: SourceAnnouncement;
};

type LifecycleDocument = {
	_id: string;
	symbol: string;
	actionType: string;
	updatedAt: Date;
	data: CorporateActionLifecycle;
};

export interface LifecycleRepository {
	close(): Promise<void>;
	listSymbols(): Promise<WatchlistSymbol[]>;
	getSymbol(symbol: string): Promise<WatchlistSymbol | undefined>;
	addSymbol(
		symbol: string,
		companyName: string,
		companyLogo?: string,
	): Promise<WatchlistSymbol>;
	removeSymbol(symbol: string): Promise<boolean>;
	setSyncState(
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
	): Promise<void>;
	upsertAnnouncements(announcements: SourceAnnouncement[]): Promise<number>;
	listAnnouncements(symbol: string): Promise<SourceAnnouncement[]>;
	replaceLifecycles(
		symbol: string,
		lifecycles: CorporateActionLifecycle[],
	): Promise<void>;
	listLifecycles(): Promise<CorporateActionLifecycle[]>;
	getLifecycle(id: string): Promise<CorporateActionLifecycle | undefined>;
	hasAnnouncement(id: string): Promise<boolean>;
}

export class MongoLifecycleRepository implements LifecycleRepository {
	private constructor(
		private readonly connection: Connection,
		private readonly watchlist: Model<WatchlistDocument>,
		private readonly announcements: Model<AnnouncementDocument>,
		private readonly lifecycles: Model<LifecycleDocument>,
	) {}

	static async connect(
		uri: string,
		maxPoolSize = 10,
	): Promise<MongoLifecycleRepository> {
		const connection = await mongoose
			.createConnection(uri, {
				bufferCommands: false,
				maxPoolSize,
				serverSelectionTimeoutMS: 10_000,
			})
			.asPromise();
		const watchlist = connection.model<WatchlistDocument>(
			"LifecycleWatchlist",
			watchlistSchema,
		);
		const announcements = connection.model<AnnouncementDocument>(
			"LifecycleAnnouncement",
			announcementSchema,
		);
		const lifecycles = connection.model<LifecycleDocument>(
			"CorporateActionLifecycle",
			lifecycleSchema,
		);
		await Promise.all([
			watchlist.createIndexes(),
			announcements.createIndexes(),
			lifecycles.createIndexes(),
		]);
		return new MongoLifecycleRepository(
			connection,
			watchlist,
			announcements,
			lifecycles,
		);
	}

	async close(): Promise<void> {
		await this.connection.close();
	}

	async listSymbols(): Promise<WatchlistSymbol[]> {
		const rows = await this.watchlist.find({}).sort({ _id: 1 }).lean().exec();
		return rows.map(mapWatchlistDocument);
	}

	async getSymbol(symbol: string): Promise<WatchlistSymbol | undefined> {
		const row = await this.watchlist.findById(symbol).lean().exec();
		return row ? mapWatchlistDocument(row) : undefined;
	}

	async addSymbol(
		symbol: string,
		companyName: string,
		companyLogo?: string,
	): Promise<WatchlistSymbol> {
		const identity = companyLogo
			? { companyName, companyLogo }
			: { companyName };
		const row = await this.watchlist
			.findOneAndUpdate(
				{ _id: symbol },
				{
					$set: identity,
					$setOnInsert: { addedAt: new Date().toISOString() },
				},
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			)
			.lean()
			.exec();
		return mapWatchlistDocument(row);
	}

	async removeSymbol(symbol: string): Promise<boolean> {
		const removed = await this.watchlist
			.findByIdAndDelete(symbol)
			.lean()
			.exec();
		if (!removed) return false;
		await this.lifecycles.deleteMany({ symbol }).exec();
		return true;
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
		const { syncError, ...fields } = update;
		await this.watchlist
			.updateOne(
				{ _id: symbol },
				syncError
					? { $set: { ...fields, syncError } }
					: { $set: fields, $unset: { syncError: "" } },
			)
			.exec();
	}

	async upsertAnnouncements(
		announcements: SourceAnnouncement[],
	): Promise<number> {
		if (announcements.length === 0) return 0;
		await this.announcements.bulkWrite(
			announcements.map((announcement) => ({
				updateOne: {
					filter: { _id: announcement.id },
					update: {
						$set: {
							symbol: announcement.symbol,
							occurredAt: new Date(announcement.date),
							data: announcement,
						},
					},
					upsert: true,
				},
			})),
		);
		return announcements.length;
	}

	async listAnnouncements(symbol: string): Promise<SourceAnnouncement[]> {
		const rows = await this.announcements
			.find({ symbol })
			.select({ data: 1 })
			.sort({ occurredAt: 1, _id: 1 })
			.lean()
			.exec();
		return rows.map((row) => row.data);
	}

	async replaceLifecycles(
		symbol: string,
		lifecycles: CorporateActionLifecycle[],
	): Promise<void> {
		if (lifecycles.length === 0) {
			await this.lifecycles.deleteMany({ symbol }).exec();
			return;
		}
		await this.lifecycles.bulkWrite(
			lifecycles.map((lifecycle) => ({
				updateOne: {
					filter: { _id: lifecycle.id },
					update: {
						$set: {
							symbol,
							actionType: lifecycle.actionType,
							updatedAt: new Date(lifecycle.updatedAt),
							data: lifecycle,
						},
					},
					upsert: true,
				},
			})),
		);
		await this.lifecycles
			.deleteMany({ symbol, _id: { $nin: lifecycles.map((item) => item.id) } })
			.exec();
	}

	async listLifecycles(): Promise<CorporateActionLifecycle[]> {
		const rows = await this.lifecycles
			.find({})
			.select({ data: 1 })
			.sort({ updatedAt: -1, _id: 1 })
			.lean()
			.exec();
		return rows.map((row) => row.data);
	}

	async getLifecycle(
		id: string,
	): Promise<CorporateActionLifecycle | undefined> {
		const row = await this.lifecycles
			.findById(id)
			.select({ data: 1 })
			.lean()
			.exec();
		return row?.data;
	}

	async hasAnnouncement(id: string): Promise<boolean> {
		return Boolean(await this.announcements.exists({ _id: id }));
	}
}

const watchlistSchema = new Schema<WatchlistDocument>(
	{
		_id: { type: String, required: true },
		companyName: { type: String, required: true, trim: true },
		companyLogo: { type: String, trim: true },
		addedAt: { type: String, required: true },
		lastSyncedAt: { type: String },
		lastAnnouncementAt: { type: String },
		backfillCompletedAt: { type: String },
		syncStatus: {
			type: String,
			enum: ["pending", "backfilling", "live", "degraded"],
		},
		syncError: { type: String },
	},
	{ collection: "lifecycle_watchlist", versionKey: false },
);

const announcementSchema = new Schema<AnnouncementDocument>(
	{
		_id: { type: String, required: true },
		symbol: { type: String, required: true, index: true },
		occurredAt: { type: Date, required: true },
		data: { type: Schema.Types.Mixed, required: true },
	},
	{ collection: "lifecycle_announcements", versionKey: false },
);
announcementSchema.index({ symbol: 1, occurredAt: 1 });

const lifecycleSchema = new Schema<LifecycleDocument>(
	{
		_id: { type: String, required: true },
		symbol: { type: String, required: true, index: true },
		actionType: { type: String, required: true },
		updatedAt: { type: Date, required: true },
		data: { type: Schema.Types.Mixed, required: true },
	},
	{ collection: "corporate_action_lifecycles_v2", versionKey: false },
);
lifecycleSchema.index({ symbol: 1, updatedAt: -1 });

function mapWatchlistDocument(row: WatchlistDocument): WatchlistSymbol {
	return {
		symbol: row._id,
		companyName: row.companyName,
		companyLogo: row.companyLogo,
		addedAt: row.addedAt,
		lastSyncedAt: row.lastSyncedAt,
		lastAnnouncementAt: row.lastAnnouncementAt,
		backfillCompletedAt: row.backfillCompletedAt,
		syncStatus: row.syncStatus,
		syncError: row.syncError,
	};
}
