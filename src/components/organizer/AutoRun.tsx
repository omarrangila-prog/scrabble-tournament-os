"use client";

import * as React from "react";
import { Pause, Play, Zap } from "lucide-react";

import { Button } from "@/components/ui";
import type { EventState } from "@/lib/domain/events";
import { cn } from "@/lib/utils";

/**
 * The day, running itself between rounds.
 *
 * The event is a cycle — pair, play, collect results, pair again — and every step of it is
 * decided by facts the system already holds. Nobody needs to watch a screen to know that a
 * round with every result in is a round that is over.
 *
 * What it must not be is silent. An event that rearranges a room with no warning is worse
 * than one that waits, so every automatic action is announced and counted down first, and
 * the countdown can be stopped. Ten seconds is long enough to read the line and press Stop,
 * short enough that a room is not standing about; thirty before a round starts, because
 * people have to find their tables first.
 *
 * A disputed board is not verified, so a disagreement stops the loop by itself — which is
 * exactly what should happen. Nothing here decides a result, a placing or a payment.
 *
 * Its own component so the effect can sit after the page's early return: hooks cannot, and
 * the actions it calls are declared below that point.
 */
export function AutoRun({
  round,
  totalRounds,
  boardsTotal,
  boardsVerified,
  phase,
  onPublish,
  onPhase,
}: {
  round: number;
  totalRounds: number;
  boardsTotal: number;
  boardsVerified: number;
  phase: EventState | null;
  onPublish: () => void | Promise<void>;
  onPhase: (next: EventState) => void | Promise<void>;
}) {
  /*
   * Held in this browser rather than in the database: it is a preference of the device
   * running the day, and two laptops both auto-running would race each other.
   */
  const [on, setOn] = React.useState(true);
  /*
   * The countdown is held as a number of seconds and decremented, rather than as an end
   * time compared against the clock while rendering. Reading `Date.now()` during render
   * makes the component impure — two renders in the same frame can disagree — and this one
   * re-renders every half second by design.
   */
  const [pending, setPending] = React.useState<{ what: string; seconds: number } | null>(null);

  /* One firing per round per step. */
  const published = React.useRef<number | null>(null);
  const started = React.useRef<number | null>(null);

  /*
   * The actions, held in a ref rather than depended on.
   *
   * They are plain functions rebuilt on every render of the page above, and the page ticks
   * once a second for the clock. Depending on them tore this effect down and rebuilt it
   * every second — which cleared the pending timeout every time, so the countdown never
   * survived long enough to fire. The scheduled action must outlive a re-render.
   */
  const actions = React.useRef({ onPublish, onPhase });

  React.useEffect(() => {
    actions.current = { onPublish, onPhase };
  }, [onPublish, onPhase]);

  /*
   * A second hand, so the countdown on screen actually counts down.
   *
   * Depends on whether something is pending, not on the pending object: the interval
   * updates that object every second, so depending on it would tear the timer down and
   * rebuild it on every tick.
   */
  const counting = pending !== null;

  React.useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(
      () => setPending((c) => (c ? { ...c, seconds: Math.max(0, c.seconds - 1) } : c)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [counting]);

  const finished = round > 0 && boardsTotal > 0 && boardsVerified === boardsTotal;
  const lastRound = round >= totalRounds;

  React.useEffect(() => {
    if (!on) return;
    /* A break is a decision to stop, so nothing overrides it. */
    if (phase === "break") return;

    if (finished && published.current !== round) {
      published.current = round;

      const what = lastRound
        ? "Every result is in — moving to final review"
        : `Every result is in — pairing round ${round + 1}`;

      setPending({ what, seconds: 10 });

      const id = window.setTimeout(() => {
        setPending(null);
        if (lastRound) void actions.current.onPhase("final-review");
        else void actions.current.onPublish();
      }, 10_000);

      return () => window.clearTimeout(id);
    }

    if (phase === "round-published" && started.current !== round) {
      started.current = round;

      setPending({ what: `Starting round ${round}`, seconds: 30 });

      const id = window.setTimeout(() => {
        setPending(null);
        void actions.current.onPhase("round-active");
      }, 30_000);

      return () => window.clearTimeout(id);
    }
  }, [on, finished, lastRound, round, phase]);

  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center gap-3 rounded-feature px-4 py-3",
        pending ? "bg-primary-050" : "bg-[rgb(var(--c-surface-soft))]",
      )}
    >
      <Zap className={cn("size-4.5 shrink-0", on ? "text-primary" : "text-muted")} />

      <p className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {pending ? (
          <>
            <strong className="font-semibold text-ink">{pending.what}</strong>
            <span className="num text-muted"> — in {pending.seconds}s</span>
          </>
        ) : on ? (
          <span className="text-muted">
            Running the day by itself. Rounds are paired when every result is in, and started
            once the boards have been up for half a minute.
          </span>
        ) : (
          <span className="text-muted">
            Paused. Pair rounds and start them yourself from the controls below.
          </span>
        )}
      </p>

      {pending ? (
        <Button
          variant="secondary"
          className="shrink-0"
          onClick={() => {
            setPending(null);
            /*
             * Cancelling this step only. Auto-run stays on, because stopping one round
             * being paired early is a different decision from running the rest of the day
             * by hand.
             */
          }}
        >
          Not yet
        </Button>
      ) : null}

      <Button
        variant="ghost"
        className="shrink-0"
        icon={on ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        onClick={() => {
          setOn((v) => !v);
          setPending(null);
        }}
      >
        {on ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
