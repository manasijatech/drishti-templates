"use client";

import {
	CaretLeft,
	CaretRight,
	ChatsCircle,
	MagnifyingGlass,
	Plus,
	PushPin,
} from "@phosphor-icons/react";
import { type ReactNode, useMemo, useState } from "react";
import {
	DrishtiChatWordMark,
	DrishtiLogoMark,
} from "~/components/brand/drishti-logo";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet";
import {
	DEMO_PROMPT_GROUPS,
	DEMO_PROMPTS,
	type DemoPromptGroup,
	filterSessions,
	formatSessionTime,
	getSessionIconKey,
	groupSessionsByDate,
	SIDEBAR_ICONS,
	type SidebarIconKey,
} from "~/lib/chat-sidebar-utils";
import { cn } from "~/lib/utils";
import type { ChatSession, Portfolio, Watchlist } from "~/types";

type ChatSidebarProps = {
	sessions: ChatSession[];
	activeSessionId: string | null;
	collapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
	onNewChat: () => void;
	onSelectSession: (id: string) => void;
	onTogglePin: (id: string) => void;
	/** Puts the prompt in the message box. It is never sent automatically. */
	onPickPrompt: (prompt: string) => void;
	watchlists: Watchlist[];
	portfolios: Portfolio[];
	/** Mobile drawer (below the lg breakpoint). */
	mobileOpen: boolean;
	onMobileOpenChange: (open: boolean) => void;
};

function SidebarIcon({
	iconKey,
	className,
}: {
	iconKey: SidebarIconKey;
	className?: string;
}) {
	const Icon = SIDEBAR_ICONS[iconKey];
	return <Icon className={cn("size-4 shrink-0", className)} weight="regular" />;
}

function SectionLabel({
	children,
	action,
}: {
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between px-2 pt-4 pb-1">
			<p className="type-eyebrow">{children}</p>
			{action}
		</div>
	);
}

const rowBase =
	"flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring lg:py-1.5";

function SessionRow({
	session,
	active,
	onSelect,
	onTogglePin,
}: {
	session: ChatSession;
	active: boolean;
	onSelect: () => void;
	onTogglePin: () => void;
}) {
	return (
		<div className="group relative">
			<button
				aria-current={active ? "page" : undefined}
				className={cn(
					rowBase,
					"items-start pr-9",
					active
						? "bg-sidebar-accent text-sidebar-accent-foreground"
						: "text-sidebar-foreground hover:bg-sidebar-accent/60",
				)}
				onClick={onSelect}
				type="button"
			>
				<SidebarIcon
					className={cn(
						"mt-0.5",
						active ? "text-sidebar-accent-foreground" : "text-muted-foreground",
					)}
					iconKey={getSessionIconKey(session.title)}
				/>
				<span className="min-w-0 flex-1">
					<span className="block truncate leading-snug">{session.title}</span>
					<span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
						{formatSessionTime(session.updatedAt)}
					</span>
				</span>
			</button>
			<button
				aria-label={session.pinned ? "Unpin chat" : "Pin chat"}
				className={cn(
					"absolute top-1.5 right-1.5 rounded-md p-1.5 text-muted-foreground transition-opacity hover:bg-sidebar-accent hover:text-foreground",
					session.pinned
						? "text-primary opacity-100"
						: "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
				)}
				onClick={(e) => {
					e.stopPropagation();
					onTogglePin();
				}}
				title={session.pinned ? "Unpin chat" : "Pin chat"}
				type="button"
			>
				<PushPin
					className="size-3.5"
					weight={session.pinned ? "fill" : "regular"}
				/>
			</button>
		</div>
	);
}

function PromptRow({
	iconKey,
	label,
	prompt,
	onPick,
}: {
	iconKey: SidebarIconKey;
	label: string;
	prompt: string;
	onPick: () => void;
}) {
	return (
		<button
			className={cn(
				rowBase,
				"group text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
			)}
			onClick={onPick}
			title={prompt}
			type="button"
		>
			<SidebarIcon
				className="text-muted-foreground group-hover:text-primary"
				iconKey={iconKey}
			/>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<span className="hidden shrink-0 text-[11px] text-muted-foreground lg:inline lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
				Insert
			</span>
		</button>
	);
}

