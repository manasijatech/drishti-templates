import type {
	ActionType,
	CorporateActionLifecycle,
	LifecycleChange,
	LifecycleStage,
	LifecycleTerm,
} from "@lifecycle/contracts";
import { CORE_ACTION_TYPES } from "@lifecycle/contracts";

export type SourceAnnouncement = {
	id: string;
	symbol: string;
	companyName: string;
	companyLogo?: string;
	date: string;
	headline: string;
	summary?: string;
	longSummary?: string;
	category: string;
	relatedCategories: string[];
	descriptor?: string;
	exchange: string;
	important?: boolean;
	image?: string;
	extractedInformation?: unknown;
	rawData?: unknown;
};

type StageDefinition = {
	id: string;
	label: string;
	patterns: RegExp[];
	termKeys?: string[];
};

type ActionDefinition = {
	type: ActionType;
	extractionKeys: string[];
	aliases: RegExp[];
	maxGapDays: number;
	stages: StageDefinition[];
};

const INDIA_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Asia/Kolkata",
});

const commonCompleted = {
	id: "completed",
	label: "Completed",
	patterns: [/\bcompleted?\b/i, /\bconcluded\b/i],
};

export const ACTION_DEFINITIONS: ActionDefinition[] = [
	{
		type: "Rights Issue",
		extractionKeys: ["rights_issue", "rights"],
		aliases: [/rights? issue/i, /rights? entitlement/i],
		maxGapDays: 365,
		stages: [
			{ id: "proposal", label: "Proposal", patterns: [/\bpropos(?:al|ed)\b/i] },
			{
				id: "board",
				label: "Board Approval",
				patterns: [/board.{0,32}approv/i, /outcome of board meeting/i],
			},
			{
				id: "regulatory",
				label: "Regulatory Approval",
				patterns: [
					/in.principle.{0,30}approv/i,
					/exchange.{0,30}approv/i,
					/sebi.{0,30}approv/i,
				],
			},
			{
				id: "terms",
				label: "Terms Announced",
				patterns: [/terms? of.{0,20}rights/i, /rights.{0,30}(ratio|price)/i],
				termKeys: ["rights_ratio", "issue_price"],
			},
			{
				id: "record",
				label: "Record Date",
				patterns: [/record date/i],
				termKeys: ["record_date"],
			},
			{
				id: "open",
				label: "Issue Open",
				patterns: [/issue (?:has )?opened/i, /opening of.{0,20}rights/i],
			},
			{
				id: "close",
				label: "Issue Close",
				patterns: [/issue (?:has )?closed/i, /closure of.{0,20}rights/i],
			},
			{
				id: "allotment",
				label: "Allotment",
				patterns: [/allotment/i],
				termKeys: ["allotment_date"],
			},
			{
				id: "listing",
				label: "Listing",
				patterns: [/listing (?:of|and)/i, /trading approval/i],
				termKeys: ["listing_date"],
			},
			commonCompleted,
		],
	},
	{
		type: "Dividend",
		extractionKeys: ["dividend"],
		aliases: [/dividend/i],
		maxGapDays: 100,
		stages: [
			{
				id: "proposed",
				label: "Recommended",
				patterns: [/recommend(?:ed|ation)/i, /proposed dividend/i],
			},
			{
				id: "board",
				label: "Board Approved",
				patterns: [
					/board.{0,30}(approv|declar)/i,
					/approv(?:al|es) of.{0,20}dividend/i,
				],
			},
			{
				id: "shareholder",
				label: "Shareholder Approval",
				patterns: [/shareholder.{0,30}approv/i],
			},
			{
				id: "record",
				label: "Record Date",
				patterns: [/record date/i],
				termKeys: ["record_date"],
			},
			{
				id: "ex",
				label: "Ex-Date",
				patterns: [/ex.date/i],
				termKeys: ["ex_date"],
			},
			{
				id: "payment",
				label: "Payment",
				patterns: [/payment of dividend/i, /dividend.{0,24}(paid|payment)/i],
				termKeys: ["payment_date"],
			},
			commonCompleted,
		],
	},
	{
		type: "Bonus Issue",
		extractionKeys: ["bonus_issue", "bonus"],
		aliases: [/bonus issue/i, /bonus shares?/i],
		maxGapDays: 240,
		stages: [
			{ id: "proposal", label: "Proposal", patterns: [/propos/i] },
			{
				id: "board",
				label: "Board Approved",
				patterns: [/board.{0,30}approv/i],
			},
			{
				id: "shareholder",
				label: "Shareholder Approval",
				patterns: [/shareholder.{0,30}approv/i],
			},
			{
				id: "record",
				label: "Record Date",
				patterns: [/record date/i],
				termKeys: ["record_date"],
			},
			{
				id: "ex",
				label: "Ex-Date",
				patterns: [/ex.date/i],
				termKeys: ["ex_date"],
			},
			{
				id: "allotment",
				label: "Allotment",
				patterns: [/allotment/i],
				termKeys: ["allotment_date"],
			},
			{
				id: "listing",
				label: "Listing / Credit",
				patterns: [/listing|credit/i],
				termKeys: ["listing_date"],
			},
			commonCompleted,
		],
	},
	{
		type: "Stock Split",
		extractionKeys: ["stock_split", "split"],
		aliases: [
			/stock split/i,
			/sub.division of (?:equity )?shares/i,
			/split of shares/i,
		],
		maxGapDays: 240,
		stages: [
			{ id: "proposal", label: "Proposal", patterns: [/propos/i] },
			{
				id: "board",
				label: "Board Approved",
				patterns: [/board.{0,30}approv/i],
			},
			{
				id: "shareholder",
				label: "Shareholder Approval",
				patterns: [/shareholder.{0,30}approv/i],
			},
			{
				id: "record",
				label: "Record Date",
				patterns: [/record date/i],
				termKeys: ["record_date"],
			},
			{
				id: "ex",
				label: "Ex-Date",
				patterns: [/ex.date/i],
				termKeys: ["ex_date"],
			},
			{
				id: "effective",
				label: "Effective",
				patterns: [/effective|credit of sub.divided/i],
				termKeys: ["effective_date"],
			},
			commonCompleted,
		],
	},
	{
		type: "Buyback",
		extractionKeys: ["buyback"],
		aliases: [/buy.?back/i],
		maxGapDays: 365,
		stages: [
			{ id: "proposal", label: "Proposal", patterns: [/propos/i] },
			{
				id: "board",
				label: "Board Approval",
				patterns: [/board.{0,30}approv/i, /outcome of board meeting/i],
			},
			{
				id: "shareholder",
				label: "Shareholder Approval",
				patterns: [/shareholder.{0,30}approv/i],
			},
			{
				id: "record",
				label: "Record Date / Eligibility",
				patterns: [/record date|eligib/i],
				termKeys: ["record_date"],
			},
			{
				id: "open",
				label: "Offer Opens",
				patterns: [/offer (?:has )?open/i],
				termKeys: ["opening_date", "open_date"],
			},
			{
				id: "close",
				label: "Offer Closes",
				patterns: [/offer (?:has )?clos/i],
			},
			{ id: "settlement", label: "Settlement", patterns: [/settlement/i] },
			{
				id: "extinguishment",
				label: "Extinguishment",
				patterns: [/extinguish/i],
			},
			commonCompleted,
		],
	},
	{
		type: "Conversion of Warrants",
		extractionKeys: ["conversion_of_warrants", "warrant_conversion"],
		aliases: [/conversion of warrants/i, /warrants?.{0,28}convert/i],
		maxGapDays: 365,
		stages: [
			{
				id: "issued",
				label: "Warrants Issued",
				patterns: [/warrants? issued/i],
			},
			{
				id: "request",
				label: "Conversion Request",
				patterns: [/conversion request|exercise of warrant/i],
			},
			{
				id: "board",
				label: "Board Approval",
				patterns: [/board.{0,30}approv/i],
			},
			{
				id: "allotment",
				label: "Equity Allotment",
				patterns: [/allotment/i],
				termKeys: ["allotment_date"],
			},
			{
				id: "listing",
				label: "Listing",
				patterns: [/listing/i],
				termKeys: ["listing_date"],
			},
			commonCompleted,
		],
	},
	{
		type: "Offer for Sale",
		extractionKeys: ["offer_for_sale", "ofs"],
		aliases: [/offer for sale/i, /\bofs\b/i],
		maxGapDays: 45,
		stages: [
			{
				id: "announcement",
				label: "Announcement",
				patterns: [/announcement|notice/i],
			},
			{
				id: "floor",
				label: "Floor Price",
				patterns: [/floor price/i],
				termKeys: ["floor_price"],
			},
			{
				id: "non_retail",
				label: "Non-Retail Offer",
				patterns: [/non.retail/i],
			},
			{ id: "retail", label: "Retail Offer", patterns: [/retail/i] },
			{
				id: "settlement",
				label: "Settlement",
				patterns: [/settlement|sale completion/i],
			},
			commonCompleted,
		],
	},
	{
		type: "Redemption of Securities",
		extractionKeys: ["redemption_of_securities", "redemption"],
		aliases: [/redemption of securities/i, /redemption/i],
		maxGapDays: 240,
		stages: [
			{
				id: "announced",
				label: "Redemption Announced",
				patterns: [/redemption/i],
			},
			{
				id: "record",
				label: "Record Date",
				patterns: [/record date/i],
				termKeys: ["record_date"],
			},
			{
				id: "payment",
				label: "Payment / Redemption",
				patterns: [/payment|redeemed/i],
				termKeys: ["payment_date"],
			},
			{
				id: "extinguishment",
				label: "Extinguishment",
				patterns: [/extinguish/i],
			},
			commonCompleted,
		],
	},
	{
		type: "Demerger",
		extractionKeys: ["demerger"],
		aliases: [/demerger/i, /de.merger/i],
		maxGapDays: 900,
		stages: schemeStages(),
	},
	{
		type: "Merger",
		extractionKeys: ["merger"],
		aliases: [/\bmerger\b/i, /amalgamation/i],
		maxGapDays: 900,
		stages: schemeStages(),
	},
	{
		type: "De-listing",
		extractionKeys: ["delisting", "de_listing"],
		aliases: [/de.listing/i, /delisting/i, /reverse book build/i],
		maxGapDays: 900,
		stages: [
			{ id: "proposal", label: "Proposal", patterns: [/propos/i] },
			{
				id: "board",
				label: "Board Approval",
				patterns: [/board.{0,30}approv/i],
			},
			{
				id: "shareholder",
				label: "Shareholder Approval",
				patterns: [/shareholder.{0,30}approv/i],
			},
			{
				id: "exchange",
				label: "Exchange Approval",
				patterns: [/in.principle.{0,30}approv/i],
			},
			{
				id: "floor",
				label: "Floor Price",
				patterns: [/floor price/i],
				termKeys: ["floor_price"],
			},
			{
				id: "book",
				label: "Reverse Book Building",
				patterns: [/reverse book build/i],
			},
			{
				id: "final",
				label: "Final Price",
				patterns: [/discovered price|final price/i],
				termKeys: ["discovered_price", "final_price"],
			},
			{ id: "settlement", label: "Settlement", patterns: [/settlement/i] },
			{ id: "delisted", label: "Delisted", patterns: [/delisted/i] },
			commonCompleted,
		],
	},
	{
		type: "Issue of Securities",
		extractionKeys: ["issue_of_securities", "securities_issue"],
		aliases: [
			/issue of securities/i,
			/preferential issue/i,
			/qualified institutional placement/i,
			/\bqip\b/i,
			/private placement/i,
		],
		maxGapDays: 365,
		stages: [
			{ id: "proposal", label: "Proposal", patterns: [/propos/i] },
			{
				id: "board",
				label: "Board Approval",
				patterns: [/board.{0,30}approv/i],
			},
			{
				id: "shareholder",
				label: "Shareholder Approval",
				patterns: [/shareholder.{0,30}approv/i],
			},
			{
				id: "regulatory",
				label: "Regulatory Approval",
				patterns: [/exchange.{0,30}approv|in.principle.{0,30}approv/i],
			},
			{
				id: "issue",
				label: "Issue / Placement",
				patterns: [/issue open|placement/i],
			},
			{
				id: "allotment",
				label: "Allotment",
				patterns: [/allotment/i],
				termKeys: ["allotment_date"],
			},
			{
				id: "listing",
				label: "Listing",
				patterns: [/listing/i],
				termKeys: ["listing_date"],
			},
			commonCompleted,
		],
	},
];

