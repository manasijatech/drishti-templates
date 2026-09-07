import { describe, expect, test } from "bun:test";
import type {
  DrishtiAnnouncement,
  IngestionRun,
  ListOrderWinsQuery,
  OrderWin,
  OrderWinCandidate,
} from "@order-win/contracts";
import {
  type AnnouncementPageRequest,
  type AnnouncementSource,
  IngestionConflictError,
  IngestionLeaseLostError,
  normalizeAnnouncement,
  OrderWinIngestionService,
  type OrderWinRepository,
  type UpsertOutcome,
} from "./index";

const announcement: DrishtiAnnouncement = {
  id: "announcement-1",
  symbol: "reliance",
  company_name: "Reliance Industries Limited",
  date: "2026-09-07T08:00:00Z",
  summary: "The company received an order.",
  category: "Award/Receipt of Order",
  important: true,
};

class FakeSource implements AnnouncementSource {
  readonly requests: AnnouncementPageRequest[] = [];

  async fetchOrderWins(request: AnnouncementPageRequest) {
    this.requests.push(request);
    return { data: [announcement], hasNext: request.page === 1 };
  }
}

class FakeRepository implements OrderWinRepository {
  lockAvailable = true;
  leaseRenewable = true;
  released = false;
  renewals = 0;
  readonly candidates: OrderWinCandidate[] = [];
  trackedSymbols: readonly string[] = [];

  async acquireIngestionLock() {
    return this.lockAvailable;
  }

  async releaseIngestionLock() {
    this.released = true;
  }

  async renewIngestionLock() {
    this.renewals += 1;
    return this.leaseRenewable;
  }

  async abandonRunningRuns() {}

  async createRun(input: {
    readonly trigger: "manual" | "scheduled";
    readonly window: { readonly from: Date; readonly to: Date };
    readonly startedAt: Date;
  }): Promise<IngestionRun> {
    return {
      id: "run-1",
      status: "running",
      trigger: input.trigger,
      window: input.window,
      pagesFetched: 0,
      recordsFetched: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      recordsRejected: 0,
      startedAt: input.startedAt,
      completedAt: null,
      error: null,
    };
  }

  async completeRun(run: IngestionRun) {
    return run;
  }

  async upsertWithLease(candidate: OrderWinCandidate): Promise<UpsertOutcome> {
    this.candidates.push(candidate);
    return this.candidates.length === 1 ? "inserted" : "unchanged";
  }

  async list(_query: ListOrderWinsQuery): Promise<{
    readonly items: readonly OrderWin[];
    readonly nextCursor: string | null;
  }> {
    return { items: [], nextCursor: null };
  }

  async findRun(): Promise<IngestionRun | null> {
    return null;
  }

  async getTrackedSymbols() {
    return this.trackedSymbols;
  }

  async setTrackedSymbols(symbols: readonly string[]) {
    this.trackedSymbols = symbols;
    return symbols;
  }
}

