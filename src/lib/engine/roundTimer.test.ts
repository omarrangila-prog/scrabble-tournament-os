import { describe, expect, it } from "vitest";
import {
  canAdvanceRound,
  createTimer,
  elapsedMs,
  endTimer,
  extendTimer,
  formatClock,
  pauseTimer,
  phaseOf,
  remainingMs,
  resumeTimer,
  roundProgress,
  startTimer,
  totalDurationMs,
} from "./roundTimer";

const MIN = 60_000;
const at = (ms: number) => new Date(ms).toISOString();

describe("timer basics", () => {
  it("starts with the full planned duration", () => {
    const t = createTimer("e", 1, 45);
    expect(totalDurationMs(t)).toBe(45 * MIN);
    expect(remainingMs(t, 0)).toBe(45 * MIN);
    expect(phaseOf(t, 0)).toBe("not-started");
  });

  it("counts down once started", () => {
    const t = startTimer(createTimer("e", 1, 45), at(0));
    expect(remainingMs(t, 10 * MIN)).toBe(35 * MIN);
    expect(elapsedMs(t, 10 * MIN)).toBe(10 * MIN);
    expect(phaseOf(t, 10 * MIN)).toBe("running");
  });

  it("never reports negative remaining time", () => {
    const t = startTimer(createTimer("e", 1, 45), at(0));
    expect(remainingMs(t, 90 * MIN)).toBe(0);
    expect(phaseOf(t, 90 * MIN)).toBe("finished");
  });

  it("ignores a second start", () => {
    const first = startTimer(createTimer("e", 1, 45), at(0));
    expect(startTimer(first, at(5 * MIN)).startedAt).toBe(first.startedAt);
  });
});

describe("pause and resume", () => {
  it("holds the clock while paused", () => {
    let t = startTimer(createTimer("e", 1, 45), at(0));
    t = pauseTimer(t, at(10 * MIN));
    // Ten minutes later, still paused — remaining must not have moved.
    expect(remainingMs(t, 20 * MIN)).toBe(35 * MIN);
    expect(phaseOf(t, 20 * MIN)).toBe("paused");
  });

  it("does not lose time across a pause", () => {
    let t = startTimer(createTimer("e", 1, 45), at(0));
    t = pauseTimer(t, at(10 * MIN));
    t = resumeTimer(t, at(25 * MIN)); // paused for 15 minutes
    // Only the 10 minutes before the pause should have been consumed.
    expect(remainingMs(t, 25 * MIN)).toBe(35 * MIN);
    expect(remainingMs(t, 30 * MIN)).toBe(30 * MIN);
  });

  it("accumulates multiple pauses", () => {
    let t = startTimer(createTimer("e", 1, 45), at(0));
    t = pauseTimer(t, at(5 * MIN));
    t = resumeTimer(t, at(15 * MIN)); // +10 paused
    t = pauseTimer(t, at(20 * MIN));
    t = resumeTimer(t, at(25 * MIN)); // +5 paused
    // Played time: 5 + 5 = 10 minutes.
    expect(remainingMs(t, 25 * MIN)).toBe(35 * MIN);
  });

  it("ignores resume when not paused", () => {
    const t = startTimer(createTimer("e", 1, 45), at(0));
    expect(resumeTimer(t, at(5 * MIN))).toBe(t);
  });

  it("ignores pause before the round starts", () => {
    const t = createTimer("e", 1, 45);
    expect(pauseTimer(t, at(0))).toBe(t);
  });
});

