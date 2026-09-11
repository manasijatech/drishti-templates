import Image from "next/image";

import { CorporateActionDashboard } from "@/components/corporate-action-dashboard";

export function AppShell() {
	return (
		<div className="flex min-h-svh w-full flex-col bg-panel">
			<header className="border-b border-hairline">
				<div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between px-5 sm:px-8">
					<div className="flex items-center gap-2.5 text-ink">
						<Image src="/logo.svg" alt="" width={28} height={20} priority />
						<div>
							<p className="text-[13px] font-medium leading-none">Drishti</p>
							<p className="mt-1 text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
								Corporate action lifecycles
							</p>
						</div>
					</div>
					<a
						href="https://github.com/manasijatech/drishti-templates/tree/main/corporate-action-lifecycle-monitor"
						target="_blank"
						rel="noreferrer"
						className="text-[11px] font-medium text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
					>
						View source
					</a>
				</div>
			</header>
			<CorporateActionDashboard />
		</div>
	);
}