function PromptGroup({
	group,
	defaultOpen,
	onPick,
}: {
	group: DemoPromptGroup;
	defaultOpen: boolean;
	onPick: (prompt: string) => void;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const items = DEMO_PROMPTS.filter((item) => item.group === group);
	return (
		<div>
			<button
				aria-expanded={open}
				className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-medium text-[12px] text-sidebar-foreground/90 hover:bg-sidebar-accent/40"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<CaretRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform duration-200",
						open && "rotate-90",
					)}
					weight="bold"
				/>
				<span className="flex-1">{group}</span>
				<span className="text-[11px] text-muted-foreground">
					{items.length}
				</span>
			</button>
			{open ? (
				<div className="an-step-in pb-1 pl-2">
					{items.map((item) => (
						<PromptRow
							iconKey={item.icon}
							key={item.label}
							label={item.label}
							onPick={() => onPick(item.prompt)}
							prompt={item.prompt}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

/** Full sidebar content, shared by the desktop sidebar and the mobile drawer. */
function SidebarBody({
	sessions,
	activeSessionId,
	onNewChat,
	onSelectSession,
	onTogglePin,
	onPickPrompt,
	watchlists,
	portfolios,
}: Omit<
	ChatSidebarProps,
	"collapsed" | "onCollapsedChange" | "mobileOpen" | "onMobileOpenChange"
>) {
	const [searchQuery, setSearchQuery] = useState("");

	const filteredSessions = useMemo(
		() => filterSessions(sessions, searchQuery),
		[sessions, searchQuery],
	);
	const pinnedSessions = useMemo(
		() =>
			filteredSessions
				.filter((s) => s.pinned)
				.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
				),
		[filteredSessions],
	);
	const groupedSessions = useMemo(
		() => groupSessionsByDate(filteredSessions),
		[filteredSessions],
	);

	const myStocks = useMemo(() => {
		const items: { icon: SidebarIconKey; label: string; prompt: string }[] = [];
		for (const portfolio of portfolios.slice(0, 3)) {
			items.push({
				icon: "briefcase",
				label: portfolio.name,
				prompt: `Brief me on my portfolio "${portfolio.name}": what changed in filings, news, results, block deals and prices?`,
			});
		}
		for (const watchlist of watchlists.slice(0, 4 - items.length)) {
			items.push({
				icon: "watchlist",
				label: watchlist.name,
				prompt: `Brief me on my watchlist "${watchlist.name}" (${watchlist.symbols.join(", ")}): what changed in filings, news, results, block deals and prices?`,
			});
		}
		return items;
	}, [portfolios, watchlists]);

	const hasChats = sessions.length > 0;

	return (
		<>
			<div className="space-y-2 px-2 pt-2">
				<Button
					className="h-9 w-full justify-start gap-2 text-[13px] lg:h-8"
					onClick={onNewChat}
					size="sm"
					variant="outline"
				>
					<Plus className="size-4" weight="regular" />
					New chat
				</Button>
				{hasChats ? (
					<div className="relative">
						<MagnifyingGlass
							className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
							weight="regular"
						/>
						<Input
							aria-label="Search chats"
							className="h-9 border-transparent bg-background/50 pl-8 text-base shadow-none focus-visible:border-border sm:text-xs lg:h-8"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search chats"
							value={searchQuery}
						/>
					</div>
				) : null}
			</div>

			<ScrollArea className="min-h-0 flex-1 px-2 pb-4">
				{pinnedSessions.length > 0 ? (
					<div>
						<SectionLabel>Pinned</SectionLabel>
						{pinnedSessions.map((session) => (
							<SessionRow
								active={session.id === activeSessionId}
								key={session.id}
								onSelect={() => onSelectSession(session.id)}
								onTogglePin={() => onTogglePin(session.id)}
								session={session}
							/>
						))}
					</div>
				) : null}

				{groupedSessions.map((group) => (
					<div key={group.label}>
						<SectionLabel>{group.label}</SectionLabel>
						{group.sessions.map((session) => (
							<SessionRow
								active={session.id === activeSessionId}
								key={session.id}
								onSelect={() => onSelectSession(session.id)}
								onTogglePin={() => onTogglePin(session.id)}
								session={session}
							/>
						))}
					</div>
				))}

				{searchQuery && filteredSessions.length === 0 ? (
					<p className="px-2 py-6 text-center text-muted-foreground text-xs">
						No chats match &ldquo;{searchQuery}&rdquo;
					</p>
				) : null}

				{!hasChats ? (
					<div className="mx-1 mt-3 flex items-center gap-2.5 rounded-lg bg-sidebar-accent/40 px-3 py-2.5 text-muted-foreground text-xs">
						<ChatsCircle className="size-4 shrink-0" />
						Your chats will show here.
					</div>
				) : null}

				{!searchQuery && myStocks.length > 0 ? (
					<div>
						<SectionLabel>My stocks</SectionLabel>
						{myStocks.map((item) => (
							<PromptRow
								iconKey={item.icon}
								key={item.label}
								label={item.label}
								onPick={() => onPickPrompt(item.prompt)}
								prompt={item.prompt}
							/>
						))}
					</div>
				) : null}

				{!searchQuery ? (
					<div>
						<SectionLabel
							action={
								<span className="text-[10px] text-muted-foreground">
									Adds to the message box
								</span>
							}
						>
							Prompt library
						</SectionLabel>
						{DEMO_PROMPT_GROUPS.map((group, index) => (
							<PromptGroup
								defaultOpen={index === 0}
								group={group}
								key={group}
								onPick={onPickPrompt}
							/>
						))}
					</div>
				) : null}
			</ScrollArea>
		</>
	);
}

export function ChatSidebar({
	collapsed,
	onCollapsedChange,
	mobileOpen,
	onMobileOpenChange,
	...bodyProps
}: ChatSidebarProps) {
	const { sessions, activeSessionId, onNewChat, onSelectSession } = bodyProps;

	const recent = useMemo(
		() =>
			[...sessions]
				.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
				)
				.slice(0, 8),
		[sessions],
	);

	// In the mobile drawer, every action also closes the drawer.
	const closeAfter =
		<T extends unknown[]>(fn: (...args: T) => void) =>
		(...args: T) => {
			fn(...args);
			onMobileOpenChange(false);
		};

	return (
		<>
			<aside
				className={cn(
					"hidden shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
					collapsed ? "w-[3.25rem]" : "w-64",
				)}
			>
				<div
					className={cn(
						"flex border-sidebar-border border-b",
						collapsed
							? "flex-col items-center gap-1 px-2 py-3"
							: "items-center justify-between px-3 py-3",
					)}
				>
					<div
						className={cn(
							"flex items-center gap-2",
							collapsed && "justify-center",
						)}
					>
						<DrishtiLogoMark size={collapsed ? 22 : 24} />
						{!collapsed && <DrishtiChatWordMark height={17} />}
					</div>
					<Button
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						className="size-7 shrink-0 text-muted-foreground"
						onClick={() => onCollapsedChange(!collapsed)}
						size="icon"
						title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						variant="ghost"
					>
						{collapsed ? (
							<CaretRight className="size-4" />
						) : (
							<CaretLeft className="size-4" />
						)}
					</Button>
				</div>

				{collapsed ? (
					<div className="flex flex-col items-center gap-1 px-1.5 pt-2">
						<Button
							aria-label="New chat"
							className="size-9"
							onClick={onNewChat}
							size="icon"
							title="New chat"
							variant="outline"
						>
							<Plus className="size-4" />
						</Button>
						<div className="my-1 h-px w-6 bg-sidebar-border" />
						{recent.map((session) => (
							<button
								aria-label={session.title}
								className={cn(
									"flex size-9 items-center justify-center rounded-lg transition-colors",
									session.id === activeSessionId
										? "bg-sidebar-accent text-sidebar-accent-foreground"
										: "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
								)}
								key={session.id}
								onClick={() => onSelectSession(session.id)}
								title={session.title}
								type="button"
							>
								<SidebarIcon iconKey={getSessionIconKey(session.title)} />
							</button>
						))}
					</div>
				) : (
					<SidebarBody {...bodyProps} />
				)}
			</aside>

			<Sheet onOpenChange={onMobileOpenChange} open={mobileOpen}>
				<SheetContent
					className="w-[86vw] max-w-xs gap-0 bg-sidebar p-0 text-sidebar-foreground lg:hidden"
					side="left"
				>
					<div className="flex items-center gap-2 border-sidebar-border border-b px-4 py-3.5">
						<DrishtiLogoMark size={24} />
						<SheetTitle className="sr-only">Menu</SheetTitle>
						<DrishtiChatWordMark height={17} />
					</div>
					<SidebarBody
						{...bodyProps}
						onNewChat={closeAfter(bodyProps.onNewChat)}
						onPickPrompt={closeAfter(bodyProps.onPickPrompt)}
						onSelectSession={closeAfter(bodyProps.onSelectSession)}
					/>
				</SheetContent>
			</Sheet>
		</>
	);
}
