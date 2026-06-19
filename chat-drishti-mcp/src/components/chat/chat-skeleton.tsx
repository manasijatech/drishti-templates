import { DrishtiLoader } from "~/components/brand/drishti-loader";
import { DrishtiLogoMark, DrishtiChatWordMark } from "~/components/brand/drishti-logo";
import { Skeleton } from "~/components/ui/skeleton";

const SIDEBAR_GROUPS = ["pinned", "today", "earlier"].map((label, groupIdx) => ({
	label,
	rows: Array.from({ length: [3, 4, 2][groupIdx] ?? 3 }).map((_, rowIdx) => ({
		id: `${label}-${rowIdx}`,
		width: `${72 - rowIdx * 9}%`,
	})),
}));

function SidebarSkeleton() {
	return (
		<aside className="hidden w-60 shrink-0 flex-col border-sidebar-border border-r bg-sidebar lg:flex">
			<div className="flex items-center justify-between border-sidebar-border border-b px-3 py-3">
				<div className="flex items-center gap-2 opacity-80">
					<DrishtiLogoMark size={24} />
					<DrishtiChatWordMark height={17} />
				</div>
				<Skeleton className="size-7 rounded-md" />
			</div>

			<div className="space-y-2 px-2 pt-2">
				<Skeleton className="h-8 w-full rounded-md" />
				<Skeleton className="h-8 w-full rounded-md" />
			</div>

			<div className="min-h-0 flex-1 space-y-5 px-2 pt-5">
				{SIDEBAR_GROUPS.map((group) => (
					<div className="space-y-2" key={group.label}>
						<Skeleton className="ml-1 h-2.5 w-16 rounded-full opacity-70" />
						{group.rows.map((row) => (
							<div className="flex items-center gap-2 px-1 py-1" key={row.id}>
								<Skeleton className="size-3.5 shrink-0 rounded-full" />
								<div className="min-w-0 flex-1 space-y-1.5">
									<Skeleton
										className="h-2.5 rounded-full"
										style={{ width: row.width }}
									/>
									<Skeleton className="h-2 w-12 rounded-full opacity-60" />
								</div>
							</div>
						))}
					</div>
				))}
			</div>
		</aside>
	);
}

export function ChatShellSkeleton() {
	return (
		<div className="flex h-screen flex-col" data-slot="chat-skeleton">
			<div className="flex flex-1 overflow-hidden">
				<SidebarSkeleton />
				<div className="flex min-h-0 flex-1 flex-col bg-background">
					<div className="flex items-center gap-2 border-border border-b px-3 py-2 lg:hidden">
						<Skeleton className="h-8 w-20 rounded-md" />
						<Skeleton className="h-8 w-24 rounded-md" />
					</div>
					<DrishtiLoader fullscreen />
				</div>
			</div>
			<footer className="border-border border-t bg-card px-4 py-2.5">
				<Skeleton className="mx-auto h-2.5 w-2/3 max-w-md rounded-full opacity-70" />
			</footer>
		</div>
	);
}
