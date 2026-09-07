import {
  type IngestionRun,
  ingestionRunSchema,
  type ListOrderWinsQuery,
  type OrderWin,
  type OrderWinCandidate,
  orderWinSchema,
} from "@order-win/contracts";
import type { OrderWinRepository, UpsertOutcome } from "@order-win/core";
import { IngestionLeaseLostError } from "@order-win/core";
import mongoose, { type Model, Schema } from "mongoose";

type OrderWinDocument = OrderWinCandidate & {
  readonly _id: mongoose.Types.ObjectId;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
};

type IngestionRunDocument = Omit<IngestionRun, "id"> & {
  readonly _id: mongoose.Types.ObjectId;
};

const orderWinMongooseSchema = new Schema<OrderWinDocument>(
  {
    source: { type: String, required: true, enum: ["drishti"] },
    sourceAnnouncementId: { type: String, required: true },
    symbol: { type: String, required: true, index: true },
    companyName: { type: String, default: null },
    announcedAt: { type: Date, default: null, index: true },
    category: { type: String, required: true, enum: ["Award/Receipt of Order"] },
    summary: { type: String, default: null },
    longSummary: { type: String, default: null },
    relatedCategories: { type: [String], required: true, default: [] },
    important: { type: Boolean, default: null },
    extractedInformation: { type: Schema.Types.Mixed, default: null },
    sourceImageUrl: { type: String, default: null },
    contentHash: { type: String, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    schemaVersion: { type: Number, required: true, enum: [1] },
  },
  { collection: "order_wins", strict: "throw", versionKey: false },
);
orderWinMongooseSchema.index({ source: 1, sourceAnnouncementId: 1 }, { unique: true });

const ingestionRunMongooseSchema = new Schema<IngestionRunDocument>(
  {
    status: {
      type: String,
      required: true,
      enum: ["running", "succeeded", "partially_succeeded", "failed"],
    },
    trigger: { type: String, required: true, enum: ["manual", "scheduled"] },
    window: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
    pagesFetched: { type: Number, required: true },
    recordsFetched: { type: Number, required: true },
    recordsInserted: { type: Number, required: true },
    recordsUpdated: { type: Number, required: true },
    recordsUnchanged: { type: Number, required: true },
    recordsRejected: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    error: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "ingestion_runs", strict: "throw", versionKey: false },
);

const ingestionLockSchema = new Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "ingestion_locks", strict: "throw", versionKey: false },
);

const trackingConfigurationSchema = new Schema(
  {
    _id: { type: String, required: true },
    symbols: { type: [String], required: true, default: [] },
    updatedAt: { type: Date, required: true },
  },
  { collection: "tracking_configurations", strict: "throw", versionKey: false },
);

function toOrderWin(document: OrderWinDocument): OrderWin {
  return orderWinSchema.parse({ ...document, id: document._id.toHexString() });
}

function toIngestionRun(document: IngestionRunDocument): IngestionRun {
  return ingestionRunSchema.parse({ ...document, id: document._id.toHexString() });
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}

export class MongoOrderWinRepository implements OrderWinRepository {
  private readonly connection: mongoose.Connection;
  private readonly orderWins: Model<OrderWinDocument>;
  private readonly ingestionRuns: Model<IngestionRunDocument>;
  private readonly ingestionLocks: Model<{
    _id: string;
    ownerId: string;
    expiresAt: Date;
  }>;
  private readonly trackingConfigurations: Model<{
    _id: string;
    symbols: string[];
    updatedAt: Date;
  }>;

  constructor(connection: mongoose.Connection) {
    this.connection = connection;
    this.orderWins = connection.model("OrderWin", orderWinMongooseSchema);
    this.ingestionRuns = connection.model("IngestionRun", ingestionRunMongooseSchema);
    this.ingestionLocks = connection.model("IngestionLock", ingestionLockSchema);
    this.trackingConfigurations = connection.model(
      "TrackingConfiguration",
      trackingConfigurationSchema,
    );
  }

