"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
};

export function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  style,
  ...props
}: InputProps): React.ReactElement {
	const inputClassName = cn(
		unstyled
			? "h-full w-full min-w-0 flex-1 rounded-[inherit] bg-transparent px-3 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
			: "h-10 w-full min-w-0 rounded-[10px] border-2 border-hairline bg-sub px-3 py-1 text-[13px] text-ink shadow-[inset_0_1px_2px_rgba(28,25,23,0.07)] outline-none transition-[background-color,border-color,box-shadow] duration-150 selection:bg-accent-soft placeholder:text-ink-3 focus-visible:border-interior-accent focus-visible:bg-panel focus-visible:shadow-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-panel dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] dark:focus-visible:bg-well aria-invalid:border-destructive",
    size === "sm" &&
      "h-7.5 px-[calc(--spacing(2.5)-1px)] leading-7.5 sm:h-6.5 sm:leading-6.5",
    size === "lg" && "h-9.5 leading-9.5 sm:h-8.5 sm:leading-8.5",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
  );

  return nativeInput ? (
    <input
      className={cn(inputClassName, className)}
      data-size={size}
      data-slot="input"
      size={typeof size === "number" ? size : undefined}
      style={typeof style === "function" ? undefined : style}
      {...props}
    />
  ) : (
    <InputPrimitive
      className={cn(inputClassName, className)}
      data-size={size}
      data-slot="input"
      size={typeof size === "number" ? size : undefined}
      style={style}
      {...props}
    />
  );
}

export { InputPrimitive };