describe("extensions", () => {
  it("adds time and records the reason", () => {
    let t = startTimer(createTimer("e", 1, 45), at(0));
    t = extendTimer(t, 10, "Four tables still playing", "Sir Hani", at(40 * MIN));

    expect(totalDurationMs(t)).toBe(55 * MIN);
    expect(remainingMs(t, 40 * MIN)).toBe(15 * MIN);
    expect(t.extensions).toHaveLength(1);
    expect(t.extensions[0].reason).toBe("Four tables still playing");
    expect(t.extensions[0].by).toBe("Sir Hani");
  });

  it("refuses an extension with no reason", () => {
    const t = startTimer(createTimer("e", 1, 45), at(0));
    expect(extendTimer(t, 10, "   ", "Sir Hani", at(0))).toBe(t);
  });

  it("refuses a non-positive extension", () => {
    const t = startTimer(createTimer("e", 1, 45), at(0));
    expect(extendTimer(t, 0, "x", "Sir Hani", at(0))).toBe(t);
    expect(extendTimer(t, -5, "x", "Sir Hani", at(0))).toBe(t);
  });

  it("revives a clock that has just expired", () => {
    let t = startTimer(createTimer("e", 1, 45), at(0));
    expect(phaseOf(t, 46 * MIN)).toBe("finished");
    t = extendTimer(t, 10, "Late finish", "Sir Hani", at(46 * MIN));
    expect(phaseOf(t, 46 * MIN)).toBe("running");
    expect(remainingMs(t, 46 * MIN)).toBe(9 * MIN);
  });

  it("accumulates several extensions", () => {
    let t = startTimer(createTimer("e", 1, 45), at(0));
    t = extendTimer(t, 5, "a", "Sir Hani", at(0));
    t = extendTimer(t, 10, "b", "Sir Hani", at(0));
    expect(totalDurationMs(t)).toBe(60 * MIN);
    expect(t.extensions).toHaveLength(2);
  });
});

describe("ending a round", () => {
  it("stops the clock", () => {
    let t = startTimer(createTimer("e", 1, 45), at(0));
    t = endTimer(t, at(30 * MIN));
    expect(remainingMs(t, 40 * MIN)).toBe(0);
    expect(phaseOf(t, 40 * MIN)).toBe("finished");
  });

  it("ignores a second end", () => {
    const ended = endTimer(startTimer(createTimer("e", 1, 45), at(0)), at(30 * MIN));
    expect(endTimer(ended, at(35 * MIN)).endedAt).toBe(ended.endedAt);
  });
});

describe("clock formatting", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(44 * MIN + 59_000)).toBe("44:59");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65_000)).toBe("01:05");
  });

  it("formats beyond an hour", () => {
    expect(formatClock(3_665_000)).toBe("1:01:05");
  });

  it("never shows a negative clock", () => {
    expect(formatClock(-5000)).toBe("00:00");
  });
});

describe("round progress and advancement", () => {
  it("computes completion", () => {
    const p = roundProgress({
      totalBoards: 48, submitted: 40, verified: 34,
      awaitingConfirmation: 5, conflicts: 1,
    });
    expect(p.outstanding).toBe(8);
    expect(p.percentComplete).toBe(71);
    expect(p.complete).toBe(false);
  });

  it("blocks the next round on conflicts", () => {
    const p = roundProgress({ totalBoards: 10, submitted: 10, verified: 9, awaitingConfirmation: 0, conflicts: 1 });
    const c = canAdvanceRound(p);
    expect(c.ready).toBe(false);
    expect(c.reason).toContain("conflict");
  });

  it("blocks on unconfirmed results", () => {
    const p = roundProgress({ totalBoards: 10, submitted: 10, verified: 8, awaitingConfirmation: 2, conflicts: 0 });
    expect(canAdvanceRound(p).ready).toBe(false);
    expect(canAdvanceRound(p).reason).toContain("confirmation");
  });

  it("blocks on boards that have not reported", () => {
    const p = roundProgress({ totalBoards: 10, submitted: 7, verified: 7, awaitingConfirmation: 0, conflicts: 0 });
    expect(canAdvanceRound(p).ready).toBe(false);
    expect(canAdvanceRound(p).reason).toContain("not reported");
  });

  it("allows the next round once everything is verified", () => {
    const p = roundProgress({ totalBoards: 10, submitted: 10, verified: 10, awaitingConfirmation: 0, conflicts: 0 });
    expect(p.complete).toBe(true);
    expect(canAdvanceRound(p).ready).toBe(true);
  });
});
