"use client";

import type {
	ApiError,
	CorporateActionLifecycle,
	LifecycleListResponse,
	LifecycleSocketMessage,
	WatchlistSymbol,
} from "@lifecycle/contracts";
import {
	ArrowRight,
	ArrowUpRight,
	CaretRight,
	Check,
	FileText,
	ListBullets,
	MagnifyingGlass,
	Star,
	Trash,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PopButton } from "@/components/pop-button";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const FILTERS = [
	"All",
	"Updated today",
	"Rights issues",
	"Bonus issues",
	"Needs review",
] as const;
const EMPTY_LIFECYCLES: CorporateActionLifecycle[] = [];
const EMPTY_SUMMARY: LifecycleListResponse["summary"] = {
	active: 0,
	upcomingDates: 0,
	updatedToday: 0,
	completed: 0,
	needsReview: 0,
};
const EMPTY_LIFECYCLE_RESPONSE: LifecycleListResponse = {
	data: [],
	summary: EMPTY_SUMMARY,
	stream: "connecting",
	streamDetails: { status: "connecting" },
};
const INDIA_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "Asia/Kolkata",
});

function useErrorToast(error: Error | null, id: string): void {
	useEffect(() => {
		if (error) {
			toast.error(error.message, { id });
			return;
		}
		toast.dismiss(id);
	}, [error, id]);
}

function isLifecycleSocketMessage(
	value: unknown,
): value is LifecycleSocketMessage {
	return Boolean(
		value &&
			typeof value === "object" &&
			"type" in value &&
			typeof value.type === "string",
	);
}

function sortLifecycles(
	data: CorporateActionLifecycle[],
): CorporateActionLifecycle[] {
	return [...data].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) {
		const payload = (await response
			.json()
			.catch(() => null)) as ApiError | null;
		throw new Error(payload?.error ?? `Request failed (${response.status})`);
	}
	return response.json() as Promise<T>;
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return INDIA_DATE_FORMATTER.format(date);
}

function relativeTime(value: string): string {
	const time = new Date(value).getTime();
	if (Number.isNaN(time)) return value;
	const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return formatDate(value);
}

function CompanyLogo({
	logo,
	name,
	symbol,
	compact = false,
}: {
	logo?: string;
	name: string;
	symbol: string;
	compact?: boolean;
}) {
	const [failedLogo, setFailedLogo] = useState<string>();
	const failed = failedLogo === logo;
	const size = compact ? "size-9 rounded-full" : "size-12 rounded-2xl";

	return (
		<div
			className={cn(
				"grid shrink-0 place-items-center overflow-hidden border border-hairline bg-panel font-medium text-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.65)]",
				size,
				compact ? "text-[10px]" : "text-[12px]",
			)}
		>
			{logo && !failed ? (
				// biome-ignore lint/performance/noImgElement: Drishti returns arbitrary company-logo hosts that cannot be safely allowlisted ahead of time.
				<img
					src={logo}
					alt={`${name} logo`}
					className="size-full object-contain p-1"
					loading="lazy"
					referrerPolicy="no-referrer"
					onError={() => setFailedLogo(logo)}
				/>
			) : (
				<span
					className="font-semibold tracking-[-0.06em]"
					role="img"
					aria-label={`${name} logo fallback`}
				>
					{symbol.slice(0, 3)}
				</span>
			)}
		</div>
	);
}

function StateBadge({ lifecycle }: { lifecycle: CorporateActionLifecycle }) {
	const tone =
		lifecycle.state === "needs_review"
			? "text-flag"
			: lifecycle.state === "completed"
				? "text-moss"
				: "text-interior-accent";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-[11px] font-medium",
				tone,
			)}
		>
			<span className="size-1.5 rounded-full bg-current" />
			{lifecycle.status}
		</span>
	);
}

function AiValidationBadge({
	lifecycle,
}: {
	lifecycle: CorporateActionLifecycle;
}) {
	const validation = lifecycle.aiValidation;
	if (!validation) return null;
	const needsReview = validation.status === "needs_review";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-[10px] font-medium",
				needsReview ? "text-flag" : "text-moss",
			)}
			title={validation.rationale}
		>
			<span className="size-1.5 rounded-full bg-current" />
			{needsReview ? "AI review suggested" : "AI verified"}
		</span>
	);
}

