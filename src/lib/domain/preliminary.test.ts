import { describe, expect, it } from "vitest";

import {
  preliminaryDraw,
  reconcile,
  reconciliationSummary,
  type PreliminaryPlayer,
} from "./preliminary";
import { seededRandom } from "@/lib/engine/tournamentSim";

const DIVISIONS = ["beginner", "recreational", "advanced", "masters"];

/** `{beginner: 4}` becomes four registered beginners. */
function registered(spec: Record<string, number>): PreliminaryPlayer[] {
  const out: PreliminaryPlayer[] = [];
  let n = 0;
  for (const [division, count] of Object.entries(spec)) {
    for (let i = 1; i <= count; i += 1) {
      n += 1;
      out.push({
        id: `${division}-${i}`,
        fullName: `${division} ${i}`,
        playerNumber: String(100 + n),
        division,
      });
    }
  }
  return out;
}

describe("preliminaryDraw", () => {
  it("pairs everybody it can, within their category", () => {
    const draw = preliminaryDraw(registered({ beginner: 6, advanced: 4 }), DIVISIONS, seededRandom(1));

    expect(draw.pairs).toHaveLength(5);
    expect(draw.unpaired).toEqual([]);
    for (const pair of draw.pairs) {
      expect(pair.a.division).toBe(pair.division);
      expect(pair.b.division).toBe(pair.division);
    }
  });

  it("NEVER pairs across categories", () => {
    /* One of each. The only way to give them games is the wrong way. */
    const draw = preliminaryDraw(
      registered({ beginner: 1, recreational: 1, advanced: 1, masters: 1 }),
      DIVISIONS,
      seededRandom(2),
    );

    expect(draw.pairs).toEqual([]);
    expect(draw.unpaired).toHaveLength(4);
  });

  it("leaves one unpaired per odd category", () => {
    const draw = preliminaryDraw(
      registered({ beginner: 5, recreational: 8, advanced: 3 }),
      DIVISIONS,
      seededRandom(3),
    );

    expect(draw.pairs).toHaveLength(2 + 4 + 1);
    expect(draw.unpaired.map((p) => p.division).sort()).toEqual(["advanced", "beginner"]);
  });

  it("is reproducible from the same seed — a printed sheet must match a regenerated one", () => {
    const players = registered({ beginner: 12, advanced: 9 });
    const first = preliminaryDraw(players, DIVISIONS, seededRandom(2026));
    const again = preliminaryDraw(players, DIVISIONS, seededRandom(2026));

    expect(again).toEqual(first);
  });

  it("actually shuffles, rather than pairing in registration order", () => {
    const players = registered({ beginner: 20 });
    const draws = [11, 22, 33].map((seed) =>
      preliminaryDraw(players, DIVISIONS, seededRandom(seed)).pairs.map((p) => `${p.a.id}|${p.b.id}`).join(","),
    );

    expect(new Set(draws).size).toBeGreaterThan(1);
  });

  it("accounts for every registered player exactly once", () => {
    const players = registered({ beginner: 7, recreational: 10, advanced: 5, masters: 2 });
    const draw = preliminaryDraw(players, DIVISIONS, seededRandom(4));

    const seen = [
      ...draw.pairs.flatMap((p) => [p.a.id, p.b.id]),
      ...draw.unpaired.map((p) => p.id),
    ];
    expect(seen.sort()).toEqual(players.map((p) => p.id).sort());
  });
});

