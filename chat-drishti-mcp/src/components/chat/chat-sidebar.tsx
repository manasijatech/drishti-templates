"use client";

import {
	CaretLeft,
	CaretRight,
	MagnifyingGlass,
	Plus,
	PushPin,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DrishtiLogoMark, DrishtiChatWordMark } from "~/components/brand/drishti-logo";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
	filterSessions,
	formatSessionTime,
	getSessionIconKey,
	groupSessionsByDate,
	SIDEBAR_ICONS,
	SIDEBAR_SUGGESTIONS,
	SIDEBAR_TOOL_SHORTCUTS,
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
	onSendPrompt: (prompt: string) => void;
	watchlists: Watchlist[];
	portfolios: Portfolio[];
	showSuggestions?: boolean;
	className?: string;
};

function SidebarIcon({
	iconKey,
	className,
}: {
	iconKey: SidebarIconKey;
	className?: string;
}) {
	const Icon = SIDEBAR_ICONS[iconKey];
	return <Icon className={cn("size-3.5 shrink-0", className)} weight="regular" />;
}

function SidebarSectionLabel({
	children,
	collapsed,
}: {
	children: React.ReactNode;
	collapsed: boolean;
}) {
	if (collapsed) return null;
	return (
		<p className="type-eyebrow mb-1 px-2 pt-3 first:pt-1">{children}</p>
	);
}

function SessionRow({
	session,
	active,
	collapsed,
	onSelect,
	onTogglePin,
}: {
	session: ChatSession;
	active: boolean;
	collapsed: boolean;
	onSelect: () => void;
	onTogglePin: () => void;
}) {
	const iconKey = getSessionIconKey(session.title);

	if (collapsed) {
		return (
			<button
				className={cn(
					"flex size-8 items-center justify-center rounded-md transition-colors",
					active
						? "bg-sidebar-accent text-sidebar-accent-foreground"
						: "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
				)}
				onClick={onSelect}
				title={session.title}
				type="button"
			>
				<SidebarIcon iconKey={iconKey} />
			</button>
		);
	}

	return (
		<div className="group relative">
			<button
				className={cn(
					"mb-0.5 flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
					active
						? "bg-sidebar-accent text-sidebar-accent-foreground"
						: "text-sidebar-foreground hover:bg-sidebar-accent/70",
				)}
				onClick={onSelect}
				type="button"
			>
				<SidebarIcon
					className={active ? "text-sidebar-accent-foreground" : "text-muted-foreground"}
					iconKey={iconKey}
				/>
				<div className="min-w-0 flex-1 pr-5">
					<p className="truncate text-[13px] leading-snug">{session.title}</p>
					<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
						{formatSessionTime(session.updatedAt)}
					</p>
				</div>
			</button>
			<button
				className={cn(
					"absolute top-1.5 right-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100",
					session.pinned && "text-primary opacity-100",
				)}
				onClick={(e) => {
					e.stopPropagation();
					onTogglePin();
				}}
				title={session.pinned ? "Unpin chat" : "Pin chat"}
				type="button"
			>
				<PushPin className="size-3.5" weight={session.pinned ? "fill" : "regular"} />
			</button>
		</div>
	);
}

function PromptRow({
	iconKey,
	label,
	collapsed,
	onClick,
}: {
	iconKey: SidebarIconKey;
	label: string;
	collapsed: boolean;
	onClick: () => void;
}) {
	if (collapsed) {
		return (
			<button
				className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
				onClick={onClick}
				title={label}
				type="button"
			>
				<SidebarIcon iconKey={iconKey} />
			</button>
		);
	}

	return (
		<button
			className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/70"
			onClick={onClick}
			type="button"
		>
			<SidebarIcon className="text-muted-foreground" iconKey={iconKey} />
			<span className="line-clamp-2 leading-snug">{label}</span>
		</button>
	);
}