function StageEvidenceTooltip({
	lifecycle,
	stage,
	index,
	compact,
}: {
	lifecycle: CorporateActionLifecycle;
	stage: CorporateActionLifecycle["stages"][number];
	index: number;
	compact: boolean;
}) {
	const evidence = stage.evidence;
	const marker = (
		<span
			className={cn(
				"grid size-5 shrink-0 place-items-center rounded-full border text-[10px]",
				stage.status === "completed" && "border-moss bg-moss text-white",
				stage.status === "current" &&
					"border-interior-accent bg-interior-accent text-white ring-4 ring-accent-soft",
				stage.status === "pending" &&
					"border-hairline-strong bg-panel text-ink-3",
				stage.status === "skipped" &&
					"border-dashed border-hairline-strong bg-panel text-ink-3",
				stage.status === "cancelled" && "border-flag bg-flag/10 text-flag",
			)}
		>
			{stage.status === "completed" ? (
				<Check aria-hidden />
			) : stage.status === "skipped" ? (
				<>
					<span aria-hidden>—</span>
					<span className="sr-only">Skipped</span>
				</>
			) : (
				index + 1
			)}
		</span>
	);
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					compact ? (
						marker
					) : (
						<button
							type="button"
							aria-label={`${lifecycle.actionType}: ${stage.label} evidence`}
							className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
						>
							{marker}
						</button>
					)
				}
			/>
			<TooltipPopup
				className="w-[min(18rem,calc(100vw-2rem))] border-hairline-strong bg-panel p-0 text-left shadow-[0_12px_32px_rgba(28,25,23,0.18)]"
				side="top"
			>
				<div className="border-b border-hairline px-3.5 py-2.5">
					<p className="meta text-ink-3">Source filing</p>
					<p className="mt-1 text-[11px] font-medium text-ink">{stage.label}</p>
				</div>
				{evidence ? (
					<div className="space-y-3 px-3.5 py-3 text-[11px] leading-[1.45] text-ink-2">
						<p className="break-words text-ink">{evidence.summary}</p>
						<div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5 text-[10px]">
							<span className="text-ink-3">Filed</span>
							<time
								className="shrink-0 font-medium text-ink"
								dateTime={evidence.date}
							>
								{formatDate(evidence.date)}
							</time>
						</div>
						<div>
							<p className="meta text-ink-3">What changed</p>
							<p className="mt-1 break-words text-[10.5px] text-ink-2">
								{evidence.criticalAspect}
							</p>
						</div>
					</div>
				) : (
					<div className="px-3.5 py-3 text-[10.5px] leading-4 text-ink-2">
						<p className="font-medium text-ink">Awaiting evidence</p>
						<p className="mt-1">No filing has confirmed this step yet.</p>
					</div>
				)}
			</TooltipPopup>
		</Tooltip>
	);
}

function ProgressRail({
	lifecycle,
	compact = false,
}: {
	lifecycle: CorporateActionLifecycle;
	compact?: boolean;
}) {
	return (
		<ol
			className={cn(
				"flex min-w-max items-start",
				compact ? "gap-0" : "gap-0.5",
			)}
			aria-label={`${lifecycle.actionType} lifecycle`}
		>
			{lifecycle.stages.map((stage, index) => (
				<li
					key={stage.id}
					className={cn(
						"relative flex items-start",
						index < lifecycle.stages.length - 1 ? "flex-1" : "",
					)}
				>
					<div
						className={cn("flex flex-col", compact ? "w-[112px]" : "w-[132px]")}
					>
						<div className="flex items-center">
							<StageEvidenceTooltip
								compact={compact}
								index={index}
								lifecycle={lifecycle}
								stage={stage}
							/>
							{index < lifecycle.stages.length - 1 ? (
								<span
									className={cn(
										"h-px flex-1",
										stage.status === "completed"
											? "bg-moss"
											: "bg-hairline-strong",
									)}
								/>
							) : null}
						</div>
						<p
							className={cn(
								"mt-2 pr-3 text-[10.5px] leading-4",
								stage.status === "current"
									? "font-medium text-ink"
									: "text-ink-3",
							)}
						>
							{stage.label}
						</p>
						{!compact && stage.date ? (
							<p className="meta mt-1 text-ink-3">
								{formatDate(stage.date)}
								{stage.dateCertainty === "expected" ? " · EXP" : ""}
							</p>
						) : null}
					</div>
				</li>
			))}
		</ol>
	);
}