function schemeStages(): StageDefinition[] {
	return [
		{ id: "proposal", label: "Proposal", patterns: [/propos/i] },
		{ id: "board", label: "Board Approval", patterns: [/board.{0,30}approv/i] },
		{ id: "scheme", label: "Scheme Announced", patterns: [/scheme/i] },
		{
			id: "regulatory",
			label: "Regulatory Review",
			patterns: [/exchange|regulator|sebi/i],
		},
		{
			id: "authority",
			label: "Authority Approval",
			patterns: [/nclt|authority.{0,30}approv/i],
		},
		{
			id: "stakeholder",
			label: "Stakeholder Approval",
			patterns: [/(shareholder|creditor).{0,30}approv/i],
		},
		{
			id: "effective",
			label: "Effective Date",
			patterns: [/effective date/i],
			termKeys: ["effective_date"],
		},
		{
			id: "record",
			label: "Record Date",
			patterns: [/record date/i],
			termKeys: ["record_date"],
		},
		{
			id: "allotment",
			label: "Allotment / Cancellation",
			patterns: [/allotment|cancellation of shares/i],
		},
		{
			id: "listing",
			label: "Listing",
			patterns: [/listing/i],
			termKeys: ["listing_date"],
		},
		commonCompleted,
	];
}

const TERM_LABELS: Record<string, string> = {
	acceptance_ratio: "Acceptance ratio",
	allotment_date: "Allotment date",
	appointed_date: "Appointed date",
	bonus_ratio: "Bonus ratio",
	buyback_price: "Buyback price",
	buyback_percentage: "Buyback percentage",
	buyback_type: "Buyback type",
	closing_date: "Closing date",
	conversion_price: "Conversion price",
	discovered_price: "Discovered price",
	dividend_amount_rs_per_share: "Dividend / share",
	dividend_percentage: "Dividend percentage",
	effective_date: "Effective date",
	ex_date: "Ex-date",
	face_value: "Face value",
	face_value_after: "New face value",
	face_value_before: "Old face value",
	final_price: "Final price",
	floor_price: "Floor price",
	issue_price: "Issue price",
	issue_size: "Issue size",
	entities: "Entities",
	entitlement_ratio: "Entitlement ratio",
	listing_date: "Listing date",
	maximum_amount: "Maximum amount",
	maximum_shares: "Maximum shares",
	new_company_names: "New companies",
	new_face_value: "New face value",
	no_of_shares: "Number of shares",
	number_of_shares: "Number of shares",
	old_face_value: "Old face value",
	open_date: "Opening date",
	opening_date: "Opening date",
	payment_date: "Payment date",
	percentage: "Percentage",
	period: "Period",
	price: "Price",
	record_date: "Record date",
	renunciation_date: "Renunciation date",
	rights_ratio: "Rights ratio",
	shares_allotted: "Shares allotted",
	shares_offered: "Shares offered",
	share_ratios: "Share ratios",
	segments_demerged: "Segments demerged",
	split_ratio: "Split ratio",
	swap_ratio: "Swap ratio",
	total_shares_approved: "Total shares approved",
	warrants_converted: "Warrants converted",
};