export function ChatSidebar({
	sessions,
	activeSessionId,
	collapsed,
	onCollapsedChange,
	onNewChat,
	onSelectSession,
	onTogglePin,
	onSendPrompt,
	watchlists,
	portfolios,
	showSuggestions = false,
	className,
}: ChatSidebarProps) {
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

	const recentCollapsed = useMemo(() => {
		return [...sessions]
			.sort(
				(a, b) =>
					new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			)
			.slice(0, 6);
	}, [sessions]);

	const workspaceItems = useMemo(() => {
		const items: { icon: SidebarIconKey; label: string; prompt: string }[] = [];
		for (const portfolio of portfolios.slice(0, 3)) {
			items.push({
				icon: "briefcase",
				label: portfolio.name,
				prompt: `Analyze my portfolio "${portfolio.name}" holdings, allocation, and risks.`,
			});
		}
		for (const watchlist of watchlists.slice(0, 4 - items.length)) {
			items.push({
				icon: "watchlist",
				label: watchlist.name,
				prompt: `Analyze my watchlist "${watchlist.name}" (${watchlist.symbols.join(", ")}).`,
			});
		}
		return items;
	}, [portfolios, watchlists]);

	return (
		<aside
			className={cn(
				"hidden shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
				collapsed ? "w-[3.25rem]" : "w-60",
				className,
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
				<div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
					<DrishtiLogoMark size={collapsed ? 22 : 24} />
					{!collapsed && <DrishtiChatWordMark height={17} />}
				</div>
				{!collapsed ? (
					<Button
						className="size-7 shrink-0 text-muted-foreground"
						onClick={() => onCollapsedChange(true)}
						size="icon"
						title="Collapse sidebar"
						variant="ghost"
					>
						<CaretLeft className="size-4" weight="regular" />
					</Button>
				) : (
					<Button
						className="size-7 shrink-0 text-muted-foreground"
						onClick={() => onCollapsedChange(false)}
						size="icon"
						title="Expand sidebar"
						variant="ghost"
					>
						<CaretRight className="size-4" weight="regular" />
					</Button>
				)}
			</div>

			<div className={cn("space-y-2 px-2 pt-2", collapsed && "px-1.5")}>
				{collapsed ? (
					<Button
						className="size-8 w-full"
						onClick={onNewChat}
						size="icon"
						title="New chat"
						variant="outline"
					>
						<Plus className="size-4" weight="regular" />
					</Button>
				) : (
					<>
						<Button
							className="h-8 w-full justify-start gap-2 text-[13px]"
							onClick={onNewChat}
							size="sm"
							variant="outline"
						>
							<Plus className="size-3.5" weight="regular" />
							New chat
						</Button>
						<div className="relative">
							<MagnifyingGlass
								className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
								weight="regular"
							/>
							<Input
								className="h-8 border-transparent bg-background/40 pl-8 text-xs shadow-none focus-visible:border-border"
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search conversations"
								value={searchQuery}
							/>
						</div>
					</>
				)}
			</div>

			<ScrollArea className="min-h-0 flex-1 px-2 pb-3">
				{collapsed ? (
					<div className="flex flex-col items-center gap-0.5 pt-2">
						{pinnedSessions.map((session) => (
							<SessionRow
								active={session.id === activeSessionId}
								collapsed
								key={session.id}
								onSelect={() => onSelectSession(session.id)}
								onTogglePin={() => onTogglePin(session.id)}
								session={session}
							/>
						))}
						{recentCollapsed.map((session) => (
							<SessionRow
								active={session.id === activeSessionId}
								collapsed
								key={session.id}
								onSelect={() => onSelectSession(session.id)}
								onTogglePin={() => onTogglePin(session.id)}
								session={session}
							/>
						))}
					</div>
				) : (
					<>
						{pinnedSessions.length > 0 && (
							<div>
								<SidebarSectionLabel collapsed={collapsed}>Pinned</SidebarSectionLabel>
								{pinnedSessions.map((session) => (
									<SessionRow
										active={session.id === activeSessionId}
										collapsed={collapsed}
										key={session.id}
										onSelect={() => onSelectSession(session.id)}
										onTogglePin={() => onTogglePin(session.id)}
										session={session}
									/>
								))}
							</div>
						)}

						{groupedSessions.length > 0 ? (
							groupedSessions.map((group) => (
								<div key={group.label}>
									<SidebarSectionLabel collapsed={collapsed}>
										{group.label}
									</SidebarSectionLabel>
									{group.sessions.map((session) => (
										<SessionRow
											active={session.id === activeSessionId}
											collapsed={collapsed}
											key={session.id}
											onSelect={() => onSelectSession(session.id)}
											onTogglePin={() => onTogglePin(session.id)}
											session={session}
										/>
									))}
								</div>
							))
						) : searchQuery ? (
							<p className="px-2 py-6 text-center text-muted-foreground text-xs">
								No conversations match &ldquo;{searchQuery}&rdquo;
							</p>
						) : null}

						{showSuggestions && !searchQuery && (
							<div>
								<SidebarSectionLabel collapsed={collapsed}>Suggested</SidebarSectionLabel>
								{SIDEBAR_SUGGESTIONS.map((item) => (
									<PromptRow
										collapsed={collapsed}
										iconKey={item.icon}
										key={item.label}
										label={item.label}
										onClick={() => onSendPrompt(item.prompt)}
									/>
								))}
							</div>
						)}

						{workspaceItems.length > 0 && !searchQuery && (
							<div>
								<SidebarSectionLabel collapsed={collapsed}>Watchlists</SidebarSectionLabel>
								{workspaceItems.map((item) => (
									<PromptRow
										collapsed={collapsed}
										iconKey={item.icon}
										key={item.label}
										label={item.label}
										onClick={() => onSendPrompt(item.prompt)}
									/>
								))}
							</div>
						)}

						{!searchQuery && (
							<div>
								<SidebarSectionLabel collapsed={collapsed}>Tools</SidebarSectionLabel>
								{SIDEBAR_TOOL_SHORTCUTS.map((item) => (
									<PromptRow
										collapsed={collapsed}
										iconKey={item.icon}
										key={item.label}
										label={item.label}
										onClick={() => onSendPrompt(item.prompt)}
									/>
								))}
							</div>
						)}
					</>
				)}
			</ScrollArea>
		</aside>
	);
}
