"use client";

import * as React from "react";

import { useRoundTimer } from "@/lib/supabase/useRoundTimer";
import { cn } from "@/lib/utils";

/**
 * How long is left in the round, for anybody in the room.
 *
 * The clock used to live in the director's browser, so the only person who could see it
 * was the one who started it. A player at a board had to ask, and the wall display showed
 * nothing. Every screen now derives the countdown from the same recorded instants, so
 * they agree without any of them being in charge.
 *
 * Renders nothing until a clock exists for the round. An empty frame reading 00:00 would
 * be read as "time up" by the one person it matters most to.
 */
export function RoundClock({
  eventId,
  round,
  size = "normal",
  className,
}: {
  eventId: string;
  round: number;
  /** `large` is for the wall; `normal` for a phone. */
  size?: "normal" | "large";
  className?: string;
}) {
  const { timer, phase, clock } = useRoundTimer(eventId, round);

  if (!timer || round <= 0) return null;

  const label =
    phase === "running"
      ? "Time left in this round"
      : phase === "paused"
        ? "Round paused"
        : phase === "finished"
          ? "Round over"
          : "Round not started yet";

  const extended = timer.extensions.reduce((sum, e) => sum + e.minutes, 0);

  return (
    <div
      className={cn(
        "rounded-[14px] px-4 py-3 text-center",
        phase === "running"
          ? "bg-black/[0.04]"
          : phase === "paused"
            ? "bg-warning-050"
            : "bg-black/[0.04]",
        className,
      )}
      /* Read out as a whole, and re-read when it changes, rather than digit by digit. */
      aria-live="polite"
      aria-atomic="true"
    >
      <p
        className={cn(
          "num font-extrabold leading-none tracking-[-0.03em] tabular-nums",
          size === "large" ? "text-[72px] sm:text-[104px]" : "text-[34px]",
          phase === "finished" ? "text-black/45" : "text-black",
        )}
      >
        {clock}
      </p>
      <p
        className={cn(
          "mt-1 font-semibold uppercase tracking-[0.1em] text-black/55",
          size === "large" ? "text-[15px] sm:text-[17px]" : "text-[11.5px]",
        )}
      >
        {label}
      </p>
      {/*
        * An extension is stated, because a player who timed the round themselves would
        * otherwise see a clock that gained time and have no way to know why.
        */}
      {extended > 0 ? (
        <p
          className={cn(
            "mt-1 text-black/50",
            size === "large" ? "text-[13px]" : "text-[11.5px]",
          )}
        >
          Includes {extended} extra {extended === 1 ? "minute" : "minutes"} added by the
          organizers
        </p>
      ) : null}
    </div>
  );
}
