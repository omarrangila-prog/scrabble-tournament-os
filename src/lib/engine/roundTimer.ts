/**
 * Round and break timing.
 *
 * Timing is derived from timestamps rather than a counted-down number held in
 * memory. A director's laptop may sleep, the venue display may reconnect, and a
 * participant's phone may open the page an hour late — all of those must agree
 * on the remaining time, which only works if every screen computes it from the
 * same recorded instants.
 */

export type TimerPhase = "not-started" | "running" | "paused" | "finished";

export interface RoundTimer {
  eventId: string;
  round: number;
  /** Planned length before any extension. */
  plannedMinutes: number;
  /** Extensions granted, each with a recorded reason. */
  extensions: { minutes: number; reason: string; by: string; at: string }[];

  startedAt?: string;
  /** Set while paused; cleared on resume. */
  pausedAt?: string;
  /** Total milliseconds spent paused, accumulated across pauses. */
  pausedMs: number;
  endedAt?: string;
}

export function createTimer(eventId: string, round: number, plannedMinutes: number): RoundTimer {
  return { eventId, round, plannedMinutes, extensions: [], pausedMs: 0 };
}

/** Total allotted time including every extension, in milliseconds. */
export function totalDurationMs(timer: RoundTimer): number {
  const extra = timer.extensions.reduce((sum, e) => sum + e.minutes, 0);
  return (timer.plannedMinutes + extra) * 60_000;
}

export function phaseOf(timer: RoundTimer, now = Date.now()): TimerPhase {
  if (timer.endedAt) return "finished";
  if (!timer.startedAt) return "not-started";
  if (timer.pausedAt) return "paused";
  return remainingMs(timer, now) <= 0 ? "finished" : "running";
}

/**
 * Milliseconds left on the clock, never negative.
 *
 * Paused time is excluded, so a round paused for a fire alarm resumes with the
 * time it had rather than silently losing it.
 */
export function remainingMs(timer: RoundTimer, now = Date.now()): number {
  if (!timer.startedAt) return totalDurationMs(timer);
  if (timer.endedAt) return 0;

  const start = new Date(timer.startedAt).getTime();
  const pausedNow = timer.pausedAt ? now - new Date(timer.pausedAt).getTime() : 0;
  const elapsed = now - start - timer.pausedMs - pausedNow;

  return Math.max(0, totalDurationMs(timer) - elapsed);
}

export function elapsedMs(timer: RoundTimer, now = Date.now()): number {
  return Math.max(0, totalDurationMs(timer) - remainingMs(timer, now));
}

/** Formats milliseconds as MM:SS, or H:MM:SS beyond an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

export function startTimer(timer: RoundTimer, at = new Date().toISOString()): RoundTimer {
  if (timer.startedAt) return timer;
  return { ...timer, startedAt: at, pausedAt: undefined, endedAt: undefined };
}

export function pauseTimer(timer: RoundTimer, at = new Date().toISOString()): RoundTimer {
  if (!timer.startedAt || timer.pausedAt || timer.endedAt) return timer;
  return { ...timer, pausedAt: at };
}

export function resumeTimer(timer: RoundTimer, at = new Date().toISOString()): RoundTimer {
  if (!timer.pausedAt) return timer;
  const pausedFor = new Date(at).getTime() - new Date(timer.pausedAt).getTime();
  return { ...timer, pausedAt: undefined, pausedMs: timer.pausedMs + Math.max(0, pausedFor) };
}

export function endTimer(timer: RoundTimer, at = new Date().toISOString()): RoundTimer {
  if (timer.endedAt) return timer;
  return { ...timer, endedAt: at, pausedAt: undefined };
}

/**
 * Grants extra time. A reason is required — an extension changes the result of
 * games in progress, so it must be attributable.
 */
export function extendTimer(
  timer: RoundTimer,
  minutes: number,
  reason: string,
  by: string,
  at = new Date().toISOString(),
): RoundTimer {
  if (minutes <= 0 || !reason.trim()) return timer;
  return {
    ...timer,
    extensions: [...timer.extensions, { minutes, reason: reason.trim(), by, at }],
    // An extension revives a clock that has just run out.
    endedAt: undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Round progress                                                              */
/* -------------------------------------------------------------------------- */

export interface RoundProgress {
  totalBoards: number;
  submitted: number;
  verified: number;
  awaitingConfirmation: number;
  conflicts: number;
  outstanding: number;
  /** Percentage of boards with a verified result. */
  percentComplete: number;
  /** True once every board has a verified result. */
  complete: boolean;
}

export function roundProgress(counts: {
  totalBoards: number;
  submitted: number;
  verified: number;
  awaitingConfirmation: number;
  conflicts: number;
}): RoundProgress {
  const outstanding = Math.max(
    0,
    counts.totalBoards - counts.verified - counts.awaitingConfirmation - counts.conflicts,
  );
  return {
    ...counts,
    outstanding,
    percentComplete:
      counts.totalBoards > 0 ? Math.round((counts.verified / counts.totalBoards) * 100) : 0,
    complete: counts.totalBoards > 0 && counts.verified === counts.totalBoards,
  };
}

/** Whether the next round may be prepared, and why not if it may not. */
export function canAdvanceRound(progress: RoundProgress): {
  ready: boolean;
  reason: string;
} {
  if (progress.conflicts > 0)
    return {
      ready: false,
      reason: `${progress.conflicts} score conflict${progress.conflicts === 1 ? "" : "s"} must be resolved first.`,
    };
  if (progress.awaitingConfirmation > 0)
    return {
      ready: false,
      reason: `${progress.awaitingConfirmation} result${progress.awaitingConfirmation === 1 ? " is" : "s are"} waiting for opponent confirmation.`,
    };
  if (progress.outstanding > 0)
    return {
      ready: false,
      reason: `${progress.outstanding} board${progress.outstanding === 1 ? " has" : "s have"} not reported a result.`,
    };
  return { ready: true, reason: "All results are verified. The next round can be prepared." };
}
