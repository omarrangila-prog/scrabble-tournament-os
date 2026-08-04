import { describe, expect, it } from "vitest";
import {
  firstRoundFromSeeds,
  generateSeeding,
  HYBRID_MAX_SHIFT,

  validateSeeding,
} from "./seeding";
import { Player } from "../domain/types";

/** Builds a controllable roster: ratings descend, clubs assigned explicitly. */
function makePool(specs: { rating: number; club: string; name?: string }[]): Player[] {
  return specs.map((s, i) => ({
    id: `p${i + 1}`,
    playerId: `T-${i + 1}`,
    fullName: s.name ?? `Player ${i + 1}`,
    initials: "PP",
    avatarHue: 0,
    city: "Karachi",
    club: s.club,
    division: "masters" as const,
    rating: s.rating,
    ratingStatus: s.rating ? ("rated" as const) : ("unrated" as const),
    seed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    spread: 0,
    rank: 0,
    previousRank: 0,
    checkIn: "checked-in" as const,
    attendance: {},
    opponentHistory: [],
    boardHistory: [],
    byeRounds: [],
    tournamentHistory: [],
    emergencyContact: { name: "C", relationship: "Sibling", phone: "+92" },
    payment: "paid" as const,
    registeredAt: "2026-06-01T00:00:00.000Z",
  }));
}

describe("rating-based seeding", () => {
  it("orders strictly by descending rating", () => {
    const pool = makePool([
      { rating: 1800, club: "A" },
      { rating: 2000, club: "B" },
      { rating: 1900, club: "C" },
    ]);
    const r = generateSeeding(pool, "masters", "rating");

    expect(r.entries.map((e) => e.seed)).toEqual([1, 2, 3]);
    expect(r.entries[0].playerId).toBe("p2"); // 2000
    expect(r.entries[1].playerId).toBe("p3"); // 1900
    expect(r.entries[2].playerId).toBe("p1"); // 1800
  });

  it("seeds unrated players at the foot of the division", () => {
    const pool = makePool([
      { rating: 0, club: "A" },
      { rating: 1500, club: "B" },
      { rating: 1700, club: "C" },
    ]);
    const r = generateSeeding(pool, "masters", "rating");

    expect(r.entries[r.entries.length - 1].playerId).toBe("p1");
    expect(r.warnings.some((w) => w.kind === "unrated")).toBe(true);
  });

  it("never shifts anyone from the rating order", () => {
    const pool = makePool([
      { rating: 2000, club: "Same" },
      { rating: 1980, club: "Same" },
      { rating: 1960, club: "Other" },
    ]);
    const r = generateSeeding(pool, "masters", "rating");
    expect(r.entries.every((e) => e.shift === 0)).toBe(true);
  });
});

describe("same-school detection", () => {
  it("flags adjacent players from one organization", () => {
    const pool = makePool([
      { rating: 2000, club: "City School", name: "Ana" },
      { rating: 1980, club: "City School", name: "Bilal" },
      { rating: 1900, club: "Other Club", name: "Cara" },
    ]);
    const r = generateSeeding(pool, "masters", "rating");
    const school = r.warnings.filter((w) => w.kind === "same-school");

    expect(school).toHaveLength(1);
    expect(school[0].seeds).toEqual([1, 2]);
    expect(school[0].message).toContain("City School");
  });

  it("produces two warnings when two pairs are adjacent", () => {
    const pool = makePool([
      { rating: 2000, club: "Alpha" },
      { rating: 1990, club: "Alpha" },
      { rating: 1900, club: "Beta" },
      { rating: 1890, club: "Beta" },
    ]);
    const r = generateSeeding(pool, "masters", "rating");
    expect(r.warnings.filter((w) => w.kind === "same-school")).toHaveLength(2);
  });

  it("does not flag same-club players who are not adjacent", () => {
    const pool = makePool([
      { rating: 2000, club: "Alpha" },
      { rating: 1950, club: "Beta" },
      { rating: 1900, club: "Alpha" },
    ]);
    const r = generateSeeding(pool, "masters", "rating");
    expect(r.warnings.filter((w) => w.kind === "same-school")).toHaveLength(0);
  });
});