  async acquireIngestionLock(ownerId: string, durationMs: number) {
    try {
      await this.ingestionLocks.updateOne(
        { _id: "order-wins" },
        { $setOnInsert: { ownerId: "", expiresAt: new Date(0) } },
        { upsert: true },
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    const result = await this.ingestionLocks
      .findOneAndUpdate(
        {
          _id: "order-wins",
          $or: [{ ownerId }, { $expr: { $lte: ["$expiresAt", "$$NOW"] } }],
        },
        [
          {
            $set: {
              ownerId,
              expiresAt: {
                $dateAdd: { startDate: "$$NOW", unit: "millisecond", amount: durationMs },
              },
            },
          },
        ],
        { new: true },
      )
      .lean();
    return result?.ownerId === ownerId;
  }

  async releaseIngestionLock(ownerId: string) {
    await this.ingestionLocks.deleteOne({ _id: "order-wins", ownerId });
  }

  async renewIngestionLock(ownerId: string, durationMs: number) {
    const result = await this.ingestionLocks.updateOne(
      { _id: "order-wins", ownerId, $expr: { $gt: ["$expiresAt", "$$NOW"] } },
      [
        {
          $set: {
            expiresAt: {
              $dateAdd: { startDate: "$$NOW", unit: "millisecond", amount: durationMs },
            },
          },
        },
      ],
    );
    return result.matchedCount === 1;
  }

  async abandonRunningRuns(completedAt: Date) {
    await this.ingestionRuns.updateMany(
      { status: "running" },
      {
        $set: {
          status: "failed",
          completedAt,
          error: { code: "INGESTION_ABANDONED", message: "Ingestion worker stopped" },
        },
      },
    );
  }

  async createRun(input: {
    readonly trigger: "manual" | "scheduled";
    readonly window: { readonly from: Date; readonly to: Date };
    readonly startedAt: Date;
  }) {
    const created = await this.ingestionRuns.create({
      ...input,
      status: "running",
      pagesFetched: 0,
      recordsFetched: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      recordsRejected: 0,
      completedAt: null,
      error: null,
    });
    return toIngestionRun(created.toObject());
  }

  async completeRun(run: IngestionRun) {
    const { id, ...update } = run;
    const updated = await this.ingestionRuns
      .findOneAndUpdate({ _id: id, status: "running" }, { $set: update }, { new: true })
      .lean();
    if (updated) return toIngestionRun(updated);
    const terminal = await this.ingestionRuns.findById(id).lean();
    if (!terminal) throw new Error(`Ingestion run ${id} disappeared during update`);
    return toIngestionRun(terminal);
  }

  async upsertWithLease(
    candidate: OrderWinCandidate,
    seenAt: Date,
    lease: { readonly ownerId: string; readonly durationMs: number },
  ): Promise<UpsertOutcome> {
    const session = await this.connection.startSession();
    let outcome: UpsertOutcome | null = null;
    try {
      await session.withTransaction(async () => {
        const lock = await this.ingestionLocks.updateOne(
          {
            _id: "order-wins",
            ownerId: lease.ownerId,
            $expr: { $gt: ["$expiresAt", "$$NOW"] },
          },
          [
            {
              $set: {
                expiresAt: {
                  $dateAdd: {
                    startDate: "$$NOW",
                    unit: "millisecond",
                    amount: lease.durationMs,
                  },
                },
              },
            },
          ],
          { session },
        );
        if (lock.matchedCount !== 1) throw new IngestionLeaseLostError();

        const existing = await this.orderWins
          .findOne({
            source: candidate.source,
            sourceAnnouncementId: candidate.sourceAnnouncementId,
          })
          .session(session)
          .lean();
        if (!existing) {
          await this.orderWins.create([{ ...candidate, firstSeenAt: seenAt, lastSeenAt: seenAt }], {
            session,
          });
          outcome = "inserted";
          return;
        }
        if (existing.contentHash === candidate.contentHash) {
          await this.orderWins.updateOne(
            { _id: existing._id },
            { $set: { lastSeenAt: seenAt } },
            { session },
          );
          outcome = "unchanged";
          return;
        }
        await this.orderWins.updateOne(
          { _id: existing._id },
          { $set: { ...candidate, lastSeenAt: seenAt } },
          { session },
        );
        outcome = "updated";
      });
    } finally {
      await session.endSession();
    }
    if (!outcome) throw new Error("Order-win transaction completed without an outcome");
    return outcome;
  }

  async list(query: ListOrderWinsQuery) {
    const filter: { symbol?: string; _id?: { $lt: mongoose.Types.ObjectId } } = {};
    if (query.symbol) filter.symbol = query.symbol.toUpperCase();
    if (query.cursor && mongoose.isValidObjectId(query.cursor)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(query.cursor) };
    }
    const documents = await this.orderWins
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean();
    const hasNext = documents.length > query.limit;
    const page = documents.slice(0, query.limit);
    return {
      items: page.map(toOrderWin),
      nextCursor: hasNext ? (page.at(-1)?._id.toHexString() ?? null) : null,
    };
  }

  async findRun(id: string) {
    if (!mongoose.isValidObjectId(id)) return null;
    const document = await this.ingestionRuns.findById(id).lean();
    return document ? toIngestionRun(document) : null;
  }

  async getTrackedSymbols() {
    const configuration = await this.trackingConfigurations.findById("current").lean();
    return configuration?.symbols ?? [];
  }

  async setTrackedSymbols(symbols: readonly string[], updatedAt: Date) {
    const configuration = await this.trackingConfigurations
      .findByIdAndUpdate(
        "current",
        { $set: { symbols: [...symbols], updatedAt } },
        { upsert: true, new: true },
      )
      .lean();
    if (!configuration) throw new Error("Tracking configuration disappeared during update");
    return configuration.symbols;
  }
}

export async function connectMongoose(uri: string) {
  return mongoose.createConnection(uri).asPromise();
}