function LifecycleRow({
	lifecycle,
	selected,
	onSelect,
}: {
	lifecycle: CorporateActionLifecycle;
	selected: boolean;
	onSelect: () => void;
}) {
	const latest = lifecycle.changes[0];
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"group grid w-full gap-5 border-t border-hairline px-5 py-5 text-left transition-colors hover:bg-sub focus-visible:relative sm:grid-cols-[170px_minmax(300px,1fr)_180px_20px] sm:items-center",
				selected && "bg-accent-soft/60",
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<CompanyLogo
					logo={lifecycle.companyLogo}
					name={lifecycle.companyName}
					symbol={lifecycle.symbol}
					compact
				/>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<strong className="truncate text-[13px] font-medium text-ink">
							{lifecycle.symbol}
						</strong>
						<Star
							aria-label="Watchlisted"
							weight="fill"
							className="size-3 text-ink-3"
						/>
					</div>
					<p className="mt-1 truncate text-[11.5px] text-ink-3">
						{lifecycle.companyName}
					</p>
					<p className="meta mt-2 uppercase text-ink-3">
						{lifecycle.actionType}
					</p>
				</div>
			</div>
			<div className="min-w-0 overflow-hidden">
				<StateBadge lifecycle={lifecycle} />
				<div className="mt-1.5">
					<AiValidationBadge lifecycle={lifecycle} />
				</div>
				<div className="mt-3 overflow-hidden">
					<ProgressRail lifecycle={lifecycle} compact />
				</div>
			</div>
			<div className="min-w-0">
				<p className="meta uppercase text-ink-3">Latest change</p>
				<p className="mt-2 text-[12px] font-medium leading-5 text-ink">
					{latest?.title ?? "Filing added as evidence"}
				</p>
				{latest?.previousValue && latest.newValue ? (
					<p className="mt-1 text-[11.5px] text-ink-2 tnum">
						<span className="line-through text-ink-3">
							{latest.previousValue}
						</span>{" "}
						<ArrowRight aria-hidden className="mx-1 inline size-3" />{" "}
						{latest.newValue}
					</p>
				) : null}
				<p className="mt-1 text-[10.5px] text-ink-3">
					{relativeTime(lifecycle.updatedAt)}
				</p>
			</div>
			<CaretRight
				aria-hidden
				className="hidden size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 sm:block"
			/>
		</button>
	);
}

