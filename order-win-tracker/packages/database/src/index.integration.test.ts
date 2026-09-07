import { expect, test } from "bun:test";
import type { OrderWinCandidate } from "@order-win/contracts";
import { IngestionLeaseLostError } from "@order-win/core";
import { connectMongoose, MongoOrderWinRepository } from "./index";

const testMongoUri = process.env.TEST_MONGODB_URI;

if (!testMongoUri) {
  test.skip("MongoOrderWinRepository integration requires TEST_MONGODB_URI", () => {});
} else {
  test("persists idempotent order wins and ingestion runs", async () => {
    const connection = await connectMongoose(testMongoUri);
    try {
      await connection.dropDatabase();
      const repository = new MongoOrderWinRepository(connection);
      const now = new Date("2026-09-07T10:00:00Z");

      expect(await repository.acquireIngestionLock("owner-1", 60_000)).toBe(true);
      expect(await repository.acquireIngestionLock("owner-2", 60_000)).toBe(false);
      const candidate: OrderWinCandidate = {
        source: "drishti",
        sourceAnnouncementId: "announcement-1",
        symbol: "TCS",
        companyName: "Tata Consultancy Services Limited",
        announcedAt: now,
        category: "Award/Receipt of Order",
        summary: "TCS received an order.",
        longSummary: null,
        relatedCategories: [],
        important: true,
        extractedInformation: null,
        sourceImageUrl: null,
        contentHash: "hash-1",
        schemaVersion: 1,
      };

      const lease = { ownerId: "owner-1", durationMs: 60_000 };
      expect(await repository.upsertWithLease(candidate, now, lease)).toBe("inserted");
      expect(await repository.upsertWithLease(candidate, now, lease)).toBe("unchanged");
      expect(
        await repository.upsertWithLease({ ...candidate, contentHash: "hash-2" }, now, lease),
      ).toBe("updated");
      expect(
        repository.upsertWithLease(candidate, now, { ...lease, ownerId: "owner-2" }),
      ).rejects.toBeInstanceOf(IngestionLeaseLostError);
      await connection
        .collection<{ _id: string }>("ingestion_locks")
        .updateOne({ _id: "order-wins" }, { $set: { expiresAt: new Date(0) } });
      expect(await repository.renewIngestionLock("owner-1", 60_000)).toBe(false);
      expect(repository.upsertWithLease(candidate, now, lease)).rejects.toBeInstanceOf(
        IngestionLeaseLostError,
      );
      expect(await repository.acquireIngestionLock("owner-2", 60_000)).toBe(true);
      expect(await repository.acquireIngestionLock("owner-1", 60_000)).toBe(false);
      await repository.releaseIngestionLock("owner-2");

      const page = await repository.list({ limit: 25 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.contentHash).toBe("hash-2");

      const createdRun = await repository.createRun({
        trigger: "manual",
        window: { from: now, to: now },
        startedAt: now,
      });
      const completedRun = await repository.completeRun({
        ...createdRun,
        status: "succeeded",
        completedAt: now,
      });
      expect((await repository.findRun(completedRun.id))?.status).toBe("succeeded");

      const abandonedRun = await repository.createRun({
        trigger: "manual",
        window: { from: now, to: now },
        startedAt: now,
      });
      await repository.abandonRunningRuns(now);
      const unchangedTerminalRun = await repository.completeRun({
        ...abandonedRun,
        status: "succeeded",
        completedAt: now,
      });
      expect(unchangedTerminalRun.status).toBe("failed");
      expect(unchangedTerminalRun.error?.code).toBe("INGESTION_ABANDONED");
    } finally {
      await connection.dropDatabase();
      await connection.close();
    }
  });
}
