"use client";

import * as React from "react";

import {
  createTimer,
  endTimer,
  extendTimer,
  formatClock,
  pauseTimer,
  phaseOf,
  remainingMs,
  resumeTimer,
  startTimer,
  type RoundTimer,
  type TimerPhase,
} from "@/lib/engine/roundTimer";

import { announceBoardsChanged, subscribeToBoardChanges } from "./realtime";
import { readRoundTimer, saveRoundTimer } from "./roundTimer";

export interface RoundTimerState {
  timer: RoundTimer | null;
  loaded: boolean;
  phase: TimerPhase;
  /** Milliseconds left, recomputed every second from the recorded instants. */
  remaining: number;
  clock: string;
  reload: () => void;
}

export interface RoundTimerControls extends RoundTimerState {
  ensure: (plannedMinutes: number) => Promise<void>;
  start: (plannedMinutes: number) => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  end: () => Promise<boolean>;
  extend: (minutes: number, reason: string, by: string) => Promise<boolean>;
  /** Set when the last write failed, so a screen can say the clock is not shared. */
  error: string | null;
}

/**
 * The round clock, shared by every screen.
 *
 * Reads the recorded instants from the database and derives the countdown locally, so the
 * director's laptop, the wall display and a player's phone all show the same time left
 * without any of them being the one that owns it.
 *
 * The clock is re-read on the same nudge the board list uses. Every screen also derives
 * from timestamps, so a missed message costs the accuracy of nothing — the next read
 * corrects it, and until then the countdown is still running from the right start.
 */
export function useRoundTimer(eventId: string, round: number): RoundTimerState {
  const [timer, setTimer] = React.useState<RoundTimer | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const next = round > 0 ? await readRoundTimer(eventId, round) : null;
      if (!live) return;
      setTimer(next);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, round, reloads]);

  React.useEffect(() => subscribeToBoardChanges(eventId, reload), [eventId, reload]);

  /*
   * A second hand. `Date.now()` cannot be read while rendering — the same render must
   * always produce the same output — so the current instant is state, moved forward by
   * this interval.
   *
   * It only ticks while there is something to count. A finished round does not need to
   * re-render every second for the rest of the day.
   */
  const [now, setNow] = React.useState(() => Date.now());
  const counting = timer !== null && !timer.endedAt && !timer.pausedAt && !!timer.startedAt;

  React.useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);

  const phase: TimerPhase = timer ? phaseOf(timer, now) : "not-started";
  const remaining = timer ? remainingMs(timer, now) : 0;

  return { timer, loaded, phase, remaining, clock: formatClock(remaining), reload };
}

/**
 * The same clock, plus the controls that move it. For the director's screen.
 *
 * Each control applies the engine to the current clock and stores the result, so the
 * rules for pausing and extending live in exactly one place. The new clock is shown
 * immediately and rolled back if the write fails — a director who pressed Pause needs to
 * know whether the room's clock actually paused, not just their own.
 */
export function useRoundTimerControls(
  eventId: string,
  round: number,
  by: string,
): RoundTimerControls {
  const state = useRoundTimer(eventId, round);
  const [error, setError] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState<RoundTimer | null>(null);

  /*
   * The local value is shown only while it is newer than what came back from the
   * database, matched on the round it belongs to. Comparing rather than clearing it in an
   * effect keeps the render a function of what is known.
   */
  const shown = local && local.round === round ? local : state.timer;

  const commit = React.useCallback(
    async (next: RoundTimer): Promise<boolean> => {
      setLocal(next);
      setError(null);

      const written = await saveRoundTimer(next, by);

      if (!written.ok) {
        setLocal(null);
        setError(written.message ?? "The round clock was not saved.");
        state.reload();
        return false;
      }

      // Tell the room to look again, the same nudge the board list listens for.
      announceBoardsChanged(eventId);
      state.reload();
      return true;
    },
    [by, eventId, state],
  );

  const current = React.useCallback(
    (plannedMinutes: number): RoundTimer =>
      shown ?? createTimer(eventId, round, plannedMinutes),
    [eventId, round, shown],
  );

  const [now, setNow] = React.useState(() => Date.now());
  const counting = !!shown && !shown.endedAt && !shown.pausedAt && !!shown.startedAt;

  React.useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);

  const phase: TimerPhase = shown ? phaseOf(shown, now) : "not-started";
  const remaining = shown ? remainingMs(shown, now) : 0;

  return {
    ...state,
    timer: shown,
    phase,
    remaining,
    clock: formatClock(remaining),
    error,

    ensure: async (plannedMinutes) => {
      if (!shown) await commit(createTimer(eventId, round, plannedMinutes));
    },
    start: (plannedMinutes) => commit(startTimer(current(plannedMinutes))),
    pause: () => (shown ? commit(pauseTimer(shown)) : Promise.resolve(false)),
    resume: () => (shown ? commit(resumeTimer(shown)) : Promise.resolve(false)),
    end: () => (shown ? commit(endTimer(shown)) : Promise.resolve(false)),
    extend: (minutes, reason, extendedBy) =>
      shown ? commit(extendTimer(shown, minutes, reason, extendedBy)) : Promise.resolve(false),
  };
}