const TERM_KEY_ALIASES: Partial<Record<ActionType, Record<string, string>>> = {
	"Bonus Issue": { face_value_after: "new_face_value" },
	Buyback: {
		no_of_shares: "number_of_shares",
		price: "buyback_price",
		percentage: "buyback_percentage",
	},
	"Rights Issue": {
		total_shares_approved: "maximum_shares",
		price: "issue_price",
		entitlement_ratio: "rights_ratio",
	},
	"Stock Split": {
		face_value_before: "old_face_value",
		face_value_after: "new_face_value",
	},
	Merger: { share_ratios: "swap_ratio" },
	Demerger: { share_ratios: "swap_ratio" },
};

const CORE_ACTION_SET = new Set<ActionType>(CORE_ACTION_TYPES);

type ExtractedTerm = {
	key: string;
	label: string;
	value: string;
	rawValue: unknown;
	normalizedValue?: string | number | boolean | string[];
};
type Cluster = {
	events: SourceAnnouncement[];
	anchor?: string;
	ambiguous: boolean;
};

type BuildLifecycleOptions = {
	existing?: CorporateActionLifecycle[];
	createId?: () => string;
};

export function buildLifecycles(
	announcements: SourceAnnouncement[],
	options: BuildLifecycleOptions = {},
): CorporateActionLifecycle[] {
	const classified = announcements
		.flatMap((announcement) =>
			classifyDefinitions(announcement).map((definition) => ({
				announcement,
				definition,
			})),
		)
		.sort(
			(a, b) =>
				new Date(a.announcement.date).getTime() -
				new Date(b.announcement.date).getTime(),
		);

	const groups = new Map<string, Cluster[]>();
	for (const item of classified) {
		const key = `${item.announcement.symbol}:${item.definition.type}`;
		const clusters = groups.get(key) ?? [];
		const anchor = extractAnchor(item.announcement, item.definition);
		const recent = clusters.filter((cluster) => {
			const last = cluster.events.at(-1);
			if (!last) return false;
			const days =
				(new Date(item.announcement.date).getTime() -
					new Date(last.date).getTime()) /
				86_400_000;
			return days <= item.definition.maxGapDays;
		});
		const exact = anchor
			? recent.filter((cluster) => cluster.anchor === anchor)
			: [];
		const compatible = recent.filter(
			(cluster) => !anchor || !cluster.anchor || cluster.anchor === anchor,
		);
		const candidates = exact.length > 0 ? exact : compatible;

		if (candidates.length === 1) {
			candidates[0].events.push(item.announcement);
			candidates[0].anchor ??= anchor;
		} else {
			clusters.push({
				events: [item.announcement],
				anchor,
				ambiguous: candidates.length > 1,
			});
		}
		groups.set(key, clusters);
	}

	const result: CorporateActionLifecycle[] = [];
	const claimedExistingIds = new Set<string>();
	for (const [key, clusters] of groups) {
		const type = key.slice(key.indexOf(":") + 1) as ActionType;
		const definition = ACTION_DEFINITIONS.find((item) => item.type === type);
		if (!definition) continue;
		for (const cluster of clusters) {
			const existingId = options.existing?.find((lifecycle) => {
				if (
					claimedExistingIds.has(lifecycle.id) ||
					lifecycle.actionType !== definition.type ||
					lifecycle.symbol !== cluster.events[0]?.symbol
				)
					return false;
				const eventIds = new Set(cluster.events.map((event) => event.id));
				return lifecycle.announcements.some((event) => eventIds.has(event.id));
			})?.id;
			if (existingId) claimedExistingIds.add(existingId);
			result.push(
				buildLifecycle(
					cluster,
					definition,
					existingId ?? options.createId?.() ?? crypto.randomUUID(),
				),
			);
		}
	}

	return result.sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

export function isCorporateActionAnnouncement(
	announcement: SourceAnnouncement,
): boolean {
	return classifyDefinitions(announcement).length > 0;
}

export function classifyAnnouncement(
	announcement: SourceAnnouncement,
): ActionType[] {
	return classifyDefinitions(announcement).map((definition) => definition.type);
}

function buildLifecycle(
	cluster: Cluster,
	definition: ActionDefinition,
	id: string,
): CorporateActionLifecycle {
	const events = cluster.events;
	const first = events[0];
	const last = events.at(-1) ?? first;
	const stageHits = new Map<number, SourceAnnouncement>();
	const termsByKey = new Map<string, LifecycleTerm>();
	const changes: LifecycleChange[] = [];
	let highestStage = -1;

	for (const event of events) {
		const extractedTerms = extractTerms(event, definition);
		const text = announcementText(event);
		let eventStage = -1;
		for (const [index, stage] of definition.stages.entries()) {
			const matchesText = stage.patterns.some((pattern) => pattern.test(text));
			if (matchesText) {
				eventStage = Math.max(eventStage, index);
				stageHits.set(index, event);
			}
		}

		if (eventStage > highestStage) {
			highestStage = eventStage;
			const stage = definition.stages[eventStage];
			stageHits.set(eventStage, event);
			changes.push({
				id: `${event.id}:stage:${stage.id}`,
				timestamp: event.date,
				type: stage.id === "completed" ? "completed" : "state_change",
				title: stage.label,
				announcementId: event.id,
			});
		} else if (eventStage >= 0) {
			stageHits.set(eventStage, stageHits.get(eventStage) ?? event);
		}

		for (const term of extractedTerms) {
			const previous = termsByKey.get(term.key);
			if (previous?.value === term.value) continue;
			const certainty = isDateKey(term.key) ? "confirmed" : undefined;
			termsByKey.set(term.key, {
				...term,
				evidenceSource: "structured",
				observedAt: event.date,
				certainty,
				announcementId: event.id,
			});
			if (previous) {
				changes.push({
					id: `${event.id}:term:${term.key}`,
					timestamp: event.date,
					type: "field_change",
					title: `${term.label} changed`,
					field: term.key,
					previousValue: previous.value,
					newValue: term.value,
					announcementId: event.id,
				});
			} else if (isDateKey(term.key)) {
				changes.push({
					id: `${event.id}:term:${term.key}`,
					timestamp: event.date,
					type: "new_date",
					title: `${term.label} announced`,
					field: term.key,
					newValue: term.value,
					announcementId: event.id,
				});
			}
		}
	}

	const cancelled = events.some((event) =>
		/\b(cancelled|canceled|withdrawn|rejected)\b/i.test(
			announcementText(event),
		),
	);
	const completed = highestStage === definition.stages.length - 1;
	const state = cluster.ambiguous
		? "needs_review"
		: cancelled
			? "cancelled"
			: completed
				? "completed"
				: "active";
	const current = definition.stages[highestStage];
	const next = definition.stages[highestStage + 1];
	const stages: LifecycleStage[] = definition.stages.map((stage, index) => {
		const hit = stageHits.get(index);
		let status: LifecycleStage["status"] = "pending";
		if (state === "cancelled" && index >= highestStage) status = "cancelled";
		else if (index === highestStage)
			status = state === "completed" ? "completed" : "current";
		else if (index < highestStage && hit) status = "completed";
		return {
			id: stage.id,
			label: stage.label,
			status,
			date: hit?.date,
			dateCertainty: hit ? "confirmed" : undefined,
			announcementIds: hit ? [hit.id] : undefined,
			evidence: hit ? stageEvidence(hit, changes) : undefined,
		};
	});

	if (cluster.ambiguous) {
		changes.push({
			id: `${last.id}:review`,
			timestamp: last.date,
			type: "field_change",
			title: "Filing held for review",
			description:
				"More than one lifecycle is a plausible match. It was not merged automatically.",
			announcementId: last.id,
		});
	}

	if (cancelled) {
		changes.push({
			id: `${last.id}:cancelled`,
			timestamp: last.date,
			type: "cancelled",
			title: `${definition.type} cancelled`,
			announcementId: last.id,
		});
	}

	return {
		id,
		symbol: first.symbol,
		companyName: last.companyName || first.companyName || first.symbol,
		companyLogo: [...events].reverse().find((event) => event.companyLogo)
			?.companyLogo,
		actionType: definition.type,
		summary:
			last.longSummary ??
			last.summary ??
			`${last.headline}. ${events.length} source filing${events.length === 1 ? "" : "s"} currently make up this lifecycle.`,
		status:
			state === "needs_review"
				? "Needs Review"
				: state === "cancelled"
					? "Cancelled"
					: state === "completed"
						? "Completed"
						: (current?.label ?? "Announced"),
		state,
		createdAt: first.date,
		updatedAt: last.date,
		terms: [...termsByKey.values()],
		stages,
		changes: changes.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		),
		announcements: [...events].reverse().map((event) => ({
			id: event.id,
			date: event.date,
			headline: event.headline,
			exchange: event.exchange,
			category: event.category,
			relatedCategories: event.relatedCategories,
			descriptor: event.descriptor,
			summary: event.summary,
			longSummary: event.longSummary,
			important: event.important,
			image: event.image,
			extractedInformation: event.extractedInformation,
			rawData: event.rawData,
			sourceUrl: `/backend/api/announcements/${encodeURIComponent(event.id)}/source`,
		})),
		nextExpectedStage: state === "active" ? next?.label : undefined,
		nextExpectedDate: findNextDate(next, termsByKey),
	};
}

