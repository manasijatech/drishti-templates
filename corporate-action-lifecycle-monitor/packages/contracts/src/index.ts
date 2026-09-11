export const ACTION_TYPES = [
	"Dividend",
	"Bonus Issue",
	"Stock Split",
	"Rights Issue",
	"Buyback",
	"Issue of Securities",
	"Conversion of Warrants",
	"Offer for Sale",
	"Redemption of Securities",
	"Merger",
	"Demerger",
	"De-listing",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];
export const CORE_ACTION_TYPES = [
	"Dividend",
	"Bonus Issue",
	"Buyback",
	"Conversion of Warrants",
	"De-listing",
	"Demerger",
	"Issue of Securities",
	"Merger",
	"Offer for Sale",
	"Redemption of Securities",
	"Rights Issue",
	"Stock Split",
] as const satisfies readonly ActionType[];
export type CoreActionType = (typeof CORE_ACTION_TYPES)[number];
export type LifecycleState =
	| "active"
	| "completed"
	| "cancelled"
	| "needs_review";
export type StageStatus =
	| "completed"
	| "current"
	| "pending"
	| "skipped"
	| "cancelled";
export type DateCertainty = "confirmed" | "expected" | "estimated";

export type LifecycleStage = {
	id: string;
	label: string;
	status: StageStatus;
	date?: string;
	dateCertainty?: DateCertainty;
	announcementIds?: string[];
	evidence?: LifecycleStageEvidence;
};

export type LifecycleStageEvidence = {
	announcementId: string;
	date: string;
	summary: string;
	criticalAspect: string;
};

export type LifecycleChange = {
	id: string;
	timestamp: string;
	type:
		| "state_change"
		| "field_change"
		| "new_date"
		| "cancelled"
		| "completed";
	title: string;
	description?: string;
	field?: string;
	previousValue?: string;
	newValue?: string;
	announcementId: string;
};

export type AnnouncementReference = {
	id: string;
	date: string;
	headline: string;
	exchange: string;
	category: string;
	relatedCategories: string[];
	descriptor?: string;
	summary?: string;
	longSummary?: string;
	important?: boolean;
	image?: string;
	extractedInformation?: unknown;
	rawData?: unknown;
	sourceUrl: string;
};

export type LifecycleTerm = {
	key: string;
	label: string;
	value: string;
	rawValue?: unknown;
	normalizedValue?: string | number | boolean | string[];
	evidenceSource?: "structured" | "category" | "derived";
	observedAt?: string;
	certainty?: DateCertainty;
	announcementId: string;
};

export type LifecycleAiValidation = {
	status: "verified" | "needs_review";
	model: string;
	processedAt: string;
	rationale: string;
	suggestions: string[];
};

export type CorporateActionLifecycle = {
	id: string;
	symbol: string;
	companyName: string;
	companyLogo?: string;
	actionType: ActionType;
	summary: string;
	status: string;
	state: LifecycleState;
	createdAt: string;
	updatedAt: string;
	terms: LifecycleTerm[];
	stages: LifecycleStage[];
	changes: LifecycleChange[];
	announcements: AnnouncementReference[];
	aiValidation?: LifecycleAiValidation;
	nextExpectedStage?: string;
	nextExpectedDate?: string;
};

export type WatchlistSymbol = {
	symbol: string;
	companyName: string;
	companyLogo?: string;
	addedAt: string;
	lastSyncedAt?: string;
	lastAnnouncementAt?: string;
	backfillCompletedAt?: string;
	syncStatus?: "pending" | "backfilling" | "live" | "degraded";
	syncError?: string;
};

export type LifecycleSummary = {
	active: number;
	upcomingDates: number;
	updatedToday: number;
	completed: number;
	needsReview: number;
};

export type LifecycleStreamStatus =
	| "connecting"
	| "connected"
	| "backfilling"
	| "degraded"
	| "disconnected"
	| "not_configured";

export type LifecycleStreamDetails = {
	status: LifecycleStreamStatus;
	connectedAt?: string;
	disconnectedAt?: string;
	lastEventAt?: string;
	lastCatchupAt?: string;
	error?: string;
};

export type LifecycleListResponse = {
	data: CorporateActionLifecycle[];
	summary: LifecycleSummary;
	stream: LifecycleStreamStatus;
	streamDetails: LifecycleStreamDetails;
};

export type LifecycleSnapshot = LifecycleListResponse & {
	symbols: WatchlistSymbol[];
};

export type LifecycleSocketMessage =
	| ({ type: "snapshot" } & LifecycleSnapshot)
	| {
			type: "lifecycle.upsert";
			data: CorporateActionLifecycle;
			summary: LifecycleSummary;
	  }
	| {
			type: "lifecycle.delete";
			id: string;
			symbol: string;
			summary: LifecycleSummary;
	  }
	| {
			type: "stream.status";
			stream: LifecycleStreamStatus;
			streamDetails: LifecycleStreamDetails;
	  }
	| { type: "heartbeat"; at: string };

export type ApiError = { error: string };
