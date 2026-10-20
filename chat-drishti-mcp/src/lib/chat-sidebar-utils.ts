import type { Icon } from "@phosphor-icons/react";
import {
	Bank,
	CalendarBlank,
	ChartLineUp,
	ChartPieSlice,
	ChatCircle,
	CurrencyInr,
	Eye,
	Newspaper,
	RocketLaunch,
	Scales,
	Sparkle,
	TrendUp,
	Warning,
} from "@phosphor-icons/react";
import type { ChatSession } from "~/types";

export type SidebarIconKey =
	| "portfolio"
	| "movers"
	| "bank"
	| "news"
	| "earnings"
	| "sector"
	| "compare"
	| "dividend"
	| "chart"
	| "swing"
	| "risk"
	| "chat"
	| "screener"
	| "calendar"
	| "briefcase"
	| "watchlist";

export const SIDEBAR_ICONS: Record<SidebarIconKey, Icon> = {
	portfolio: ChartPieSlice,
	movers: RocketLaunch,
	bank: Bank,
	news: Newspaper,
	earnings: CalendarBlank,
	sector: ChartLineUp,
	compare: Scales,
	dividend: CurrencyInr,
	chart: TrendUp,
	swing: Sparkle,
	risk: Warning,
	chat: ChatCircle,
	screener: ChartLineUp,
	calendar: CalendarBlank,
	briefcase: ChartPieSlice,
	watchlist: Eye,
};

const ICON_RULES: [RegExp, SidebarIconKey][] = [
	[/portfolio|holding|allocation/i, "portfolio"],
	[/mover|momentum|gainer|loser|top mover/i, "movers"],
	[/bank|hdfc|icici|axis|kotak|sbi/i, "bank"],
	[/news|announcement|headline|feed/i, "news"],
	[/earnings|result|quarter|calendar/i, "earnings"],
	[/sector|industry|outlook|macro/i, "sector"],
	[/compare|versus|\svs\s/i, "compare"],
	[/dividend|yield/i, "dividend"],
	[/nifty|sensex|market summary|market update/i, "chart"],
	[/reliance|tcs|infosys|stock|equit/i, "chart"],
	[/swing|trade|intraday/i, "swing"],
	[/risk|volatil/i, "risk"],
];

export function getSessionIconKey(title: string): SidebarIconKey {
	for (const [pattern, key] of ICON_RULES) {
		if (pattern.test(title)) return key;
	}
	return "chat";
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
	return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function formatSessionTime(updatedAt: string): string {
	const date = new Date(updatedAt);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60_000);

	if (diffMin < 1) return "Just now";
	if (diffMin < 60) return `${diffMin} min ago`;

	const diffHr = Math.floor(diffMin / 60);
	if (isSameDay(date, now)) {
		return diffHr === 1 ? "1 hr ago" : `${diffHr} hr ago`;
	}

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (isSameDay(date, yesterday)) return "Yesterday";

	const month = date.toLocaleDateString("en-US", { month: "short" });
	const day = date.getDate();
	if (date.getFullYear() === now.getFullYear()) return `${month} ${day}`;
	return `${month} ${day}, ${date.getFullYear()}`;
}

export type SessionGroup = {
	label: string;
	sessions: ChatSession[];
};

export function groupSessionsByDate(sessions: ChatSession[]): SessionGroup[] {
	const unpinned = sessions
		.filter((s) => !s.pinned)
		.sort(
			(a, b) =>
				new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
		);

	const now = new Date();
	const today = startOfDay(now);
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const weekAgo = new Date(today);
	weekAgo.setDate(weekAgo.getDate() - 7);

	const buckets = new Map<string, ChatSession[]>();

	for (const session of unpinned) {
		const updated = startOfDay(new Date(session.updatedAt));
		let label: string;

		if (updated.getTime() >= today.getTime()) {
			label = "Today";
		} else if (updated.getTime() >= yesterday.getTime()) {
			label = "Yesterday";
		} else if (updated.getTime() >= weekAgo.getTime()) {
			label = "Previous 7 days";
		} else {
			label = updated.toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
			});
		}

		const list = buckets.get(label) ?? [];
		list.push(session);
		buckets.set(label, list);
	}

	const order = ["Today", "Yesterday", "Previous 7 days"];
	const groups: SessionGroup[] = [];

	for (const label of order) {
		const list = buckets.get(label);
		if (list?.length) groups.push({ label, sessions: list });
		buckets.delete(label);
	}

	for (const [label, list] of buckets) {
		groups.push({ label, sessions: list });
	}

	return groups;
}

export function filterSessions(
	sessions: ChatSession[],
	query: string,
): ChatSession[] {
	const q = query.trim().toLowerCase();
	if (!q) return sessions;
	return sessions.filter((s) => s.title.toLowerCase().includes(q));
}

/** Demo prompts. Each one maps to real Drishti MCP operations. */
export const DEMO_PROMPTS: {
	icon: SidebarIconKey;
	label: string;
	prompt: string;
}[] = [
	{
		icon: "chart",
		label: "Market today",
		prompt:
			"How did the Indian market do today? Give a short summary with the top gainers and losers.",
	},
	{
		icon: "news",
		label: "Reliance news & filings",
		prompt:
			"What is the latest news and exchange filings for Reliance Industries?",
	},
	{
		icon: "calendar",
		label: "Results this week",
		prompt: "Which companies are announcing their quarterly results this week?",
	},
	{
		icon: "earnings",
		label: "Infosys earnings call",
		prompt: "What did Infosys management say in their latest earnings call?",
	},
	{
		icon: "bank",
		label: "Banking sector",
		prompt:
			"How is the banking sector doing? Show the top banking stocks by market cap.",
	},
	{
		icon: "movers",
		label: "52-week highs",
		prompt: "Which stocks are trading near their 52-week high?",
	},
	{
		icon: "portfolio",
		label: "My portfolio",
		prompt:
			"Give me an update on my portfolio: prices, news, and upcoming results.",
	},
];