describe("hybrid seeding", () => {
  it("reduces same-school adjacency compared with rating order", () => {
    const pool = makePool([
      { rating: 2000, club: "Alpha" },
      { rating: 1990, club: "Alpha" },
      { rating: 1980, club: "Beta" },
      { rating: 1970, club: "Gamma" },
      { rating: 1960, club: "Delta" },
      { rating: 1950, club: "Beta" },
    ]);

    const rating = generateSeeding(pool, "masters", "rating");
    const hybrid = generateSeeding(pool, "masters", "hybrid");

    const before = rating.warnings.filter((w) => w.kind === "same-school").length;
    const after = hybrid.warnings.filter((w) => w.kind === "same-school").length;

    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("keeps the rating order visible by capping movement", () => {
    const pool = makePool(
      Array.from({ length: 16 }, (_, i) => ({
        rating: 2000 - i * 10,
        club: i % 2 === 0 ? "Alpha" : "Beta",
      })),
    );
    const hybrid = generateSeeding(pool, "masters", "hybrid");

    for (const e of hybrid.entries) {
      expect(Math.abs(e.shift)).toBeLessThanOrEqual(HYBRID_MAX_SHIFT);
    }
  });

  it("still ranks the top rating first", () => {
    const pool = makePool([
      { rating: 2100, club: "Alpha" },
      { rating: 2090, club: "Alpha" },
      { rating: 2000, club: "Beta" },
      { rating: 1900, club: "Gamma" },
    ]);
    const hybrid = generateSeeding(pool, "masters", "hybrid");
    expect(hybrid.entries[0].playerId).toBe("p1");
  });

  it("explains any movement in the seed reason", () => {
    const pool = makePool([
      { rating: 2000, club: "Alpha" },
      { rating: 1990, club: "Alpha" },
      { rating: 1980, club: "Beta" },
      { rating: 1970, club: "Gamma" },
    ]);
    const hybrid = generateSeeding(pool, "masters", "hybrid");
    const moved = hybrid.entries.filter((e) => e.shift !== 0);
    for (const m of moved) {
      expect(m.factors.join(" ")).toMatch(/Hybrid seeding moved|Placed at seed/);
    }
  });
});

describe("director overrides", () => {
  it("places a player at the requested seed", () => {
    const pool = makePool([
      { rating: 2000, club: "A" },
      { rating: 1900, club: "B" },
      { rating: 1800, club: "C" },
      { rating: 1700, club: "D" },
    ]);
    const overrides = new Map([
      ["p4", { seed: 1, by: "Sir Hani", reason: "Defending champion protection", at: "now" }],
    ]);
    const r = generateSeeding(pool, "masters", "rating", { overrides });

    expect(r.entries[0].playerId).toBe("p4");
    expect(r.entries[0].override?.reason).toBe("Defending champion protection");
    expect(r.entries[0].factors.join(" ")).toContain("Sir Hani");
  });

  it("keeps the seed sequence contiguous after an override", () => {
    const pool = makePool(
      Array.from({ length: 8 }, (_, i) => ({ rating: 2000 - i * 20, club: `C${i}` })),
    );
    const overrides = new Map([
      ["p7", { seed: 2, by: "Sir Hani", reason: "Late rating update", at: "now" }],
    ]);
    const r = generateSeeding(pool, "masters", "rating", { overrides });

    expect(r.entries.map((e) => e.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(r.entries.map((e) => e.playerId)).size).toBe(8);
  });

  it("preserves a locked seed through regeneration", () => {
    const pool = makePool([
      { rating: 2000, club: "Alpha" },
      { rating: 1990, club: "Alpha" },
      { rating: 1980, club: "Beta" },
      { rating: 1970, club: "Alpha" },
    ]);
    const locked = new Set(["p2"]);
    const hybrid = generateSeeding(pool, "masters", "hybrid", { locked });

    const entry = hybrid.entries.find((e) => e.playerId === "p2")!;
    expect(entry.seed).toBe(2);
    expect(entry.locked).toBe(true);
  });
});

describe("validation", () => {
  it("passes a clean seed list", () => {
    const pool = makePool(
      Array.from({ length: 12 }, (_, i) => ({ rating: 2000 - i * 25, club: `C${i}` })),
    );
    const r = generateSeeding(pool, "masters", "rating");
    const v = validateSeeding(r, new Map(pool.map((p) => [p.id, p])));

    expect(v.valid).toBe(true);
    expect(v.duplicateSeeds).toBe(0);
    expect(v.missingSeeds).toBe(0);
    expect(v.playerCount).toBe(12);
  });

  it("reports remaining same-school adjacency without blocking publication", () => {
    const pool = makePool([
      { rating: 2000, club: "Alpha" },
      { rating: 1990, club: "Alpha" },
    ]);
    const r = generateSeeding(pool, "masters", "rating");
    const v = validateSeeding(r, new Map(pool.map((p) => [p.id, p])));

    expect(v.sameSchoolAdjacent).toBe(1);
    expect(v.valid).toBe(true); // permitted, but surfaced
  });

  it("counts director overrides", () => {
    const pool = makePool(
      Array.from({ length: 6 }, (_, i) => ({ rating: 2000 - i * 30, club: `C${i}` })),
    );
    const overrides = new Map([
      ["p5", { seed: 1, by: "Sir Hani", reason: "Protected placement", at: "now" }],
    ]);
    const r = generateSeeding(pool, "masters", "rating", { overrides });
    const v = validateSeeding(r, new Map(pool.map((p) => [p.id, p])));

    expect(v.overrides).toBe(1);
  });
});

describe("first round from published seeds", () => {
  it("folds the top half against the bottom half", () => {
    const pool = makePool(
      Array.from({ length: 8 }, (_, i) => ({ rating: 2000 - i * 20, club: `C${i}` })),
    );
    const r = generateSeeding(pool, "masters", "rating");
    const round = firstRoundFromSeeds(r);

    expect(round).toHaveLength(4);
    expect(round[0]).toMatchObject({ board: 1, topSeed: 1, bottomSeed: 5 });
    expect(round[1]).toMatchObject({ board: 2, topSeed: 2, bottomSeed: 6 });
    expect(round[3]).toMatchObject({ board: 4, topSeed: 4, bottomSeed: 8 });
  });

  it("assigns every player exactly once", () => {
    const pool = makePool(
      Array.from({ length: 32 }, (_, i) => ({ rating: 2100 - i * 10, club: `C${i % 7}` })),
    );
    const r = generateSeeding(pool, "masters", "hybrid");
    const round = firstRoundFromSeeds(r);

    const ids = round.flatMap((m) => [m.topId, m.bottomId]);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
  });
});

/**
 * A full-size field, built explicitly rather than read from seed data.
 *
 * These tests previously used the platform's fabricated 32-player Masters
 * division. That data is gone — the platform ships empty — so the field is
 * constructed here, which also makes the preconditions visible instead of
 * implied.
 */
describe("seeding a full division", () => {
  const CLUBS = ["Karachi SC", "Lahore SC", "Islamabad SC", "Multan SC"];
  const masters = makePool(
    Array.from({ length: 32 }, (_, i) => ({
      rating: 2100 - i * 20,
      club: CLUBS[i % CLUBS.length],
      name: `Player ${i + 1}`,
    })),
  );

  it("seeds every player exactly once, in an unbroken sequence", () => {
    for (const mode of ["rating", "hybrid"] as const) {
      const r = generateSeeding(masters, "masters", mode);
      expect(r.entries).toHaveLength(32);
      expect(r.entries.map((e) => e.seed)).toEqual(
        Array.from({ length: 32 }, (_, i) => i + 1),
      );

      const v = validateSeeding(r, new Map(masters.map((p) => [p.id, p])));
      expect(v.valid).toBe(true);
    }
  });

  it("gives every seed a stated reason", () => {
    const r = generateSeeding(masters, "masters", "hybrid");
    for (const e of r.entries) {
      expect(e.reason.length).toBeGreaterThan(10);
      expect(e.factors.length).toBeGreaterThan(0);
    }
  });
});
