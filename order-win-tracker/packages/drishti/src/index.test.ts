import { describe, expect, test } from "bun:test";
import { type AnnouncementsRequest, DrishtiAnnouncementSource, DrishtiSourceError } from "./index";

describe("DrishtiAnnouncementSource", () => {
  test("requests only detailed order-win announcements for the supplied window", async () => {
    let request: AnnouncementsRequest | undefined;
    const source = new DrishtiAnnouncementSource({
      async getAnnouncements(params) {
        request = params;
        return {
          data: [
            {
              id: "announcement-1",
              symbol: "TCS",
              category: "Award/Receipt of Order",
            },
          ],
          has_next: false,
        };
      },
    });

    const page = await source.fetchOrderWins({
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-07T23:59:59Z"),
      page: 2,
      limit: 50,
      symbols: ["TCS"],
    });

    expect(request).toEqual({
      categories: ["Award/Receipt of Order"],
      detailed: true,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-07T23:59:59.000Z",
      page: 2,
      limit: 50,
      symbols: ["TCS"],
    });
    expect(page.data[0]?.symbol).toBe("TCS");
    expect(page.hasNext).toBe(false);
  });

  test("rejects an invalid upstream response", async () => {
    const source = new DrishtiAnnouncementSource({
      async getAnnouncements() {
        return { data: [{ symbol: "TCS" }], has_next: false };
      },
    });

    expect(
      source.fetchOrderWins({
        from: new Date("2026-09-01T00:00:00Z"),
        to: new Date("2026-09-07T23:59:59Z"),
        page: 1,
        limit: 50,
      }),
    ).rejects.toBeInstanceOf(DrishtiSourceError);
  });

  test("rejects malformed announcement dates", async () => {
    const source = new DrishtiAnnouncementSource({
      async getAnnouncements() {
        return {
          data: [{ id: "announcement-1", symbol: "TCS", date: "not-a-date" }],
          has_next: false,
        };
      },
    });

    expect(
      source.fetchOrderWins({
        from: new Date("2026-09-01T00:00:00Z"),
        to: new Date("2026-09-07T23:59:59Z"),
        page: 1,
        limit: 50,
      }),
    ).rejects.toBeInstanceOf(DrishtiSourceError);
  });
});