function classifyDefinitions(
	announcement: SourceAnnouncement,
): ActionDefinition[] {
	const root = asRecord(announcement.extractedInformation);
	const categoryText = [
		announcement.category,
		...announcement.relatedCategories,
	].join(" ");
	return ACTION_DEFINITIONS.filter((definition) => {
		if (!CORE_ACTION_SET.has(definition.type)) return false;
		const structured = definition.extractionKeys.some((key) =>
			isValidExtraction(root[key]),
		);
		const categorized = definition.aliases.some((pattern) =>
			pattern.test(categoryText),
		);
		return structured || categorized;
	});
}

function extractTerms(
	announcement: SourceAnnouncement,
	definition: ActionDefinition,
): ExtractedTerm[] {
	const root = asRecord(announcement.extractedInformation);
	const nestedKey = definition.extractionKeys.find((key) =>
		isValidExtraction(root[key]),
	);
	const source = nestedKey ? asRecord(root[nestedKey]) : root;
	return Object.entries(source).flatMap(([key, value]) => {
		if (key === "status" || value == null || value === "") return [];
		const canonicalKey = TERM_KEY_ALIASES[definition.type]?.[key] ?? key;
		if (!(canonicalKey in TERM_LABELS)) return [];
		return [
			{
				key: canonicalKey,
				label: TERM_LABELS[canonicalKey],
				value: formatValue(canonicalKey, value),
				rawValue: value,
				normalizedValue: normalizeTermValue(canonicalKey, value),
			},
		];
	});
}