function DetailPanel({ lifecycle }: { lifecycle: CorporateActionLifecycle }) {
	return (
		<section className="mat-panel rounded-[14px]">
			<header className="border-b border-hairline px-5 py-5 sm:px-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="meta uppercase text-ink-3">Selected lifecycle</p>
						<h2 className="mt-2 text-xl font-medium tracking-[-0.03em] text-ink">
							{lifecycle.companyName}{" "}
							<span className="font-normal text-ink-3">
								· {lifecycle.actionType}
							</span>
						</h2>
						<div className="mt-2 flex items-center gap-3">
							<StateBadge lifecycle={lifecycle} />
							<AiValidationBadge lifecycle={lifecycle} />
							<span className="text-[11px] text-ink-3">
								Updated {relativeTime(lifecycle.updatedAt)}
							</span>
						</div>
					</div>
				</div>
			</header>

			<div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.75fr)]">
				<div className="min-w-0 border-b border-hairline p-5 sm:p-6 xl:border-r xl:border-b-0">
					<div className="flex items-center justify-between">
						<h3 className="text-[13px] font-medium text-ink">Lifecycle</h3>
						{lifecycle.nextExpectedStage ? (
							<p className="text-[11.5px] text-ink-3">
								Typically follows:{" "}
								<span className="font-medium text-ink">
									{lifecycle.nextExpectedStage}
								</span>
							</p>
						) : null}
					</div>
					<div className="mt-6 overflow-x-auto pb-2">
						<ProgressRail lifecycle={lifecycle} />
					</div>
					<h3 className="mt-7 text-[13px] font-medium text-ink">Key terms</h3>
					<dl className="mt-3 grid gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
						{lifecycle.terms.map((term) => (
							<div key={term.label} className="bg-panel p-3.5">
								<dt className="meta uppercase text-ink-3">{term.label}</dt>
								<dd className="mt-2 text-[13px] font-medium text-ink tnum">
									{term.value}
								</dd>
								{term.certainty ? (
									<span
										className={cn(
											"mt-2 inline-block text-[9.5px] uppercase tracking-wide",
											term.certainty === "confirmed"
												? "text-moss"
												: "text-ink-3",
										)}
									>
										{term.certainty}
									</span>
								) : null}
							</div>
						))}
					</dl>
				</div>
				<aside className="p-5 sm:p-6">
					{lifecycle.aiValidation ? (
						<section className="mb-6 rounded-[10px] border border-hairline bg-sub p-3.5">
							<AiValidationBadge lifecycle={lifecycle} />
							<p className="mt-2 text-[11px] leading-4 text-ink-2">
								{lifecycle.aiValidation.rationale}
							</p>
							{lifecycle.aiValidation.suggestions.length > 0 ? (
								<ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-ink-2">
									{lifecycle.aiValidation.suggestions.map((suggestion) => (
										<li key={suggestion}>{suggestion}</li>
									))}
								</ul>
							) : null}
						</section>
					) : null}
					<h3 className="text-[13px] font-medium text-ink">
						Meaningful changes
					</h3>
					<div className="mt-4 flex flex-col gap-4">
						{lifecycle.changes.map((change) => (
							<article
								key={change.id}
								className="border-l border-hairline-strong pl-3"
							>
								<time className="meta text-ink-3">
									{formatDate(change.timestamp)}
								</time>
								<h4 className="mt-2 text-[12px] font-medium text-ink">
									{change.title}
								</h4>
								{change.previousValue && change.newValue ? (
									<p className="mt-1 text-[11.5px] text-ink-2">
										<span className="line-through text-ink-3">
											{change.previousValue}
										</span>{" "}
										→ {change.newValue}
									</p>
								) : null}
								{change.description ? (
									<p className="mt-1 text-[11px] leading-4 text-ink-3">
										{change.description}
									</p>
								) : null}
							</article>
						))}
						{lifecycle.changes.length === 0 ? (
							<p className="text-[11.5px] leading-5 text-ink-3">
								No material state or field changes detected yet.
							</p>
						) : null}
					</div>
				</aside>
			</div>

			<footer className="border-t border-hairline px-5 py-5 sm:px-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<div className="grid size-7 place-items-center rounded-md bg-sub text-ink-3">
							<FileText aria-hidden className="size-3.5" />
						</div>
						<div>
							<h3 className="text-[12px] font-medium text-ink">
								Source filings
							</h3>
							<p className="mt-0.5 text-[10.5px] text-ink-3">
								{lifecycle.announcements.length} filing
								{lifecycle.announcements.length === 1 ? "" : "s"} · newest first
							</p>
						</div>
					</div>
					<span className="text-[10.5px] text-ink-3">
						Open a filing to review its source record
					</span>
				</div>
				<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
					{lifecycle.announcements.map((item) => (
						<a
							key={item.id}
							href={item.sourceUrl}
							target="_blank"
							rel="noreferrer"
							aria-label={`Open filing: ${item.headline}`}
							className="group min-w-0 rounded-[10px] border border-hairline bg-sub p-3.5 transition-[background-color,border-color,box-shadow] hover:border-hairline-strong hover:bg-panel hover:shadow-[0_3px_12px_rgba(28,25,23,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/35"
						>
							<div className="flex items-center justify-between gap-2">
								<time className="meta text-ink-3" dateTime={item.date}>
									{formatDate(item.date)}
								</time>
								<div className="flex items-center gap-1">
									{item.exchange.split("/").map((exchange) => (
										<Badge key={exchange} size="sm" variant="outline">
											{exchange.trim()}
										</Badge>
									))}
								</div>
							</div>
							<div className="mt-3 flex items-start justify-between gap-3">
								<p className="line-clamp-2 min-w-0 text-[12px] font-medium leading-[1.4] text-ink">
									{item.headline}
								</p>
								<ArrowUpRight
									aria-hidden
									className="mt-0.5 size-3.5 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
								/>
							</div>
							{item.summary && item.summary !== item.headline ? (
								<p className="mt-2 line-clamp-2 text-[10.5px] leading-4 text-ink-2">
									{item.summary}
								</p>
							) : null}
							<div className="mt-3 flex min-w-0 items-center justify-between gap-2 border-t border-hairline pt-2.5">
								<span className="truncate text-[10px] text-ink-3">
									{item.descriptor ?? item.category}
								</span>
								{item.important ? (
									<span className="shrink-0 text-[9.5px] font-medium uppercase tracking-wide text-flag">
										Material
									</span>
								) : null}
							</div>
						</a>
					))}
				</div>
			</footer>
		</section>
	);
}

