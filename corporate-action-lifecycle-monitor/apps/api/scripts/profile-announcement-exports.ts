import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { classifyAnnouncement, type SourceAnnouncement } from "../src/domain";

const input = process.argv[2];
if (!input)
	throw new Error("Usage: bun run profile:announcements -- <export-directory>");
const inputDirectory = resolve(input);
const files = readdirSync(inputDirectory)
	.filter((name) => name.startsWith("announcement-") && name.endsWith(".json"))
	.sort();
const announcements = new Map<
	string,
	{ appearances: number; types: Set<string> }
>();
let appearances = 0;
let missingSymbols = 0;

for (const file of files) {
	const payload = JSON.parse(
		readFileSync(resolve(inputDirectory, file), "utf8"),
	) as unknown;
	const rows = Array.isArray(payload) ? payload : asRecord(payload).data;
	if (!Array.isArray(rows))
		throw new Error(`${file} does not contain an array`);
	for (const [index, value] of rows.entries()) {
		const row = asRecord(value);
		if (!stringValue(row.symbol)) missingSymbols += 1;
		let announcement: SourceAnnouncement;
		try {
			announcement = normalize(row);
		} catch (error) {
			throw new Error(
				`${file}[${index}]: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		appearances += 1;
		const aggregate = announcements.get(announcement.id) ?? {
			appearances: 0,
			types: new Set<string>(),
		};
		aggregate.appearances += 1;
		for (const type of classifyAnnouncement(announcement))
			aggregate.types.add(type);
		announcements.set(announcement.id, aggregate);
	}
}

const actionCounts: Record<string, number> = {};
let crossExportIds = 0;
let multiCoreActionIds = 0;
for (const aggregate of announcements.values()) {
	if (aggregate.appearances > 1) crossExportIds += 1;
	if (aggregate.types.size > 1) multiCoreActionIds += 1;
	for (const type of aggregate.types)
		actionCounts[type] = (actionCounts[type] ?? 0) + 1;
}

console.log(
	JSON.stringify(
		{
			files: files.length,
			appearances,
			uniqueAnnouncementIds: announcements.size,
			missingSymbols,
			crossExportIds,
			multiCoreActionIds,
			actionCounts,
		},
		null,
		2,
	),
);

function normalize(row: Record<string, unknown>): SourceAnnouncement {
	const symbol = (stringValue(row.symbol) ?? "UNKNOWN").toUpperCase();
	return {
		id: requiredString(row.id, "id"),
		symbol,
		companyName: stringValue(row.company_name) ?? symbol,
		date: new Date(requiredString(row.date, "date")).toISOString(),
		headline:
			stringValue(row.summary) ??
			stringValue(row.category) ??
			"Corporate announcement",
		summary: stringValue(row.summary),
		longSummary: stringValue(row.long_summary),
		category: stringValue(row.category) ?? "Corporate Announcement",
		relatedCategories: Array.isArray(row.related_categories)
			? row.related_categories.filter(
					(value): value is string => typeof value === "string",
				)
			: [],
		exchange: stringValue(row.exchange) ?? "NSE/BSE",
		extractedInformation: row.extracted_information,
		rawData: row,
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, field: string): string {
	const result = stringValue(value);
	if (!result) throw new Error(`Announcement is missing ${field}`);
	return result;
}
