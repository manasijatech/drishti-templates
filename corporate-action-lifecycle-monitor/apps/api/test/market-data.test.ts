import { describe, expect, test } from "bun:test";

import { DrishtiMarketDataSource } from "../src/market-data";

type AnnouncementPage = {
	data: Array<{
		id: string;
		symbol: string;
		date: string;
		category: string;
		related_categories?: string[];
	}>;
	has_next: boolean;
};

function marketWithPages(pages: AnnouncementPage[], requestedPages: number[]) {
	const fetchImpl = Object.assign(
		async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			const page = Number(url.searchParams.get("page"));
			requestedPages.push(page);
			return Response.json(pages[page - 1]);
		},
		{ preconnect: (_url: string | URL) => undefined },
	);

	return new DrishtiMarketDataSource({
		apiKey: "test-key",
		fetchImpl,
	});
}

describe("Drishti announcement backfill", () => {
	test("exhausts every page for a full-retention backfill", async () => {
		const requestedPages: number[] = [];
		const market = marketWithPages(
			[
				{
					data: [
						{
							id: "recent-general",
							symbol: "TCS",
							date: "2026-09-09T10:00:00Z",
							category: "General Update",
						},
					],
					has_next: true,
				},
				{
					data: [
						{
							id: "last-corporate-action",
							symbol: "TCS",
							date: "2026-07-09T10:00:00Z",
							category: "Outcome of Board Meeting",
							related_categories: ["Dividend"],
						},
					],
					has_next: true,
				},
				{
					data: [
						{
							id: "older-general",
							symbol: "TCS",
							date: "2026-05-01T10:00:00Z",
							category: "General Update",
						},
					],
					has_next: false,
				},
			],
			requestedPages,
		);

		const announcements = await market.listAnnouncements("TCS");

		expect(requestedPages).toEqual([1, 2, 3]);
		expect(announcements.map((item) => item.id)).toEqual([
			"recent-general",
			"last-corporate-action",
			"older-general",
		]);
	});

	test("passes bounded recovery timestamps to every paginated request", async () => {
		const requestedUrls: URL[] = [];
		const fetchImpl = Object.assign(
			async (input: RequestInfo | URL) => {
				requestedUrls.push(new URL(String(input)));
				return Response.json({ data: [], has_next: false });
			},
			{ preconnect: (_url: string | URL) => undefined },
		);
		const market = new DrishtiMarketDataSource({
			apiKey: "test-key",
			fetchImpl,
		});

		await market.listAnnouncements("TCS", {
			from: "2026-09-10T09:50:00.000Z",
			to: "2026-09-10T10:00:00.000Z",
		});

		expect(requestedUrls).toHaveLength(1);
		expect(requestedUrls[0].searchParams.get("from")).toBe(
			"2026-09-10T09:50:00.000Z",
		);
		expect(requestedUrls[0].searchParams.get("to")).toBe(
			"2026-09-10T10:00:00.000Z",
		);
		expect(requestedUrls[0].searchParams.get("detailed")).toBe("true");
	});

	test("continues to the final page when no corporate action exists", async () => {
		const requestedPages: number[] = [];
		const market = marketWithPages(
			[
				{
					data: [
						{
							id: "general-1",
							symbol: "TCS",
							date: "2026-09-09T10:00:00Z",
							category: "General Update",
						},
					],
					has_next: true,
				},
				{
					data: [
						{
							id: "general-2",
							symbol: "TCS",
							date: "2026-08-01T10:00:00Z",
							category: "General Update",
						},
					],
					has_next: false,
				},
			],
			requestedPages,
		);

		const announcements = await market.listAnnouncements("TCS");

		expect(requestedPages).toEqual([1, 2]);
		expect(announcements).toHaveLength(2);
	});

	test("uses the requested symbol when a filtered historical row is blank", async () => {
		const requestedPages: number[] = [];
		const market = marketWithPages(
			[
				{
					data: [
						{
							id: "blank-symbol",
							symbol: "",
							date: "2026-05-01T10:00:00Z",
							category: "Issue of Securities",
						},
					],
					has_next: false,
				},
			],
			requestedPages,
		);

		const [announcement] = await market.listAnnouncements("TCS");

		expect(announcement.symbol).toBe("TCS");
	});
});