function DashboardHeader({
	addPending,
	fullMarketTracking,
	onAdd,
	onFullMarketTrackingChange,
	onRemove,
	onSymbolInputChange,
	symbolInput,
	symbols,
}: {
	addPending: boolean;
	fullMarketTracking: boolean;
	onAdd: (event: FormEvent<HTMLFormElement>) => void;
	onFullMarketTrackingChange: (enabled: boolean) => void;
	onRemove: (symbol: string) => void;
	onSymbolInputChange: (value: string) => void;
	symbolInput: string;
	symbols: WatchlistSymbol[];
}) {
	return (
		<section className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
			<div>
				<h1 className="text-[clamp(26px,3vw,34px)] font-medium leading-[1.05] tracking-[-0.04em] text-ink">
					Corporate actions
				</h1>
				<p className="mt-2.5 text-[13px] text-ink-3">
					Track dates, changes, and source filings.
				</p>
				<div className="mt-5 flex w-fit items-center gap-3 rounded-[10px] border border-hairline bg-panel px-3 py-2.5">
					<Switch
						checked={fullMarketTracking}
						onCheckedChange={onFullMarketTrackingChange}
						aria-labelledby="full-market-tracking-label"
						className="[--thumb-size:--spacing(4)] data-checked:bg-moss data-unchecked:bg-hairline-strong"
					/>
					<span>
						<span
							id="full-market-tracking-label"
							className="block text-[11.5px] font-medium text-ink"
						>
							Full market tracking
						</span>
						<span className="mt-0.5 block text-[10.5px] text-ink-3">
							{fullMarketTracking
								? "Enabled — ready for market-wide coverage"
								: "Track only the symbols you add"}
						</span>
					</span>
				</div>
			</div>
			<form
				onSubmit={onAdd}
				className="flex w-full items-center gap-2 lg:w-[360px]"
			>
				<Input
					id="symbol"
					value={symbolInput}
					onChange={(event) =>
						onSymbolInputChange(event.target.value.toUpperCase())
					}
					placeholder="Company symbol"
					autoComplete="off"
					disabled={addPending}
					className="min-w-0 flex-1"
				/>
				<PopButton
					type="submit"
					color="neutral"
					disabled={addPending || !symbolInput.trim()}
					className="min-w-[72px]"
				>
					{addPending ? "Adding…" : "Add"}
				</PopButton>
				{symbols.length > 0 ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-hairline bg-panel px-2.5 text-[10.5px] font-medium text-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.7)] transition-colors hover:bg-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25"
								aria-label={`Open watched symbols (${symbols.length})`}
							>
								<ListBullets aria-hidden className="size-3.5 text-ink-3" />
								<span>{symbols.length}</span>
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="w-64 border border-hairline bg-panel p-1.5 shadow-lg"
						>
							<div className="flex items-center justify-between px-2 py-1.5">
								<p className="meta uppercase text-ink-3">Watched symbols</p>
								<span className="text-[10px] text-ink-3">{symbols.length}</span>
							</div>
							<div className="max-h-64 overflow-y-auto">
								{symbols.map((item) => (
									<div
										key={item.symbol}
										className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-sub"
									>
										<CompanyLogo
											logo={item.companyLogo}
											name={item.companyName}
											symbol={item.symbol}
											compact
										/>
										<div className="min-w-0 flex-1">
											<p className="text-[11px] font-medium text-ink">
												{item.symbol}
											</p>
											<p className="truncate text-[10px] text-ink-3">
												{item.companyName}
											</p>
										</div>
										<button
											type="button"
											onClick={() => onRemove(item.symbol)}
											aria-label={`Remove ${item.symbol}`}
											className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-flag/10 hover:text-flag focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25"
										>
											<Trash aria-hidden className="size-3.5" />
										</button>
									</div>
								))}
							</div>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</form>
		</section>
	);
}