describe("OrderWinIngestionService", () => {
  test("normalizes offset-less Drishti timestamps as India Standard Time", async () => {
    const candidate = await normalizeAnnouncement({
      ...announcement,
      date: "2026-05-11T10:12:44.875000",
    });

    expect(candidate?.announcedAt?.toISOString()).toBe("2026-05-11T04:42:44.875Z");
  });

  test("paginates, normalizes, and records idempotent outcomes", async () => {
    const source = new FakeSource();
    const repository = new FakeRepository();
    const now = new Date("2026-09-07T10:00:00Z");
    const service = new OrderWinIngestionService(
      source,
      repository,
      { pageSize: 50, maxPages: 10, lockDurationMs: 60_000 },
      () => now,
      () => "lock-1",
    );

    const run = await service.ingest({
      from: new Date("2026-09-06T10:00:00Z"),
      to: now,
      trigger: "manual",
    });

    expect(source.requests).toHaveLength(2);
    expect(repository.candidates[0]?.symbol).toBe("RELIANCE");
    expect(run.status).toBe("succeeded");
    expect(run.recordsInserted).toBe(1);
    expect(run.recordsUnchanged).toBe(1);
    expect(repository.released).toBe(true);
    expect(repository.renewals).toBe(2);
  });

  test("passes configured symbols to every source page", async () => {
    const source = new FakeSource();
    const repository = new FakeRepository();
    repository.trackedSymbols = ["TCS", "RELIANCE"];
    const service = new OrderWinIngestionService(source, repository, {
      pageSize: 50,
      maxPages: 10,
      lockDurationMs: 60_000,
    });

    await service.ingest({
      from: new Date("2026-09-06T10:00:00Z"),
      to: new Date("2026-09-07T10:00:00Z"),
      trigger: "manual",
    });

    expect(source.requests.every((request) => request.symbols === repository.trackedSymbols)).toBe(
      true,
    );
  });

  test("rejects source rows outside the configured symbol allowlist", async () => {
    const repository = new FakeRepository();
    repository.trackedSymbols = ["TCS"];
    const service = new OrderWinIngestionService(new FakeSource(), repository, {
      pageSize: 50,
      maxPages: 10,
      lockDurationMs: 60_000,
    });

    const run = await service.ingest({
      from: new Date("2026-09-06T10:00:00Z"),
      to: new Date("2026-09-07T10:00:00Z"),
      trigger: "manual",
    });

    expect(run.recordsRejected).toBe(2);
    expect(repository.candidates).toHaveLength(0);
  });

  test("rejects rows outside the exact order-win category", async () => {
    const source: AnnouncementSource = {
      async fetchOrderWins() {
        return { data: [{ ...announcement, category: "Company Update" }], hasNext: false };
      },
    };
    const repository = new FakeRepository();
    const service = new OrderWinIngestionService(source, repository, {
      pageSize: 50,
      maxPages: 10,
      lockDurationMs: 60_000,
    });

    const run = await service.ingest({
      from: new Date("2026-09-06T10:00:00Z"),
      to: new Date("2026-09-07T10:00:00Z"),
      trigger: "manual",
    });

    expect(run.recordsRejected).toBe(1);
    expect(repository.candidates).toHaveLength(0);
  });

  test("prevents overlapping ingestions", async () => {
    const repository = new FakeRepository();
    repository.lockAvailable = false;
    const service = new OrderWinIngestionService(new FakeSource(), repository, {
      pageSize: 50,
      maxPages: 10,
      lockDurationMs: 60_000,
    });

    expect(
      service.ingest({
        from: new Date("2026-09-06T10:00:00Z"),
        to: new Date("2026-09-07T10:00:00Z"),
        trigger: "manual",
      }),
    ).rejects.toBeInstanceOf(IngestionConflictError);
  });

  test("stops before writing when the ingestion lease is lost", async () => {
    const repository = new FakeRepository();
    repository.leaseRenewable = false;
    const service = new OrderWinIngestionService(new FakeSource(), repository, {
      pageSize: 50,
      maxPages: 10,
      lockDurationMs: 60_000,
    });

    expect(
      service.ingest({
        from: new Date("2026-09-06T10:00:00Z"),
        to: new Date("2026-09-07T10:00:00Z"),
        trigger: "manual",
      }),
    ).rejects.toBeInstanceOf(IngestionLeaseLostError);
    expect(repository.candidates).toHaveLength(0);
    expect(repository.released).toBe(true);
  });

  test("releases the lease when creating the run fails", async () => {
    const repository = new FakeRepository();
    repository.createRun = async () => {
      throw new Error("database unavailable");
    };
    const service = new OrderWinIngestionService(new FakeSource(), repository, {
      pageSize: 50,
      maxPages: 10,
      lockDurationMs: 60_000,
    });

    expect(
      service.ingest({
        from: new Date("2026-09-06T10:00:00Z"),
        to: new Date("2026-09-07T10:00:00Z"),
        trigger: "manual",
      }),
    ).rejects.toThrow("database unavailable");
    expect(repository.released).toBe(true);
  });
});
