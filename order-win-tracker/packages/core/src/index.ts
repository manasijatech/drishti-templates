import type {
  DrishtiAnnouncement,
  IngestionRun,
  ListOrderWinsQuery,
  OrderWin,
  OrderWinCandidate,
} from "@order-win/contracts";
import { ORDER_WIN_CATEGORY } from "@order-win/contracts";

export type AnnouncementPageRequest = {
  readonly from: Date;
  readonly to: Date;
  readonly page: number;
  readonly limit: number;
};

export type AnnouncementPage = {
  readonly data: readonly DrishtiAnnouncement[];
  readonly hasNext: boolean;
};

export interface AnnouncementSource {
  fetchOrderWins(request: AnnouncementPageRequest): Promise<AnnouncementPage>;
}

export type UpsertOutcome = "inserted" | "updated" | "unchanged";

export interface OrderWinRepository {
  acquireIngestionLock(ownerId: string, durationMs: number): Promise<boolean>;
  renewIngestionLock(ownerId: string, durationMs: number): Promise<boolean>;
  releaseIngestionLock(ownerId: string): Promise<void>;
  abandonRunningRuns(completedAt: Date): Promise<void>;
  createRun(input: {
    readonly trigger: "manual" | "scheduled";
    readonly window: { readonly from: Date; readonly to: Date };
    readonly startedAt: Date;
  }): Promise<IngestionRun>;
  completeRun(run: IngestionRun): Promise<IngestionRun>;
  upsertWithLease(
    candidate: OrderWinCandidate,
    seenAt: Date,
    lease: { readonly ownerId: string; readonly durationMs: number },
  ): Promise<UpsertOutcome>;
  list(query: ListOrderWinsQuery): Promise<{
    readonly items: readonly OrderWin[];
    readonly nextCursor: string | null;
  }>;
  findRun(id: string): Promise<IngestionRun | null>;
}

export type IngestionOptions = {
  readonly pageSize: number;
  readonly maxPages: number;
  readonly lockDurationMs: number;
};

export class IngestionConflictError extends Error {
  constructor() {
    super("An order-win ingestion is already running");
    this.name = "IngestionConflictError";
  }
}

export class IngestionLeaseLostError extends Error {
  constructor() {
    super("The order-win ingestion lease was lost");
    this.name = "IngestionLeaseLostError";
  }
}

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function parseAnnouncementDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const parsed = new Date(hasExplicitOffset ? value : `${value}+05:30`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid announcement date: ${value}`);
  return parsed;
}

async function contentHash(value: object): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeAnnouncement(
  announcement: DrishtiAnnouncement,
): Promise<OrderWinCandidate | null> {
  if (announcement.category !== ORDER_WIN_CATEGORY) return null;

  const normalized = {
    source: "drishti" as const,
    sourceAnnouncementId: announcement.id,
    symbol: announcement.symbol.trim().toUpperCase(),
    companyName: nullable(announcement.company_name),
    announcedAt: parseAnnouncementDate(announcement.date),
    category: ORDER_WIN_CATEGORY,
    summary: nullable(announcement.summary),
    longSummary: nullable(announcement.long_summary),
    relatedCategories: announcement.related_categories ?? [],
    important: nullable(announcement.important),
    extractedInformation: nullable(announcement.extracted_information),
    sourceImageUrl: nullable(announcement.image),
    schemaVersion: 1 as const,
  };

  return { ...normalized, contentHash: await contentHash(normalized) };
}

export class OrderWinIngestionService {
  constructor(
    private readonly source: AnnouncementSource,
    private readonly repository: OrderWinRepository,
    private readonly options: IngestionOptions,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = () => crypto.randomUUID(),
  ) {}

  private async renewLease(ownerId: string) {
    const renewed = await this.repository.renewIngestionLock(ownerId, this.options.lockDurationMs);
    if (!renewed) throw new IngestionLeaseLostError();
  }

  async ingest(input: {
    readonly from: Date;
    readonly to: Date;
    readonly trigger: "manual" | "scheduled";
  }): Promise<IngestionRun> {
    const ownerId = this.id();
    const startedAt = this.now();
    const lockAcquired = await this.repository.acquireIngestionLock(
      ownerId,
      this.options.lockDurationMs,
    );
    if (!lockAcquired) throw new IngestionConflictError();

    let run: IngestionRun | null = null;
    try {
      await this.repository.abandonRunningRuns(startedAt);
      run = await this.repository.createRun({
        trigger: input.trigger,
        window: { from: input.from, to: input.to },
        startedAt,
      });
      let hasNext = true;
      let page = 1;
      while (hasNext && page <= this.options.maxPages) {
        const result = await this.source.fetchOrderWins({
          from: input.from,
          to: input.to,
          page,
          limit: this.options.pageSize,
        });
        await this.renewLease(ownerId);
        run = { ...run, pagesFetched: run.pagesFetched + 1 };

        for (const announcement of result.data) {
          run = { ...run, recordsFetched: run.recordsFetched + 1 };
          const candidate = await normalizeAnnouncement(announcement);
          if (!candidate) {
            run = { ...run, recordsRejected: run.recordsRejected + 1 };
            continue;
          }
          const seenAt = this.now();
          const outcome = await this.repository.upsertWithLease(candidate, seenAt, {
            ownerId,
            durationMs: this.options.lockDurationMs,
          });
          if (outcome === "inserted") run = { ...run, recordsInserted: run.recordsInserted + 1 };
          if (outcome === "updated") run = { ...run, recordsUpdated: run.recordsUpdated + 1 };
          if (outcome === "unchanged") {
            run = { ...run, recordsUnchanged: run.recordsUnchanged + 1 };
          }
        }

        hasNext = result.hasNext;
        page += 1;
      }

      if (hasNext) throw new Error(`Ingestion exceeded the ${this.options.maxPages} page limit`);
      run = { ...run, status: "succeeded", completedAt: this.now() };
      return await this.repository.completeRun(run);
    } catch (error) {
      if (run) {
        run = {
          ...run,
          status:
            run.recordsInserted + run.recordsUpdated + run.recordsUnchanged > 0
              ? "partially_succeeded"
              : "failed",
          completedAt: this.now(),
          error: {
            code: "INGESTION_FAILED",
            message: "Order-win ingestion failed",
          },
        };
        await this.repository.completeRun(run);
      }
      throw error;
    } finally {
      await this.repository.releaseIngestionLock(ownerId);
    }
  }
}
