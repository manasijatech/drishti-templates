import { DrishtiLogoMark, DrishtiWordMark } from "~/components/brand/drishti-logo";
import { cn } from "~/lib/utils";

type DrishtiLoaderProps = {
	label?: string;
	className?: string;
	/** Render full-height centered (e.g. splash) vs inline. */
	fullscreen?: boolean;
};

export function DrishtiLoader({
	label = "Preparing your workspace",
	className,
	fullscreen = false,
}: DrishtiLoaderProps) {
	return (
		<output
			className={cn(
				"flex flex-col items-center justify-center gap-5 text-center",
				fullscreen && "min-h-[60vh] flex-1",
				className,
			)}
		>
			<div className="relative flex items-center justify-center">
				<span
					aria-hidden
					className="drishti-loader-ring absolute size-14 rounded-full bg-primary/15"
				/>
				<span
					aria-hidden
					className="absolute size-20 rounded-full bg-primary/5 blur-xl"
				/>
				<DrishtiLogoMark className="drishti-loader-logo relative" size={40} />
			</div>

			<div className="relative overflow-hidden px-1 py-0.5">
				<DrishtiWordMark className="drishti-loader-wordmark" height={20} />
				<span
					aria-hidden
					className="drishti-loader-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-white/70 to-transparent"
				/>
			</div>

			<div
				aria-hidden
				className="relative h-px w-28 overflow-hidden rounded-full bg-border"
			>
				<span className="drishti-loader-track absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary/70" />
			</div>

			<p className="type-eyebrow text-muted-foreground">{label}</p>
		</output>
	);
}
