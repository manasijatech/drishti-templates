import { cn } from "../utils/cn";

export function ModelReadonlyBadge({
	label,
	className,
}: {
	label: string;
	className?: string;
}) {
	return (
		<span
			aria-label={`Active model: ${label}`}
			className={cn(
				"inline-flex h-6 max-w-[10rem] shrink-0 items-center truncate px-1 text-an-foreground-muted text-xs select-none",
				className,
			)}
		>
			{label}
		</span>
	);
}
