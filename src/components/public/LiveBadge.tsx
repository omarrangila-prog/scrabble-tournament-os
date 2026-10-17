"use client";

import { cn } from "@/lib/utils";

/**
 * "LIVE · updated 4s ago".
 *
 * Says LIVE only while the last read actually worked and is recent — see `useLiveData`. A badge
 * that stays green on a page that has quietly stopped updating is worse than none, because
 * somebody at a table is reading it to decide whether to walk to the desk.
 */
export function LiveBadge({
  live,
  loaded,
  secondsAgo,
  className,
}: {
  live: boolean;
  loaded: boolean;
  secondsAgo: number | null;
  className?: string;
}) {
  const ago =
    secondsAgo === null
      ? ""
      : secondsAgo < 5
        ? "just now"
        : secondsAgo < 60
          ? `${secondsAgo}s ago`
          : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <span
      className={cn("inline-flex items-center gap-2 text-[12.5px] font-semibold", className)}
      role="status"
      aria-live="off"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold tracking-wide",
          !loaded
            ? "bg-[rgb(var(--c-line))] text-muted"
            : live
              ? "bg-success-050 text-[#12855c]"
              : "bg-warning-050 text-[#a76d16]",
        )}
      >
        <span className={cn("size-1.5 rounded-full bg-current", live && loaded && "pulse-dot")} />
        {!loaded ? "CONNECTING" : live ? "LIVE" : "RECONNECTING"}
      </span>
      {ago ? <span className="text-muted">Updated {ago}</span> : null}
    </span>
  );
}
