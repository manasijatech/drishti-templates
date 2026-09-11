import { DrishtiClient, type DrishtiWebSocketSession } from "drishti-sdk";

import type { SourceAnnouncement } from "./domain";

export type SymbolIdentity = {
	symbol: string;
	companyName: string;
	companyLogo?: string;
};

export type AnnouncementWindow = { from?: string; to?: string };
export type StreamHandle = {
	close(): Promise<void>;
	connected(): boolean;
	replaceSymbols(symbols: string[]): Promise<void>;
};
export type StreamCallbacks = {
	onConnected(reconnected: boolean): void;
	onDisconnected(reason: string): void;
	onError(error: Error): void;
};

export interface MarketDataSource {
	resolveSymbol(symbol: string): Promise<SymbolIdentity | undefined>;
	listAnnouncements(
		symbol: string,
		window?: AnnouncementWindow,
	): Promise<SourceAnnouncement[]>;
	openStream(
		symbols: string[],
		onAnnouncement: (announcement: SourceAnnouncement) => void,
		callbacks: StreamCallbacks,
	): Promise<StreamHandle>;
	getSourceDocument(id: string): Promise<Response>;
}

export class DrishtiMarketDataSource implements MarketDataSource {
	private readonly client: DrishtiClient;
	private readonly apiKey: string;

	constructor(options: { apiKey: string; fetchImpl?: typeof fetch }) {
		this.apiKey = options.apiKey;
		this.client = new DrishtiClient({
			apiKey: options.apiKey,
			fetchImpl: options.fetchImpl,
			retry: { maxRetries: 3 },
		});
	}

	async resolveSymbol(symbol: string): Promise<SymbolIdentity | undefined> {
		const response = await this.client.getSymbolsMetadata({
			symbols: [symbol],
		});
		const row = response.data.find(
			(item) => item.symbol.toUpperCase() === symbol.toUpperCase(),
		);
		return row
			? {
					symbol: row.symbol.toUpperCase(),
					companyName: row.company_name ?? row.symbol,
					companyLogo: row.logo ?? undefined,
				}
			: undefined;
	}

	async listAnnouncements(
		symbol: string,
		window: AnnouncementWindow = {},
	): Promise<SourceAnnouncement[]> {
		const result: SourceAnnouncement[] = [];
		for (let page = 1; ; page += 1) {
			const response = await this.client.getAnnouncements({
				symbols: [symbol],
				from: window.from,
				to: window.to,
				detailed: true,
				page,
				limit: 50,
			});
			const announcements = response.data.map((row) =>
				normalizeAnnouncement(row, symbol),
			);
			result.push(...announcements);
			if (!response.has_next || announcements.length === 0) {
				break;
			}
		}
		return result;
	}

	async openStream(
		symbols: string[],
		onAnnouncement: (announcement: SourceAnnouncement) => void,
		callbacks: StreamCallbacks,
	): Promise<StreamHandle> {
		let opened = false;
		const session: DrishtiWebSocketSession = this.client.websocket({
			onOpen: () => {
				callbacks.onConnected(opened);
				opened = true;
			},
			onClose: (reason) => callbacks.onDisconnected(reason),
			onError: (event) => {
				if (event.kind === "error") callbacks.onError(new Error(event.message));
			},
			onAnnouncements: (row) => {
				try {
					onAnnouncement(normalizeAnnouncement(row));
				} catch (error) {
					callbacks.onError(
						error instanceof Error ? error : new Error(String(error)),
					);
				}
			},
			reconnectInitialDelayMs: 1_000,
			reconnectMaxDelayMs: 30_000,
		});
		await session.subscribe({
			product: "announcements",
			symbols,
			detailed: true,
		});
		return {
			close: () => session.close(),
			connected: () => session.connected,
			replaceSymbols: async (nextSymbols) => {
				await session.subscribe({
					product: "announcements",
					symbols: nextSymbols,
					detailed: true,
				});
			},
		};
	}

	async getSourceDocument(id: string): Promise<Response> {
		const response = await fetch(
			`https://developers.manasija.in/v1/announcements/citations/${encodeURIComponent(id)}/pdf`,
			{ headers: { "X-API-Key": this.apiKey } },
		);
		if (
			!response.ok ||
			!response.headers.get("Content-Type")?.includes("text/html")
		)
			return response;

		const html = await response.text();
		const redirectPath = html.match(
			/window\.location\.replace\(["']([^"']+)["']\)/,
		)?.[1];
		if (!redirectPath)
			return new Response(null, {
				status: 502,
				statusText: "Invalid citation",
			});

		const target = new URL(redirectPath, "https://developers.manasija.in");
		if (
			target.origin !== "https://developers.manasija.in" ||
			target.pathname !== "/v1/citations/file"
		) {
			return new Response(null, {
				status: 502,
				statusText: "Invalid citation",
			});
		}
		return fetch(target);
	}
}

function normalizeAnnouncement(
	value: unknown,
	fallbackSymbol?: string,
): SourceAnnouncement {
	const row = asRecord(value);
	const id = requiredString(row.id, "announcement id");
	const symbol = (
		stringValue(row.symbol) ??
		stringValue(fallbackSymbol) ??
		requiredString(row.symbol, "announcement symbol")
	).toUpperCase();
	return {
		id,
		symbol,
		companyName: stringValue(row.company_name) ?? symbol,
		image: stringValue(row.image),
		date: normalizeDate(row.date),
		headline:
			stringValue(row.headline) ??
			stringValue(row.title) ??
			stringValue(row.summary) ??
			stringValue(row.category) ??
			"Corporate announcement",
		summary: stringValue(row.summary),
		longSummary: stringValue(row.long_summary),
		category: stringValue(row.category) ?? "Corporate Announcement",
		relatedCategories: stringArray(row.related_categories),
		descriptor: stringValue(row.descriptor),
		exchange: stringValue(row.exchange) ?? "NSE/BSE",
		important: typeof row.important === "boolean" ? row.important : undefined,
		extractedInformation: row.extracted_information,
		rawData: value,
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

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function requiredString(value: unknown, label: string): string {
	const normalized = stringValue(value);
	if (!normalized) throw new Error(`Drishti returned an invalid ${label}`);
	return normalized;
}

function normalizeDate(value: unknown): string {
	const date = new Date(stringValue(value) ?? "");
	if (Number.isNaN(date.getTime()))
		throw new Error("Drishti returned an invalid announcement date");
	return date.toISOString();
}