describe("reconcile — the morning after", () => {
  const players = registered({ beginner: 6, advanced: 4 });
  const draw = preliminaryDraw(players, DIVISIONS, seededRandom(5));

  it("keeps every pair when everybody comes", () => {
    const out = reconcile(draw, players);

    expect(out.intact).toEqual(draw.pairs);
    expect(out.broken).toEqual([]);
    expect(out.needPairing).toEqual([]);
    expect(out.noShows).toEqual([]);
  });

  it("breaks a pair when one player does not come, and hands the other back", () => {
    const missing = draw.pairs[0].a;
    const arrived = players.filter((p) => p.id !== missing.id);

    const out = reconcile(draw, arrived);

    expect(out.intact).toHaveLength(draw.pairs.length - 1);
    expect(out.broken).toHaveLength(1);
    expect(out.broken[0].missing.id).toBe(missing.id);
    expect(out.broken[0].survivor.id).toBe(draw.pairs[0].b.id);
    expect(out.needPairing.map((p) => p.id)).toEqual([draw.pairs[0].b.id]);
    expect(out.noShows.map((p) => p.id)).toEqual([missing.id]);
  });

  it("salvages nothing from a pair where neither came, and re-pairs nobody for it", () => {
    const gone = draw.pairs[1];
    const arrived = players.filter((p) => p.id !== gone.a.id && p.id !== gone.b.id);

    const out = reconcile(draw, arrived);

    expect(out.broken).toEqual([]);
    expect(out.needPairing).toEqual([]);
    expect(out.noShows.map((p) => p.id).sort()).toEqual([gone.a.id, gone.b.id].sort());
  });

  it("counts a walk-in as somebody who needs pairing, and names them", () => {
    const walkIn: PreliminaryPlayer = {
      id: "walkin-1",
      fullName: "Walked In",
      playerNumber: "199",
      division: "beginner",
    };

    const out = reconcile(draw, [...players, walkIn]);

    expect(out.unexpected).toEqual([walkIn]);
    expect(out.needPairing).toEqual([walkIn]);
    expect(out.intact).toHaveLength(draw.pairs.length);
  });

  it("puts a drawn-but-unpaired player who arrives into the pairing pool", () => {
    const odd = registered({ beginner: 5 });
    const oddDraw = preliminaryDraw(odd, DIVISIONS, seededRandom(6));
    expect(oddDraw.unpaired).toHaveLength(1);

    const out = reconcile(oddDraw, odd);
    expect(out.needPairing.map((p) => p.id)).toEqual([oddDraw.unpaired[0].id]);
  });

  it("handles the realistic morning: several no-shows, one walk-in", () => {
    /*
     * The shape of an actual event day. Three of the twenty-one registered do not appear and
     * one person who never registered does. The question is whether the accounting still
     * adds up: everybody here is either on an intact pair or in the pool, and nobody is both.
     */
    const roster = registered({ beginner: 9, recreational: 8, advanced: 4 });
    const night = preliminaryDraw(roster, DIVISIONS, seededRandom(7));
    const noShows = new Set([roster[0].id, roster[10].id, roster[18].id]);
    const walkIn: PreliminaryPlayer = { id: "w", fullName: "W", playerNumber: "300", division: "recreational" };
    const arrived = [...roster.filter((p) => !noShows.has(p.id)), walkIn];

    const out = reconcile(night, arrived);

    const onIntact = new Set(out.intact.flatMap((p) => [p.a.id, p.b.id]));
    const inPool = new Set(out.needPairing.map((p) => p.id));

    for (const p of arrived) {
      const placed = onIntact.has(p.id) ? 1 : 0;
      const pooled = inPool.has(p.id) ? 1 : 0;
      expect(placed + pooled).toBe(1);
    }
    expect(out.noShows).toHaveLength(3);
    expect(out.unexpected).toEqual([walkIn]);
  });
});

describe("reconciliationSummary", () => {
  it("leads with what survived, then with the work left", () => {
    const players = registered({ beginner: 6 });
    const draw = preliminaryDraw(players, DIVISIONS, seededRandom(8));
    const out = reconcile(draw, players.slice(1));

    expect(reconciliationSummary(out)).toBe("2 pairs still stand · 1 lost an opponent · 1 need pairing");
  });

  it("says there is nobody left to pair when the sheet holds", () => {
    const players = registered({ beginner: 4 });
    const draw = preliminaryDraw(players, DIVISIONS, seededRandom(9));

    expect(reconciliationSummary(reconcile(draw, players))).toBe("2 pairs still stand · nobody left to pair");
  });

  it("mentions the unexpected arrivals", () => {
    const players = registered({ beginner: 4 });
    const draw = preliminaryDraw(players, DIVISIONS, seededRandom(10));
    const walkIn: PreliminaryPlayer = { id: "w", fullName: "W", playerNumber: "300", division: "beginner" };

    expect(reconciliationSummary(reconcile(draw, [...players, walkIn]))).toContain("1 arrived unexpectedly");
  });
});