function FilterControls({
	filter,
	onFilterChange,
	onQueryChange,
	query,
}: {
	filter: (typeof FILTERS)[number];
	onFilterChange: (filter: (typeof FILTERS)[number]) => void;
	onQueryChange: (query: string) => void;
	query: string;
}) {
	return (
		<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<nav
				className="flex gap-1 overflow-x-auto rounded-[10px] bg-well p-1"
				aria-label="Quick filters"
			>
				{FILTERS.map((item) => (
					<button
						key={item}
						type="button"
						onClick={() => onFilterChange(item)}
						aria-pressed={filter === item}
						className={cn(
							"shrink-0 rounded-[7px] px-3 py-1.5 text-[11.5px] font-medium transition-[background-color,color,box-shadow] duration-150",
							filter === item
								? "bg-panel text-ink shadow-[0_1px_2px_rgba(28,25,23,0.10)]"
								: "text-ink-3 hover:text-ink",
						)}
					>
						{item}
					</button>
				))}
			</nav>
			<div className="relative w-full sm:w-72">
				<MagnifyingGlass
					aria-hidden
					className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
				/>
				<Input
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Filter current lifecycles"
					aria-label="Filter current lifecycles"
					className="pl-9"
				/>
			</div>
		</div>
	);
}

function LifecycleActivity({
	isLoading,
	lifecycles,
	onSelect,
	selected,
	visible,
}: {
	isLoading: boolean;
	lifecycles: CorporateActionLifecycle[];
	onSelect: (id: string) => void;
	selected: CorporateActionLifecycle;
	visible: CorporateActionLifecycle[];
}) {
	let content: ReactNode = (
		<div className="border-t border-hairline px-5 py-12 text-center text-[12px] text-ink-3">
			{lifecycles.length === 0
				? "Add a symbol above to reconstruct its corporate-action lifecycles."
				: "No lifecycles match this view."}
		</div>
	);
	if (isLoading) {
		content = (
			<div className="border-t border-hairline px-5 py-12 text-center text-[12px] text-ink-3">
				Loading lifecycles…
			</div>
		);
	} else if (visible.length > 0) {
		content = visible.map((lifecycle) => (
			<LifecycleRow
				key={lifecycle.id}
				lifecycle={lifecycle}
				selected={selected.id === lifecycle.id}
				onSelect={() => onSelect(lifecycle.id)}
			/>
		));
	}

	return (
		<section className="mt-4 overflow-hidden rounded-[12px] border border-hairline bg-panel">
			<div className="flex items-center justify-between px-5 py-4">
				<div>
					<h2 className="text-[13px] font-medium text-ink">
						Lifecycle activity
					</h2>
					<p className="mt-1 text-[11px] text-ink-3">
						Announcements are grouped by the corporate action they update.
					</p>
				</div>
				<span className="meta text-ink-3">{visible.length} RESULTS</span>
			</div>
			{content}
		</section>
	);
}

