"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, ExternalLink, Pause, Play, Plus, Printer, Square, Tv } from "lucide-react";

import { Badge, Button } from "@/components/ui";
import type { RoundTimerControls } from "@/lib/supabase/useRoundTimer";
import { cn } from "@/lib/utils";

/**
 * The round, in one bar, at the top of the screen.
 *
 * Sticky, so it is there whichever board somebody has scrolled to. It answers the questions a
 * director is asked all day — which round, is it running, how long is left, how many scores
 * are in — and offers exactly the buttons that make sense right now. Before the round starts
 * there is one button. While it runs there are three. When it ends there is one again.
 *
 * Under rolling entry, START does not close the door. It starts the clock and fixes the
 * matches already on the wall. END is what closes the door: after it, nobody joins this round.
 */
export function RoundControlBar({
  eventName,
  eventSlug,
  round,
  totalRounds,
  timer,
  roundMinutes,
  playersInRound,
  matches,
  recorded,
  outstanding,
  waiting,
  by,
  nextRoundHref,
  onFinalize,
  finalizing,
}: {
  eventName: string;
  /** Pins the TV to this event. Without it the wall guesses which tournament is running. */
  eventSlug: string;
  round: number;
  totalRounds: number;
  timer: RoundTimerControls;
  roundMinutes: number;
  playersInRound: number;
  matches: number;
  recorded: number;
  outstanding: number;
  /** Checked in, eligible, and on no board. */
  waiting: number;
  by: string;
  /** Where "Generate round N+1" goes. */
  nextRoundHref: string;
  onFinalize?: () => void;
  finalizing?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  /*
   * Pinned by slug. The wall's own guess is "the most recently touched live event", which the
   * night before an event is whichever old tournament was never closed. A link that names
   * the event cannot show the wrong one.
   */
  const tvPath = eventSlug ? `/live/pairings?event=${encodeURIComponent(eventSlug)}` : "/live/pairings";
  const tvUrl = origin ? `${origin}${tvPath}` : tvPath;

  const copyTv = () => {
    void navigator.clipboard?.writeText(tvUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const live = timer.phase === "running";
  const paused = timer.phase === "paused";
  const ended = timer.phase === "finished";
  const notStarted = timer.phase === "not-started";
  const allIn = outstanding === 0 && matches > 0;

  const status = live
    ? "LIVE"
    : paused
      ? "PAUSED"
      : ended
        ? allIn
          ? "COMPLETE"
          : "ENDED"
        : "READY";

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-[rgb(var(--c-surface))]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {/* Row 1: where we are. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            {eventName}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[20px] font-extrabold leading-tight text-ink">
              Round {round}
              <span className="text-[14px] font-semibold text-muted"> of {totalRounds}</span>
            </h2>
            <Badge tone={live ? "critical" : allIn ? "success" : paused ? "warning" : "neutral"}>{status}</Badge>
          </div>
        </div>

        <div className="text-right">
          <p
            className={cn(
              "num text-[28px] font-extrabold leading-none tabular-nums",
              live ? "text-ink" : "text-muted",
            )}
          >
            {timer.clock}
          </p>
          <p className="text-[11px] text-muted">{live ? "remaining" : paused ? "paused" : ended ? "ended" : "not started"}</p>
        </div>
      </div>

      {/* Row 2: the counts a director is asked for. */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-muted">
        <span><span className="num font-semibold text-ink">{playersInRound}</span> playing</span>
        <span><span className="num font-semibold text-ink">{matches}</span> match{matches === 1 ? "" : "es"}</span>
        <span>
          <span className="num font-semibold text-ink">{recorded}</span> / {matches} results in
        </span>
        {waiting > 0 ? (
          <span className="font-semibold text-warning-700">
            <span className="num">{waiting}</span> waiting for an opponent
          </span>
        ) : null}
      </div>

      {/* Row 3: the buttons that make sense right now, and nothing else. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {notStarted ? (
          <Button
            variant="primary"
            icon={<Play className="size-4" />}
            onClick={() => void timer.start(roundMinutes)}
            className="flex-1 sm:flex-none"
          >
            Start round {round}
          </Button>
        ) : null}

        {live ? (
          <>
            <Button variant="secondary" icon={<Pause className="size-4" />} onClick={() => void timer.pause()}>
              Pause
            </Button>
            <Button
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() => void timer.extend(5, "Extended from Results", by)}
            >
              5 min
            </Button>
            <Button
              variant="primary"
              icon={<Square className="size-4" />}
              onClick={() => {
                /*
                 * Ending the round closes the door to late arrivals and is the one control
                 * here that cannot be undone by pressing something else. Asked, once.
                 */
                if (window.confirm(`End round ${round}? Nobody else can join it after this.`)) {
                  void timer.end();
                }
              }}
              className="ml-auto"
            >
              End round {round}
            </Button>
          </>
        ) : null}

        {paused ? (
          <Button variant="primary" icon={<Play className="size-4" />} onClick={() => void timer.resume()}>
            Resume
          </Button>
        ) : null}

        {ended && !allIn ? (
          <Button
            variant="primary"
            onClick={() => document.getElementById("first-missing")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            Enter {outstanding} missing result{outstanding === 1 ? "" : "s"}
          </Button>
        ) : null}

        {ended && allIn ? (
          <>
            {onFinalize ? (
              <Button variant="primary" disabled={finalizing} onClick={onFinalize}>
                {finalizing ? "Finalising…" : `Finalise round ${round}`}
              </Button>
            ) : null}
            {round < totalRounds ? (
              <Link href={nextRoundHref}>
                <Button variant="secondary">Generate round {round + 1}</Button>
              </Link>
            ) : null}
          </>
        ) : null}

        {/* Always there, never in the way. */}
        <span className="ml-auto flex items-center gap-1.5">
          <Link href="/app/results/print">
            <Button variant="ghost" size="sm" icon={<Printer className="size-3.5" />} aria-label="Print pairings">
              <span className="hidden sm:inline">Print</span>
            </Button>
          </Link>
          <a href={tvUrl} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm" icon={<Tv className="size-3.5" />} aria-label="Open TV display">
              <span className="hidden sm:inline">TV</span>
              <ExternalLink className="ml-1 size-3 opacity-60" />
            </Button>
          </a>
          <Button variant="ghost" size="sm" icon={<Copy className="size-3.5" />} onClick={copyTv} aria-label="Copy TV link">
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
          </Button>
        </span>
      </div>

      {timer.error ? (
        <p className="mt-2 rounded-control bg-critical-050 px-3 py-2 text-[12.5px] text-critical">{timer.error}</p>
      ) : null}
    </div>
  );
}