function extractAnchor(
	announcement: SourceAnnouncement,
	definition: ActionDefinition,
): string | undefined {
	const terms = extractTerms(announcement, definition);
	const preferred = [
		"record_date",
		"opening_date",
		"open_date",
		"effective_date",
	];
	return preferred
		.map((key) => terms.find((term) => term.key === key)?.value)
		.find(Boolean);
}

function findNextDate(
	stage: StageDefinition | undefined,
	terms: Map<string, LifecycleTerm>,
): string | undefined {
	return stage?.termKeys?.map((key) => terms.get(key)?.value).find(Boolean);
}

function stageEvidence(
	event: SourceAnnouncement,
	changes: LifecycleChange[],
): NonNullable<LifecycleStage["evidence"]> {
	const change = changes.find((item) => item.announcementId === event.id);
	const changedValue =
		change?.previousValue && change.newValue
			? `${change.title}: ${change.previousValue} to ${change.newValue}`
			: change?.title;
	return {
		announcementId: event.id,
		date: event.date,
		summary: event.summary ?? event.headline,
		criticalAspect: changedValue ?? event.descriptor ?? event.headline,
	};
}

function announcementText(announcement: SourceAnnouncement): string {
	return [
		announcement.category,
		...announcement.relatedCategories,
		announcement.descriptor,
		announcement.headline,
		announcement.summary,
		announcement.longSummary,
	]
		.filter(Boolean)
		.join(" ");
}

function isValidExtraction(value: unknown): boolean {
	const record = asRecord(value);
	return (
		Object.keys(record).length > 0 &&
		String(record.status ?? "").toLowerCase() !== "failed"
	);
}

function normalizeTermValue(
	key: string,
	value: unknown,
): string | number | boolean | string[] | undefined {
	if (isDateKey(key) && typeof value === "string") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	)
		return value;
	if (Array.isArray(value) && value.every((item) => typeof item === "string"))
		return value;
	return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function formatValue(key: string, value: unknown): string {
	if (isDateKey(key) && typeof value === "string") {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return INDIA_DATE_FORMATTER.format(date);
		}
	}
	if (typeof value === "number") {
		if (/price|amount|value|size|dividend/.test(key))
			return `₹${value.toLocaleString("en-IN")}`;
		return value.toLocaleString("en-IN");
	}
	if (typeof value === "string" || typeof value === "boolean")
		return String(value);
	return JSON.stringify(value);
}

function isDateKey(key: string): boolean {
	return key.endsWith("_date") || key === "open_date" || key === "closing_date";
}