export function CorporateActionDashboard() {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
	const [query, setQuery] = useState("");
	const [symbolInput, setSymbolInput] = useState("");
	const [selectedId, setSelectedId] = useState<string>();
	const [socketReady, setSocketReady] = useState(false);
	const [fullMarketTracking, setFullMarketTracking] = useState(false);
	useEffect(() => {
		setFullMarketTracking(
			window.localStorage.getItem("full-market-tracking") === "enabled",
		);
	}, []);
	function setFullMarketTrackingPreference(enabled: boolean): void {
		setFullMarketTracking(enabled);
		window.localStorage.setItem(
			"full-market-tracking",
			enabled ? "enabled" : "disabled",
		);
		toast.message(
			enabled
				? "Full market tracking enabled"
				: "Tracking your watched symbols only",
		);
	}
	const lifecycleQuery = useQuery({
		queryKey: ["lifecycles"],
		queryFn: () =>
			requestJson<LifecycleListResponse>("/backend/api/lifecycles"),
		enabled: false,
	});
	const symbolsQuery = useQuery({
		queryKey: ["symbols"],
		queryFn: () =>
			requestJson<{ data: WatchlistSymbol[] }>("/backend/api/symbols"),
		enabled: false,
	});
	useEffect(() => {
		let socket: WebSocket | undefined;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		let attempts = 0;
		const socketUrl =
			process.env.NEXT_PUBLIC_LIFECYCLE_WS_URL ??
			"ws://localhost:4000/ws/lifecycles";

		function updateStream(stream: LifecycleListResponse["stream"]): void {
			queryClient.setQueryData<LifecycleListResponse>(
				["lifecycles"],
				(current) => ({
					...(current ?? EMPTY_LIFECYCLE_RESPONSE),
					stream,
					streamDetails: {
						...(current?.streamDetails ?? { status: stream }),
						status: stream,
					},
				}),
			);
		}

		function connect(): void {
			if (stopped) return;
			updateStream("connecting");
			socket = new WebSocket(socketUrl);
			socket.onopen = () => {
				attempts = 0;
			};
			socket.onmessage = (event) => {
				let message: unknown;
				try {
					message = JSON.parse(String(event.data));
				} catch {
					return;
				}
				if (!isLifecycleSocketMessage(message)) return;
				if (message.type === "snapshot") {
					queryClient.setQueryData<LifecycleListResponse>(["lifecycles"], {
						data: message.data,
						summary: message.summary,
						stream: message.stream,
						streamDetails: message.streamDetails,
					});
					queryClient.setQueryData<{ data: WatchlistSymbol[] }>(["symbols"], {
						data: message.symbols,
					});
					setSocketReady(true);
					return;
				}
				if (message.type === "lifecycle.upsert") {
					queryClient.setQueryData<LifecycleListResponse>(
						["lifecycles"],
						(current) => ({
							...(current ?? EMPTY_LIFECYCLE_RESPONSE),
							data: sortLifecycles([
								...(current?.data ?? []).filter(
									(item) => item.id !== message.data.id,
								),
								message.data,
							]),
							summary: message.summary,
						}),
					);
					return;
				}
				if (message.type === "lifecycle.delete") {
					queryClient.setQueryData<LifecycleListResponse>(
						["lifecycles"],
						(current) => ({
							...(current ?? EMPTY_LIFECYCLE_RESPONSE),
							data: (current?.data ?? []).filter(
								(item) => item.id !== message.id,
							),
							summary: message.summary,
						}),
					);
					return;
				}
				if (message.type === "stream.status") {
					queryClient.setQueryData<LifecycleListResponse>(
						["lifecycles"],
						(current) => ({
							...(current ?? EMPTY_LIFECYCLE_RESPONSE),
							stream: message.stream,
							streamDetails: message.streamDetails,
						}),
					);
				}
			};
			socket.onerror = () => socket?.close();
			socket.onclose = () => {
				if (stopped) return;
				updateStream("disconnected");
				attempts += 1;
				const delay = Math.min(30_000, 1_000 * 2 ** (attempts - 1));
				reconnectTimer = setTimeout(connect, delay);
			};
		}

		connect();
		return () => {
			stopped = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			socket?.close();
		};
	}, [queryClient]);
	useErrorToast(lifecycleQuery.error, "lifecycle-query-error");
	useErrorToast(symbolsQuery.error, "symbols-query-error");
	const addSymbol = useMutation({
		mutationFn: (symbol: string) =>
			requestJson<{ data: WatchlistSymbol }>("/backend/api/symbols", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ symbol }),
			}),
		onSuccess: (response) => {
			setSymbolInput("");
			queryClient.setQueryData<{ data: WatchlistSymbol[] }>(
				["symbols"],
				(current) => ({
					data: [
						...(current?.data ?? []).filter(
							(item) => item.symbol !== response.data.symbol,
						),
						response.data,
					].sort((left, right) => left.symbol.localeCompare(right.symbol)),
				}),
			);
		},
		onError: (error) => toast.error(error.message),
	});
	const removeSymbol = useMutation({
		mutationFn: async (symbol: string) => {
			const response = await fetch(
				`/backend/api/symbols/${encodeURIComponent(symbol)}`,
				{ method: "DELETE" },
			);
			if (!response.ok) throw new Error("Unable to remove symbol.");
		},
		onSuccess: (_response, symbol) => {
			setSelectedId(undefined);
			queryClient.setQueryData<{ data: WatchlistSymbol[] }>(
				["symbols"],
				(current) => ({
					data: (current?.data ?? []).filter((item) => item.symbol !== symbol),
				}),
			);
			queryClient.setQueryData<LifecycleListResponse>(
				["lifecycles"],
				(current) => ({
					...(current ?? EMPTY_LIFECYCLE_RESPONSE),
					data: (current?.data ?? []).filter((item) => item.symbol !== symbol),
				}),
			);
		},
		onError: (error) => toast.error(error.message),
	});
	const lifecycles = lifecycleQuery.data?.data ?? EMPTY_LIFECYCLES;
	const visible = useMemo(
		() =>
			lifecycles.filter((item) => {
				const matchesQuery =
					`${item.symbol} ${item.companyName} ${item.actionType}`
						.toLowerCase()
						.includes(query.toLowerCase());
				const matchesFilter =
					filter === "All" ||
					(filter === "Updated today" &&
						item.updatedAt.slice(0, 10) ===
							new Date().toISOString().slice(0, 10)) ||
					(filter === "Rights issues" && item.actionType === "Rights Issue") ||
					(filter === "Bonus issues" && item.actionType === "Bonus Issue") ||
					(filter === "Needs review" && item.state === "needs_review");
				return matchesQuery && matchesFilter;
			}),
		[filter, lifecycles, query],
	);
	const selected =
		lifecycles.find((item) => item.id === selectedId) ?? lifecycles[0];
	const stream = lifecycleQuery.data?.stream ?? "disconnected";
	useEffect(() => {
		const toastId = "drishti-key-required";
		if (stream === "not_configured") {
			toast.error("Drishti key required", { id: toastId });
			return;
		}
		toast.dismiss(toastId);
	}, [stream]);
	function submitSymbol(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const value = symbolInput.trim();
		if (value) addSymbol.mutate(value);
	}

	return (
		<main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-5 py-10 sm:px-8 sm:py-14">
			<DashboardHeader
				addPending={addSymbol.isPending}
				fullMarketTracking={fullMarketTracking}
				onAdd={submitSymbol}
				onFullMarketTrackingChange={setFullMarketTrackingPreference}
				onRemove={removeSymbol.mutate}
				onSymbolInputChange={setSymbolInput}
				symbolInput={symbolInput}
				symbols={symbolsQuery.data?.data ?? []}
			/>
			<FilterControls
				filter={filter}
				onFilterChange={setFilter}
				onQueryChange={setQuery}
				query={query}
			/>
			<LifecycleActivity
				isLoading={!socketReady && !lifecycleQuery.data}
				lifecycles={lifecycles}
				onSelect={setSelectedId}
				selected={selected}
				visible={visible}
			/>

			{selected ? (
				<div className="mt-5">
					<DetailPanel lifecycle={selected} />
				</div>
			) : null}
		</main>
	);
}
