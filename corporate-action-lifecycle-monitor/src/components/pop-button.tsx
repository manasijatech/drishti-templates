import { Slot } from "radix-ui";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type PopButtonColor =
	| "default"
	| "blue"
	| "purple"
	| "pink"
	| "red"
	| "orange"
	| "yellow"
	| "green"
	| "teal"
	| "cyan"
	| "indigo"
	| "violet"
	| "rose"
	| "amber"
	| "lime"
	| "sky"
	| "slate"
	| "gray"
	| "zinc"
	| "neutral"
	| "stone"
	| "fuchsia"
	| "emerald";

type PopButtonSize = "sm" | "default" | "lg";

export type PopButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	color?: PopButtonColor;
	size?: PopButtonSize;
	children: ReactNode;
	asChild?: boolean;
};

const colors: Record<PopButtonColor, string> = {
	default:
		"border-neutral-300 bg-white text-neutral-900 hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
	blue: "border-blue-800 bg-blue-500 text-white hover:bg-blue-600",
	purple: "border-purple-800 bg-purple-500 text-white hover:bg-purple-600",
	pink: "border-pink-800 bg-pink-500 text-white hover:bg-pink-600",
	red: "border-red-800 bg-red-500 text-white hover:bg-red-600",
	orange: "border-orange-800 bg-orange-500 text-white hover:bg-orange-600",
	yellow: "border-yellow-800 bg-yellow-500 text-white hover:bg-yellow-600",
	green: "border-green-800 bg-green-500 text-white hover:bg-green-600",
	teal: "border-teal-800 bg-teal-500 text-white hover:bg-teal-600",
	cyan: "border-cyan-800 bg-cyan-500 text-white hover:bg-cyan-600",
	indigo: "border-indigo-800 bg-indigo-500 text-white hover:bg-indigo-600",
	violet: "border-violet-800 bg-violet-500 text-white hover:bg-violet-600",
	rose: "border-rose-800 bg-rose-500 text-white hover:bg-rose-600",
	amber: "border-amber-800 bg-amber-500 text-white hover:bg-amber-600",
	lime: "border-lime-800 bg-lime-500 text-white hover:bg-lime-600",
	sky: "border-sky-800 bg-sky-500 text-white hover:bg-sky-600",
	slate: "border-slate-800 bg-slate-500 text-white hover:bg-slate-600",
	gray: "border-gray-800 bg-gray-500 text-white hover:bg-gray-600",
	zinc: "border-zinc-800 bg-zinc-500 text-white hover:bg-zinc-600",
	neutral: "border-neutral-800 bg-neutral-500 text-white hover:bg-neutral-600",
	stone: "border-stone-800 bg-stone-500 text-white hover:bg-stone-600",
	fuchsia: "border-fuchsia-800 bg-fuchsia-500 text-white hover:bg-fuchsia-600",
	emerald: "border-emerald-800 bg-emerald-500 text-white hover:bg-emerald-600",
};

const sizes: Record<PopButtonSize, string> = {
	sm: "h-9 px-2 py-1 text-sm",
	default: "h-10 px-4 py-2",
	lg: "h-14 px-8 py-3 text-lg",
};

export const PopButton = forwardRef<HTMLButtonElement, PopButtonProps>(
	(
		{
			className,
			color = "default",
			size = "default",
			children,
			asChild = false,
			...props
		},
		ref,
	) => {
		const Component = asChild ? Slot.Root : "button";

		return (
			<Component
				ref={ref}
				data-slot="pop-button"
				className={cn(
					"font-pop inline-flex origin-bottom select-none items-center justify-center whitespace-nowrap rounded-xl border-x-2 border-t-2 border-b-4 text-primary-foreground ring-offset-background transition-all active:scale-y-95 active:border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
					colors[color],
					sizes[size],
					className,
				)}
				{...props}
			>
				{children}
			</Component>
		);
	},
);

PopButton.displayName = "PopButton";
