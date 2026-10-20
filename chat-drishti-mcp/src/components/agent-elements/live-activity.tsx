import { memo, useEffect, useState } from "react";
import { SpiralLoader } from "./spiral-loader";
import { TextShimmer } from "./text-shimmer";

/** After this long, reassure the user that the agent is still working. */
const SLOW_AFTER_SECONDS = 25;

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export type LiveActivityProps = {
  label: string;
  detail?: string;
  startedAt: number;
};

/**
 * Always-visible "what is happening now" line while the agent works, with an
 * elapsed timer so a long run never looks frozen.
 */
export const LiveActivity = memo(function LiveActivity({
  label,
  detail,
  startedAt,
}: LiveActivityProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div aria-live="polite" className="an-step-in flex flex-col gap-1" role="status">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="flex size-4 shrink-0 items-center justify-center">
          <SpiralLoader size={14} />
        </span>
        <TextShimmer as="span" className="shrink-0 font-[450]" duration={1.4}>
          {label}
        </TextShimmer>
        {detail ? (
          <span className="min-w-0 truncate text-muted-foreground/70">
            {detail}
          </span>
        ) : null}
        <span
          aria-hidden
          className="shrink-0 text-muted-foreground/60 text-xs tabular-nums"
        >
          {formatElapsed(elapsed)}
        </span>
      </div>
      {elapsed >= SLOW_AFTER_SECONDS ? (
        <p className="an-step-in pl-6 text-muted-foreground/70 text-xs">
          Still working. Big questions can take up to a minute.
        </p>
      ) : null}
    </div>
  );
});
