import { describe, expect, it } from "vitest";

import {
  proposeLateMatches,
  remainingForLateMatch,
  waitingLine,
  type Waiting,
} from "./rollingEntry";

/** Arrives at 12:00 plus `minute`. */
function arrives(division: string, name: string, minute: number): Waiting {
  return {
    id: `${division}-${name}`,
    fullName: name,
    playerNumber: "",
    division,
    checkedInAt: `2026-09-20T12:${String(minute).padStart(2, "0")}:00+05:00`,
  };
}

describe("proposeLateMatches — the acceptance scenario", () => {
  it("leaves the first late beginner waiting", () => {
    const room = proposeLateMatches([arrives("beginner", "Ahmed", 5)]);
    expect(room.proposals).toEqual([]);
    expect(room.waiting.map((w) => w.fullName)).toEqual(["Ahmed"]);
  });

  it("proposes them the moment a second beginner arrives", () => {
    const room = proposeLateMatches([
      arrives("beginner", "Ahmed", 5),
      arrives("beginner", "Bilal", 7),
    ]);
    expect(room.proposals).toHaveLength(1);
    expect(room.proposals[0].a.fullName).toBe("Ahmed");
    expect(room.proposals[0].b.fullName).toBe("Bilal");
    expect(room.waiting).toEqual([]);
  });

  it("NEVER proposes across categories, however long both have waited", () => {
    const room = proposeLateMatches([
      arrives("beginner", "Ahmed", 5),
      arrives("advanced", "Zara", 6),
    ]);
    expect(room.proposals).toEqual([]);
    expect(room.waiting).toHaveLength(2);
  });

  it("pairs the longest-waiting first — A with B, then C waits, then C with D", () => {
    const room = proposeLateMatches([
      arrives("recreational", "D", 12),
      arrives("recreational", "B", 6),
      arrives("recreational", "A", 5),
      arrives("recreational", "C", 9),
    ]);
    expect(room.proposals.map((p) => `${p.a.fullName}-${p.b.fullName}`)).toEqual(["A-B", "C-D"]);
  });

  it("holds the odd one as waiting, not as a bye", () => {
    const room = proposeLateMatches([
      arrives("masters", "A", 1),
      arrives("masters", "B", 2),
      arrives("masters", "C", 3),
    ]);
    expect(room.proposals).toHaveLength(1);
    expect(room.waiting.map((w) => w.fullName)).toEqual(["C"]);
  });

  it("handles every category at once", () => {
    const room = proposeLateMatches([
      arrives("beginner", "b1", 1), arrives("beginner", "b2", 2), arrives("beginner", "b3", 3),
      arrives("recreational", "r1", 1), arrives("recreational", "r2", 2),
      arrives("advanced", "a1", 1),
      arrives("masters", "m1", 1), arrives("masters", "m2", 2), arrives("masters", "m3", 3), arrives("masters", "m4", 4),
    ]);
    expect(room.proposals).toHaveLength(1 + 1 + 0 + 2);
    expect(room.waiting.map((w) => w.division).sort()).toEqual(["advanced", "beginner"]);
    for (const p of room.proposals) {
      expect(p.a.division).toBe(p.division);
      expect(p.b.division).toBe(p.division);
    }
  });

  it("is empty when nobody is waiting", () => {
    expect(proposeLateMatches([])).toEqual({ proposals: [], waiting: [] });
  });
});

describe("remainingForLateMatch", () => {
  const ends = "2026-09-20T12:25:00+05:00";

  it("gives a late pair only what is left of the round", () => {
    const left = remainingForLateMatch(ends, "2026-09-20T12:07:00+05:00");
    expect(left?.minutes).toBe(18);
    expect(left?.label).toBe("18 minutes left");
  });

  it("uses the singular for one minute", () => {
    expect(remainingForLateMatch(ends, "2026-09-20T12:24:00+05:00")?.label).toBe("1 minute left");
  });

  it("says less than a minute rather than zero", () => {
    expect(remainingForLateMatch(ends, "2026-09-20T12:24:40+05:00")?.label).toBe("less than a minute left");
  });

  it("never goes negative after the round has ended", () => {
    expect(remainingForLateMatch(ends, "2026-09-20T12:30:00+05:00")?.minutes).toBe(0);
  });

  it("returns null when the round has no clock yet", () => {
    expect(remainingForLateMatch(null, "2026-09-20T12:00:00+05:00")).toBeNull();
  });
});

describe("waitingLine", () => {
  it("names the category, because the desk's next question depends on it", () => {
    expect(waitingLine(arrives("beginner", "Ahmed", 5))).toBe("Ahmed (beginner) — waiting for an opponent");
  });
});
