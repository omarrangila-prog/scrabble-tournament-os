import { describe, expect, it } from "vitest";

import {
  lockWarnings,
  provisionalDraw,
  provisionalLine,
  type ProvisionalPlayer,
} from "./provisional";

const DIVISIONS = ["beginner", "recreational", "advanced", "masters"];

/** Arrives at 09:00 plus `minute`, so arrival order is readable in the test itself. */
function arrival(division: string, n: number, minute: number): ProvisionalPlayer {
  return {
    id: `${division}-${n}`,
    fullName: `${division} ${n}`,
    playerNumber: String(100 + n),
    division,
    checkedInAt: `2026-09-20T09:${String(minute).padStart(2, "0")}:00+05:00`,
  };
}

/** `{beginner: 3}` becomes three beginners arriving one minute apart. */
function room(spec: Record<string, number>): ProvisionalPlayer[] {
  const out: ProvisionalPlayer[] = [];
  let minute = 0;
  for (const [division, count] of Object.entries(spec)) {
    for (let n = 1; n <= count; n += 1) {
      out.push(arrival(division, n, minute));
      minute += 1;
    }
  }
  return out;
}

describe("provisionalDraw", () => {
  it("pairs nobody in an empty room", () => {
    const draw = provisionalDraw([], DIVISIONS);
    expect(draw.arrived).toBe(0);
    expect(draw.pairs).toBe(0);
    expect(draw.waiting).toBe(0);
  });

  it("leaves the first arrival waiting for an opponent", () => {
    const draw = provisionalDraw(room({ beginner: 1 }), DIVISIONS);
    const beginner = draw.divisions.find((d) => d.division === "beginner")!;

    expect(beginner.pairs).toEqual([]);
    expect(beginner.waiting?.fullName).toBe("beginner 1");
    expect(draw.waiting).toBe(1);
  });

  it("pairs them as soon as a second one arrives", () => {
    const draw = provisionalDraw(room({ beginner: 2 }), DIVISIONS);
    const beginner = draw.divisions.find((d) => d.division === "beginner")!;

    expect(beginner.pairs).toHaveLength(1);
    expect(beginner.waiting).toBeNull();
    expect(beginner.pairs[0].a.fullName).toBe("beginner 1");
    expect(beginner.pairs[0].b.fullName).toBe("beginner 2");
  });

  it("pairs in arrival order, so the room can watch it happen", () => {
    const players = [
      arrival("beginner", 3, 10),
      arrival("beginner", 1, 2),
      arrival("beginner", 2, 6),
    ];
    const beginner = provisionalDraw(players, DIVISIONS).divisions[0];

    expect(beginner.pairs[0].a.fullName).toBe("beginner 1");
    expect(beginner.pairs[0].b.fullName).toBe("beginner 2");
    expect(beginner.waiting?.fullName).toBe("beginner 3");
  });

  it("NEVER pairs across categories, however lonely somebody is", () => {
    /*
     * The failure an acceptance tester already reported, in its most tempting form: one
     * beginner and one advanced player, each with nobody to play. Pairing them would give
     * everybody a game and would be wrong.
     */
    const draw = provisionalDraw(room({ beginner: 1, advanced: 1 }), DIVISIONS);

    expect(draw.pairs).toBe(0);
    expect(draw.waiting).toBe(2);
    for (const d of draw.divisions) {
      for (const pair of d.pairs) {
        expect(pair.a.division).toBe(pair.b.division);
      }
    }
  });

  it("keeps four categories apart at once", () => {
    const draw = provisionalDraw(
      room({ beginner: 4, recreational: 3, advanced: 6, masters: 2 }),
      DIVISIONS,
    );

    expect(draw.arrived).toBe(15);
    /* 2 + 1 + 3 + 1 pairs, with one recreational player left over. */
    expect(draw.pairs).toBe(7);
    expect(draw.waiting).toBe(1);

    for (const d of draw.divisions) {
      for (const pair of d.pairs) {
        expect(pair.a.division).toBe(d.division);
        expect(pair.b.division).toBe(d.division);
      }
      expect(d.waiting?.division ?? d.division).toBe(d.division);
    }
  });

  it("never leaves more than one person waiting in a category", () => {
    for (const count of [1, 2, 3, 7, 8, 21]) {
      const d = provisionalDraw(room({ advanced: count }), DIVISIONS).divisions.find(
        (x) => x.division === "advanced",
      )!;
      expect(d.pairs.length * 2 + (d.waiting ? 1 : 0)).toBe(count);
      expect(d.waiting === null).toBe(count % 2 === 0);
    }
  });

  it("ignores a category the event does not run", () => {
    const draw = provisionalDraw(room({ beginner: 2 }), ["beginner"]);
    expect(draw.divisions).toHaveLength(1);
    expect(draw.arrived).toBe(2);
  });
});

describe("provisionalLine", () => {
  it("names whoever is waiting, because that is the thing to act on", () => {
    const d = provisionalDraw(room({ beginner: 3 }), DIVISIONS).divisions[0];
    expect(provisionalLine(d)).toBe("1 pair · beginner 3 is waiting for an opponent");
  });

  it("says so when everybody is matched", () => {
    const d = provisionalDraw(room({ beginner: 4 }), DIVISIONS).divisions[0];
    expect(provisionalLine(d)).toBe("2 pairs · everybody has somebody");
  });

  it("says nobody is here rather than reporting zero pairs", () => {
    const d = provisionalDraw([], DIVISIONS).divisions[0];
    expect(provisionalLine(d)).toBe("Nobody here yet");
  });
});

describe("lockWarnings", () => {
  it("says nothing when every category is even", () => {
    expect(lockWarnings(provisionalDraw(room({ beginner: 4, advanced: 2 }), DIVISIONS))).toEqual([]);
  });

  it("warns who would take the bye in an odd category", () => {
    const warnings = lockWarnings(provisionalDraw(room({ beginner: 5 }), DIVISIONS));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("beginner 5 would take the bye");
  });

  it("singles out a category holding one person", () => {
    const warnings = lockWarnings(provisionalDraw(room({ masters: 1 }), DIVISIONS));
    expect(warnings[0]).toContain("can only take a bye");
  });

  it("warns once per affected category, not once per player", () => {
    const warnings = lockWarnings(
      provisionalDraw(room({ beginner: 5, recreational: 7, advanced: 4 }), DIVISIONS),
    );
    expect(warnings).toHaveLength(2);
  });
});
