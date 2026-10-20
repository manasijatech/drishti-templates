import { type ReactNode, useState } from "react";
import {
  IconAlertTriangle,
  IconChevronRight,
  IconCircleCheckFilled,
} from "@tabler/icons-react";
import { cn } from "../utils/cn";

/** Steps shown under the header while the agent is still working. */
const LIVE_PREVIEW_COUNT = 4;

export type ResearchStepsProps = {
  steps: { key: string; node: ReactNode; failed: boolean }[];
  isRunning: boolean;
};

/**
 * Groups a run of tool calls into one row: "Researching · 6 steps so far"
 * while running, then "Researched in 14 steps" (expandable) when done.
 */
export function ResearchSteps({ steps, isRunning }: ResearchStepsProps) {
  const [open, setOpen] = useState(false);
  const count = steps.length;
  const failed = steps.filter((s) => s.failed).length;
  const hidden = isRunning && !open ? Math.max(0, count - LIVE_PREVIEW_COUNT) : 0;
  const visible = open || isRunning ? steps.slice(hidden) : [];

  const label = isRunning
    ? `Researching · ${count} ${count === 1 ? "step" : "steps"} so far`
    : `Researched in ${count} ${count === 1 ? "step" : "steps"}`;

  return (
    <div className="an-research-steps flex flex-col gap-1.5">
      <button
        aria-expanded={open}
        className="group flex w-fit max-w-full items-center gap-2 rounded-md text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {isRunning ? (
          <span aria-hidden className="an-pulse-dot size-2 shrink-0 rounded-full bg-primary" />
        ) : (
          <IconCircleCheckFilled
            aria-hidden
            className="an-pop size-4 shrink-0 text-emerald-600"
          />
        )}
        <span className="font-[450]">{label}</span>
        {failed > 0 ? (
          <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
            <IconAlertTriangle className="size-3.5" />
            {failed} failed
          </span>
        ) : null}
        <IconChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200 ease-out",
            open && "rotate-90",
          )}
        />
      </button>

      {visible.length > 0 ? (
        <div className="ml-[3px] flex flex-col gap-1.5 border-border border-l pl-4">
          {hidden > 0 ? (
            <button
              className="w-fit text-left text-muted-foreground/70 text-xs hover:text-foreground"
              onClick={() => setOpen(true)}
              type="button"
            >
              + {hidden} earlier {hidden === 1 ? "step" : "steps"}
            </button>
          ) : null}
          {visible.map((step) => (
            <div className="an-step-in" key={step.key}>
              {step.node}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
