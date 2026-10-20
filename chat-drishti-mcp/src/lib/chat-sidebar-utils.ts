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

export const DEMO_PROMPT_GROUPS = [
	"Market pulse",
	"Results & filings",
	"Risk & F&O",
	"For clients",
] as const;

export type DemoPromptGroup = (typeof DEMO_PROMPT_GROUPS)[number];

/**
 * Demo prompts. Each one maps to real Drishti MCP operations.
 * The first six also show as chips on the empty chat screen.
 */
export const DEMO_PROMPTS: {
	group: DemoPromptGroup;
	icon: SidebarIconKey;
	label: string;
	prompt: string;
}[] = [
	{
		group: "Market pulse",
		icon: "movers",
		label: "Movers, explained",
		prompt:
			"Show today's top gainers and losers among large and mid caps, with one line on why each one moved.",
	},
	{
		group: "Results & filings",
		icon: "earnings",
		label: "Blockbuster & weak results",
		prompt:
			"Which companies reported the strongest and weakest quarterly results in the last 2 days? Show revenue and profit growth in a table.",
	},
	{
		group: "Risk & F&O",
		icon: "risk",
		label: "Risk check: my portfolio",
		prompt:
			"Run a risk check on my portfolio: upcoming results, negative news and red-flag filings. Rank by how urgent each one is.",
	},
	{
		group: "Market pulse",
		icon: "news",
		label: "News to affected stocks",
		prompt:
			"Which listed Indian companies could be affected by the latest Starlink and satellite internet news? Show the sentiment.",
	},
	{
		group: "For clients",
		icon: "chat",
		label: "Push notifications",
		prompt:
			"Draft 3 to 5 push notifications for clients about today's most important market developments.",
	},
	{
		group: "Results & filings",
		icon: "briefcase",
		label: "Order wins",
		prompt:
			"Show the biggest order wins announced in the last 3 days, with order size, client and execution timeline.",
	},
	{
		group: "Market pulse",
		icon: "chart",
		label: "Morning note",
		prompt:
			"Give me today's morning note: global cues, GIFT Nifty, and the key company news to watch.",
	},
	{
		group: "Market pulse",
		icon: "bank",
		label: "Volume spikes",
		prompt:
			"Which stocks have unusually high trading volume today? Is there news or a filing behind it?",
	},
	{
		group: "Results & filings",
		icon: "sector",
		label: "Infosys earnings call",
		prompt:
			"What did Infosys management say in their latest earnings call? Include guidance and key numbers.",
	},
	{
		group: "Results & filings",
		icon: "compare",
		label: "HDFC Bank vs ICICI Bank",
		prompt:
			"Compare the latest quarterly results of HDFC Bank and ICICI Bank in a table: revenue, profit and growth.",
	},
	{
		group: "Risk & F&O",
		icon: "calendar",
		label: "Bank Nifty event risk",
		prompt:
			"Which Bank Nifty stocks have results or board meetings in the next two weeks?",
	},
	{
		group: "Risk & F&O",
		icon: "swing",
		label: "Negative news: Bank Nifty",
		prompt:
			"Any negative news on Bank Nifty stocks in the last 7 days? Summarise the risk for each bank.",
	},
	{
		group: "Risk & F&O",
		icon: "screener",
		label: "Red flags in Nifty 50",
		prompt:
			"Any red flags in Nifty 50 companies in the last 30 days, like penalties, litigation, credit rating changes or regulator inspections?",
	},
	{
		group: "For clients",
		icon: "portfolio",
		label: "Weekly portfolio summary",
		prompt:
			"Give me a weekly summary of my portfolio and watchlists: what changed in filings, news, results and prices this week.",
	},
	{
		group: "For clients",
		icon: "chat",
		label: "WhatsApp market note",
		prompt:
			"Write a short WhatsApp note for my clients on today's market and the top company news.",
	},
	{
		group: "For clients",
		icon: "chat",
		label: "Market update in Gujarati",
		prompt: "Give me today's market update in Gujarati.",
	},
];
