import { describe, expect, test } from "bun:test";

import { buildLifecycles, type SourceAnnouncement } from "../src/domain";

function announcement(
	id: string,
	date: string,
	headline: string,
	extractedInformation?: unknown,
): SourceAnnouncement {
	return {
		id,
		symbol: "RIGHTSCO",
		companyName: "Rights Company Ltd.",
		date,
		headline,
		category: "Rights Issue",
		relatedCategories: [],
		exchange: "BSE",
		extractedInformation,
	};
}

describe("corporate-action lifecycle engine", () => {
	test("groups disconnected rights-issue filings and detects a changed close date", () => {
		const result = buildLifecycles([
			announcement("a1", "2026-01-02T10:00:00Z", "Board approved rights issue"),
			announcement("a2", "2026-01-10T10:00:00Z", "Terms of rights issue", {
				rights_issue: {
					rights_ratio: "1:4",
					issue_price: 120,
					closing_date: "2026-02-15",
				},
			}),
			announcement(
				"a3",
				"2026-01-15T10:00:00Z",
				"Record date for rights entitlement",
				{
					rights_issue: { record_date: "2026-01-30" },
				},
			),
			announcement("a4", "2026-02-08T03:30:00Z", "Opening of rights issue"),
			announcement("a5", "2026-02-12T10:00:00Z", "Closing date extended", {
				rights_issue: { closing_date: "2026-02-18" },
			}),
		]);

		expect(result).toHaveLength(1);
		expect(result[0].status).toBe("Issue Open");
		expect(result[0].announcements).toHaveLength(5);
		expect(
			result[0].terms.find((term) => term.key === "rights_ratio")?.value,
		).toBe("1:4");
		expect(
			result[0].changes.find((change) => change.field === "closing_date"),
		).toMatchObject({
			title: "Closing date changed",
			previousValue: "15 Feb 2026",
			newValue: "18 Feb 2026",
			announcementId: "a5",
		});
		expect(
			result[0].stages.find((stage) => stage.id === "record")?.evidence,
		).toMatchObject({
			announcementId: "a3",
			date: "2026-01-15T10:00:00Z",
			summary: "Record date for rights entitlement",
			criticalAspect: "Record Date",
		});
		expect(
			result[0].stages.find((stage) => stage.id === "completed")?.evidence,
		).toBeUndefined();
	});

	test("keeps incomplete terms without fabricating values", () => {
		const [result] = buildLifecycles([
			announcement(
				"a1",
				"2026-01-02T10:00:00Z",
				"Board approved rights issue",
				{
					rights_issue: { issue_price: null, rights_ratio: "1:5" },
				},
			),
		]);

		expect(result.terms.map((term) => term.key)).toEqual(["rights_ratio"]);
		expect(result.nextExpectedDate).toBeUndefined();
	});

	test("uses the concise filing summary as stage evidence", () => {
		const filing: SourceAnnouncement = {
			...announcement(
				"a1",
				"2026-01-02T10:00:00Z",
				"Board approved rights issue",
			),
			summary: "Rights issue approved by the board.",
			longSummary:
				"### Long filing body that must not appear in the stage tooltip.",
		};

		const [result] = buildLifecycles([filing]);

		expect(
			result.stages.find((stage) => stage.id === "board")?.evidence,
		).toMatchObject({ summary: "Rights issue approved by the board." });
	});

	test("marks an event as review-only when two lifecycles are plausible", () => {
		const result = buildLifecycles([
			announcement("a1", "2026-01-01T10:00:00Z", "Rights issue record date", {
				rights_issue: { record_date: "2026-01-15" },
			}),
			announcement("a2", "2026-03-01T10:00:00Z", "Rights issue record date", {
				rights_issue: { record_date: "2026-03-15" },
			}),
			announcement("a3", "2026-04-01T10:00:00Z", "Update to rights issue"),
		]);

		expect(result).toHaveLength(3);
		expect(
			result.find((item) => item.announcements[0].id === "a3"),
		).toMatchObject({
			state: "needs_review",
		});
	});

	test("fans one filing out into multiple core action lifecycles", () => {
		const filing: SourceAnnouncement = {
			...announcement(
				"multi-1",
				"2026-05-01T10:00:00Z",
				"Board approved bonus shares and a stock split",
			),
			category: "Outcome of Board Meeting",
			relatedCategories: ["Bonus Issue", "Stock Split"],
			extractedInformation: {
				bonus_issue: { bonus_ratio: "1:1", face_value_after: 5 },
				stock_split: {
					face_value_before: 10,
					face_value_after: 5,
					split_ratio: "1:2",
				},
			},
		};

		const result = buildLifecycles([filing]);

		expect(result.map((item) => item.actionType).sort()).toEqual([
			"Bonus Issue",
			"Stock Split",
		]);
		expect(
			result
				.find((item) => item.actionType === "Stock Split")
				?.terms.find((term) => term.key === "old_face_value"),
		).toMatchObject({ rawValue: 10, normalizedValue: 10 });
	});

	test("tracks every supported corporate-action category", () => {
		const categoryFixtures = [
			["Bonus Issue", "bonus_issue"],
			["Buyback", "buyback"],
			["Conversion of Warrants", "conversion_of_warrants"],
			["De-listing", "delisting"],
			["Demerger", "demerger"],
			["Dividend", "dividend"],
			["Issue of Securities", "issue_of_securities"],
			["Merger", "merger"],
			["Offer for Sale", "offer_for_sale"],
			["Redemption of Securities", "redemption_of_securities"],
			["Rights Issue", "rights_issue"],
			["Stock Split", "stock_split"],
		] as const;

		const filings = categoryFixtures.map(
			([category, extractionKey], index) => ({
				...announcement(
					`category-${index}`,
					"2026-05-01T10:00:00Z",
					`${category} announced`,
				),
				category,
				extractedInformation: {
					[extractionKey]: { record_date: "2026-05-10" },
				},
			}),
		);

		expect(
			buildLifecycles(filings)
				.map((item) => item.actionType)
				.sort(),
		).toEqual(categoryFixtures.map(([category]) => category).sort());
	});

	test("does not auto-promote a text-only generic filing", () => {
		const generic: SourceAnnouncement = {
			...announcement(
				"generic-1",
				"2026-05-02T10:00:00Z",
				"The company may consider a rights issue",
			),
			category: "Corp Action",
			relatedCategories: [],
			summary: "The company may consider a rights issue.",
			extractedInformation: null,
		};

		expect(buildLifecycles([generic])).toEqual([]);
	});

	test("ignores failed extraction values and reuses an existing lifecycle id", () => {
		const filing = announcement(
			"failed-1",
			"2026-05-01T10:00:00Z",
			"Rights issue announced",
			{ rights_issue: { status: "failed", price: 120 } },
		);
		const [initial] = buildLifecycles([filing], {
			createId: () => "persistent-id",
		});
		const [rebuilt] = buildLifecycles([filing], { existing: [initial] });

		expect(initial.id).toBe("persistent-id");
		expect(initial.terms).toEqual([]);
		expect(rebuilt.id).toBe("persistent-id");
	});
});
