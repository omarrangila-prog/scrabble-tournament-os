import { describe, expect, it } from "vitest";
import {
  annotateConflicts,
  eligiblePlayers,
  generateRound,
  markBye,
  pairUnpaired,
  swapPlayers,
  unpairPlayer,
  validateRound,
} from "./pairing";
import { buildRecords, computeStandings } from "./standings";
import { roundsForRoundRobin } from "../domain/pairingFormats";
import { TOURNAMENT } from "../domain/seed";
import { Pairing, Player, Tournament } from "../domain/types";


/** Minimal synthetic roster for focused engine tests. */
function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    playerId: `T-${i + 1}`,
    fullName: `Player ${i + 1}`,
    initials: "PP",
    avatarHue: 0,
    city: "Karachi",
    club: i % 2 === 0 ? "Club A" : "Club B",
    division: "masters" as const,
    rating: 2000 - i * 10,
    ratingStatus: "rated" as const,
    seed: i + 1,
    wins: 0,
    losses: 0,
    draws: 0,
    spread: 0,
    rank: i + 1,
    previousRank: i + 1,
    checkIn: "checked-in" as const,
    attendance: {},
    opponentHistory: [],
    boardHistory: [],
    byeRounds: [],
    tournamentHistory: [],
    emergencyContact: { name: "Contact", relationship: "Sibling", phone: "+92 300 0000000" },
    payment: "paid" as const,
    registeredAt: "2026-06-01T00:00:00.000Z",
  }));
}

const tournament: Tournament = {
  ...TOURNAMENT,
  divisions: ["masters"],
  currentRound: 1,
};

/** Eligible players who did not end up on any board. */
function unpairedCount(round: Pairing[], players: Player[]): number {
  const assigned = new Set(
    round.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean) as string[]),
  );
  return eligiblePlayers(players).filter((p) => !assigned.has(p.id)).length;
}

describe("pairing engine — player counts", () => {
  it("pairs an even field with every player assigned exactly once", () => {
    const players = makePlayers(16);
    const { pairings, unpaired } = generateRound({
      players,
      pairings: [],
      tournament,
      round: 1,
    });

    expect(unpaired).toHaveLength(0);
    expect(pairings.filter((p) => p.playerBId !== null)).toHaveLength(8);

    const seen = new Set<string>();
    for (const p of pairings) {
      for (const id of [p.playerAId, p.playerBId].filter(Boolean) as string[]) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(16);
  });

  it("allocates exactly one bye for an odd field", () => {
    const players = makePlayers(15);
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });

    const byes = pairings.filter((p) => p.playerBId === null);
    expect(byes).toHaveLength(1);
    expect(pairings.filter((p) => p.playerBId !== null)).toHaveLength(7);
    // Exactly one player sits out, and nobody is left unassigned.
    expect(unpairedCount(pairings, players)).toBe(0);
  });

  it("never pairs a player against themselves", () => {
    const players = makePlayers(24);
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    for (const p of pairings) {
      if (p.playerBId) expect(p.playerAId).not.toBe(p.playerBId);
    }
  });

  it("does not give a second bye while an alternative exists", () => {
    const players = makePlayers(15);
    const r1 = generateRound({ players, pairings: [], tournament, round: 1 });
    const firstBye = r1.pairings.find((p) => p.playerBId === null)!;

    const r2 = generateRound({
      players,
      pairings: r1.pairings.map((p) => ({ ...p, status: "verified" as const, scoreA: 400, scoreB: 380 })),
      tournament,
      round: 2,
    });
    const secondBye = r2.pairings.find((p) => p.playerBId === null)!;
    expect(secondBye.playerAId).not.toBe(firstBye.playerAId);
  });
});

describe("pairing engine — eligibility", () => {
  it("excludes withdrawn and absent players", () => {
    const players = makePlayers(16);
    players[0].checkIn = "withdrawn";
    players[1].checkIn = "absent";

    expect(eligiblePlayers(players)).toHaveLength(14);

    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    const assigned = pairings.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean));
    expect(assigned).not.toContain("p1");
    expect(assigned).not.toContain("p2");
    expect(assigned).toHaveLength(14);
  });
});

describe("pairing engine — repeat opponents", () => {
  it("avoids a rematch in the following round", () => {
    const players = makePlayers(8);
    const r1 = generateRound({ players, pairings: [], tournament, round: 1 });
    const played = r1.pairings.map((p) => ({
      ...p,
      status: "verified" as const,
      scoreA: 420,
      scoreB: 390,
    }));

    const r2 = generateRound({ players, pairings: played, tournament, round: 2 });
    const r1Keys = new Set(
      played.map((p) => [p.playerAId, p.playerBId].sort().join("|")),
    );
    for (const p of r2.pairings) {
      expect(r1Keys.has([p.playerAId, p.playerBId].sort().join("|"))).toBe(false);
    }
  });

  it("flags a repeat opponent that is forced into a round", () => {
    const players = makePlayers(4);
    const history: Pairing[] = [
      {
        id: "h1",
        tournamentId: tournament.id,
        round: 1,
        division: "masters",
        board: 1,
        playerAId: "p1",
        playerBId: "p2",
        scoreA: 400,
        scoreB: 380,
        status: "verified",
        locked: false,
        reason: "",
        confidence: 90,
        conflicts: [],
      },
    ];
    const forced: Pairing[] = [
      { ...history[0], id: "f1", round: 2, status: "scheduled" },
    ];
    const histMap = new Map<string, string[]>([
      ["p1", ["p2"]],
      ["p2", ["p1"]],
    ]);
    const annotated = annotateConflicts(forced, players, tournament, histMap);
    expect(annotated[0].conflicts.some((c) => c.kind === "repeat-opponent")).toBe(true);
  });
});

describe("pairing engine — locked pairings and manual changes", () => {
  it("preserves a locked pairing when regenerating", () => {
    const players = makePlayers(16);
    const locked: Pairing = {
      id: "lock-1",
      tournamentId: tournament.id,
      round: 2,
      division: "masters",
      board: 1,
      playerAId: "p1",
      playerBId: "p16",
      status: "scheduled",
      locked: true,
      reason: "Director-locked pairing.",
      confidence: 100,
      conflicts: [],
    };

    const { pairings } = generateRound({
      players,
      pairings: [],
      tournament,
      round: 2,
      locked: [locked],
    });

    const kept = pairings.find((p) => p.id === "lock-1");
    expect(kept).toBeDefined();
    expect(kept!.playerAId).toBe("p1");
    expect(kept!.playerBId).toBe("p16");

    // The locked players appear nowhere else.
    const others = pairings.filter((p) => p.id !== "lock-1");
    const ids = others.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean));
    expect(ids).not.toContain("p1");
    expect(ids).not.toContain("p16");
    expect(new Set(ids).size).toBe(14);
  });

  it("swaps two players between boards without duplicating anyone", () => {
    const players = makePlayers(8);
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    const a = pairings[0].playerAId;
    const b = pairings[1].playerBId!;

    const swapped = swapPlayers(pairings, players, tournament, a, b);
    expect(swapped[0].playerAId).toBe(b);
    expect(swapped[1].playerBId).toBe(a);

    const ids = swapped.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses to swap a player out of a locked pairing", () => {
    const players = makePlayers(8);
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    pairings[0].locked = true;

    const result = swapPlayers(
      pairings,
      players,
      tournament,
      pairings[0].playerAId,
      pairings[1].playerBId!,
    );
    expect(result).toBe(pairings);
  });
});

describe("pairing validation", () => {
  it("passes a clean round", () => {
    const players = makePlayers(16);
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    const report = validateRound(pairings, players);

    expect(report.valid).toBe(true);
    expect(report.duplicatePlayers).toBe(0);
    expect(report.repeatOpponents).toBe(0);
    expect(report.unassignedPlayers).toBe(0);
    expect(report.pairingCount).toBe(8);
  });

  it("detects a duplicate assignment", () => {
    const players = makePlayers(8);
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    // Force p1 onto a second board.
    pairings[1].playerAId = pairings[0].playerAId;

    const report = validateRound(pairings, players);
    expect(report.duplicatePlayers).toBeGreaterThan(0);
    expect(report.valid).toBe(false);
  });

  it("detects an unassigned eligible player", () => {
    const players = makePlayers(8);
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    const report = validateRound(pairings.slice(0, 3), players);
    expect(report.unassignedPlayers).toBe(2);
    expect(report.valid).toBe(false);
  });

  it("treats an acknowledged conflict as an approved exception", () => {
    const players = makePlayers(4);
    const round: Pairing[] = [
      {
        id: "x1",
        tournamentId: tournament.id,
        round: 2,
        division: "masters",
        board: 1,
        playerAId: "p1",
        playerBId: "p2",
        status: "scheduled",
        locked: false,
        reason: "",
        confidence: 80,
        conflicts: [
          {
            kind: "repeat-opponent",
            severity: "critical",
            message: "Repeat opponent.",
            acknowledgedReason: "Approved by the Tournament Director — no alternative pairing available.",
          },
        ],
      },
      {
        id: "x2",
        tournamentId: tournament.id,
        round: 2,
        division: "masters",
        board: 2,
        playerAId: "p3",
        playerBId: "p4",
        status: "scheduled",
        locked: false,
        reason: "",
        confidence: 90,
        conflicts: [],
      },
    ];

    const report = validateRound(round, players);
    expect(report.approvedExceptions).toBe(1);
    expect(report.repeatOpponents).toBe(0);
    expect(report.valid).toBe(true);
  });
});

describe("standings", () => {
  it("counts only verified results", () => {
    const players = makePlayers(4);
    const pairings: Pairing[] = [
      {
        id: "s1", tournamentId: tournament.id, round: 1, division: "masters", board: 1,
        playerAId: "p1", playerBId: "p2", scoreA: 500, scoreB: 400,
        status: "verified", locked: false, reason: "", confidence: 90, conflicts: [],
      },
      {
        id: "s2", tournamentId: tournament.id, round: 1, division: "masters", board: 2,
        playerAId: "p3", playerBId: "p4", scoreA: 450, scoreB: 300,
        status: "live", locked: false, reason: "", confidence: 90, conflicts: [],
      },
    ];

    const records = buildRecords(players, pairings);
    expect(records.get("p1")!.wins).toBe(1);
    expect(records.get("p1")!.spread).toBe(100);
    expect(records.get("p2")!.losses).toBe(1);
    // The live game contributes nothing until it is verified.
    expect(records.get("p3")!.played).toBe(0);
    expect(records.get("p3")!.spread).toBe(0);
  });

  it("handles a tie as half a point each", () => {
    const players = makePlayers(2);
    const pairings: Pairing[] = [
      {
        id: "t1", tournamentId: tournament.id, round: 1, division: "masters", board: 1,
        playerAId: "p1", playerBId: "p2", scoreA: 420, scoreB: 420,
        status: "verified", locked: false, reason: "", confidence: 90, conflicts: [],
      },
    ];
    const records = buildRecords(players, pairings);
    expect(records.get("p1")!.draws).toBe(1);
    expect(records.get("p2")!.draws).toBe(1);
    expect(records.get("p1")!.points).toBe(0.5);
    expect(records.get("p1")!.spread).toBe(0);
    expect(records.get("p1")!.wins).toBe(0);
  });

  it("scores a bye as a win", () => {
    const players = makePlayers(3);
    const pairings: Pairing[] = [
      {
        id: "b1", tournamentId: tournament.id, round: 1, division: "masters", board: 0,
        playerAId: "p3", playerBId: null,
        status: "bye", locked: false, reason: "", confidence: 100, conflicts: [],
      },
    ];
    const records = buildRecords(players, pairings);
    expect(records.get("p3")!.wins).toBe(1);
    expect(records.get("p3")!.byes).toBe(1);
    expect(records.get("p3")!.spread).toBe(50);
  });

  it("ranks by wins, then spread", () => {
    const players = makePlayers(4);
    const pairings: Pairing[] = [
      {
        id: "r1", tournamentId: tournament.id, round: 1, division: "masters", board: 1,
        playerAId: "p1", playerBId: "p2", scoreA: 500, scoreB: 400,
        status: "verified", locked: false, reason: "", confidence: 90, conflicts: [],
      },
      {
        id: "r2", tournamentId: tournament.id, round: 1, division: "masters", board: 2,
        playerAId: "p3", playerBId: "p4", scoreA: 500, scoreB: 300,
        status: "verified", locked: false, reason: "", confidence: 90, conflicts: [],
      },
    ];

    const table = computeStandings(players, pairings, { ...tournament, currentRound: 1 });
    // p3 won by 200, p1 by 100 — both 1–0.
    expect(table[0].playerId).toBe("p3");
    expect(table[1].playerId).toBe("p1");
    expect(table[0].rank).toBe(1);
  });

  it("recalculates immediately when a score is corrected", () => {
    const players = makePlayers(4);
    const pairings: Pairing[] = [
      {
        id: "c1", tournamentId: tournament.id, round: 1, division: "masters", board: 1,
        playerAId: "p1", playerBId: "p2", scoreA: 500, scoreB: 400,
        status: "verified", locked: false, reason: "", confidence: 90, conflicts: [],
      },
      {
        id: "c2", tournamentId: tournament.id, round: 1, division: "masters", board: 2,
        playerAId: "p3", playerBId: "p4", scoreA: 450, scoreB: 440,
        status: "verified", locked: false, reason: "", confidence: 90, conflicts: [],
      },
    ];

    const before = computeStandings(players, pairings, { ...tournament, currentRound: 1 });
    expect(before[0].playerId).toBe("p1");

    // Correction: p3 actually won by a much larger margin.
    const corrected = pairings.map((p) =>
      p.id === "c2" ? { ...p, scoreA: 600, scoreB: 300 } : p,
    );
    const after = computeStandings(players, corrected, { ...tournament, currentRound: 1 });
    expect(after[0].playerId).toBe("p3");
    expect(after[0].spread).toBe(300);
  });
});

/**
 * A full tournament, played through five rounds from an explicit field.
 *
 * These tests previously asserted properties of the platform's fabricated demo
 * data — that it held exactly 128 players, that board 3 seated a particular
 * invented name. That data is gone, and those assertions tested the fixture
 * rather than the engine. What matters is the invariants: everyone paired once
 * per round, nobody meeting twice, and a clean next round from any state.
 */
describe("a full tournament, end to end", () => {
  const FIELD = 64;
  const players = makePlayers(FIELD);

  /** Plays rounds 1 to 5, verifying every result as it goes. */
  const playThrough = () => {
    let pairings: Pairing[] = [];

    for (let round = 1; round <= 5; round++) {
      const { pairings: fresh } = generateRound({
        players,
        pairings,
        tournament: { ...tournament, currentRound: round },
        round,
      });

      pairings = [
        ...pairings,
        ...fresh.map((p, i) =>
          p.playerBId === null
            ? p
            : {
                ...p,
                status: "verified" as const,
                // Deterministic, alternating margins so standings separate.
                scoreA: 400 + (i % 7) * 10,
                scoreB: 380 + ((i + 3) % 7) * 10,
              },
        ),
      ];
    }

    return pairings;
  };

  it("pairs every player exactly once in each round", () => {
    const pairings = playThrough();

    for (let round = 1; round <= 5; round++) {
      const seen = new Set<string>();
      for (const p of pairings.filter((x) => x.round === round)) {
        for (const id of [p.playerAId, p.playerBId].filter(Boolean) as string[]) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
      expect(seen.size).toBe(FIELD);
    }
  });

  /** The property the backtracking fold exists to guarantee. */
  it("never pairs the same two players twice", () => {
    const met = new Map<string, Set<string>>();

    for (const p of playThrough().filter((x) => x.playerBId !== null)) {
      const a = p.playerAId;
      const b = p.playerBId!;
      if (!met.has(a)) met.set(a, new Set());
      if (!met.has(b)) met.set(b, new Set());

      expect(met.get(a)!.has(b)).toBe(false);
      met.get(a)!.add(b);
      met.get(b)!.add(a);
    }
  });

  it("generates a clean sixth round from the played state", () => {
    const { pairings, unpaired } = generateRound({
      players,
      pairings: playThrough(),
      tournament: { ...tournament, currentRound: 6 },
      round: 6,
    });

    expect(unpaired).toHaveLength(0);

    const report = validateRound(pairings, players);
    expect(report.duplicatePlayers).toBe(0);
    expect(report.unassignedPlayers).toBe(0);
  });
});

/**
 * The same invariants as above, swept across the field sizes a real event actually
 * produces — including the ones a 64-player fixture never exercises: a field too small to
 * avoid a repeat by round 3, a field of exactly 2, and byes recurring often enough in a
 * small field to test that nobody sits out twice while an alternative exists.
 *
 * Phase 1 of the reliability rebuild asks for this sweep by name: every active player
 * exactly once, the right match count, the right bye count, no duplicate table, nobody
 * paired against themselves, and repeats only when the field has run out of legal
 * opponents.
 */
describe("pairing engine — property sweep across field sizes", () => {
  const SIZES = [2, 3, 4, 5, 7, 8, 17, 21, 42, 71];
  const ROUNDS = 5;

  for (const size of SIZES) {
    it(`field of ${size}: every round is structurally sound for ${ROUNDS} rounds`, () => {
      const players = makePlayers(size);
      let pairings: Pairing[] = [];
      const byeCounts = new Map<string, number>();
      const everMet = new Map<string, Set<string>>();
      let repeatsForced = 0;

      for (let round = 1; round <= ROUNDS; round++) {
        const { pairings: fresh, unpaired } = generateRound({
          players,
          pairings,
          tournament: { ...tournament, currentRound: round },
          round,
        });

        expect(unpaired).toHaveLength(0);
        const seen = new Set<string>();
        for (const p of fresh) {
          for (const id of [p.playerAId, p.playerBId].filter(Boolean) as string[]) {
            expect(seen.has(id)).toBe(false);
            seen.add(id);
          }
        }
        expect(seen.size).toBe(size);

        const byes = fresh.filter((p) => p.playerBId === null);
        expect(byes).toHaveLength(size % 2 === 0 ? 0 : 1);
        for (const b of byes) {
          byeCounts.set(b.playerAId, (byeCounts.get(b.playerAId) ?? 0) + 1);
        }

        const boards = fresh.map((p) => p.board);
        expect(new Set(boards).size).toBe(boards.length);

        for (const p of fresh) {
          if (p.playerBId) expect(p.playerAId).not.toBe(p.playerBId);
        }

        for (const p of fresh.filter((x) => x.playerBId !== null)) {
          const a = p.playerAId;
          const b = p.playerBId!;
          if (!everMet.has(a)) everMet.set(a, new Set());
          if (!everMet.has(b)) everMet.set(b, new Set());
          if (everMet.get(a)!.has(b)) {
            repeatsForced++;
            expect(p.conflicts.some((c) => c.kind === "repeat-opponent")).toBe(true);
          }
          everMet.get(a)!.add(b);
          everMet.get(b)!.add(a);
        }

        pairings = [
          ...pairings,
          ...fresh.map((p, i) =>
            p.playerBId === null
              ? p
              : {
                  ...p,
                  status: "verified" as const,
                  scoreA: 400 + (i % 7) * 10,
                  scoreB: 380 + ((i + 3) % 7) * 10,
                },
          ),
        ];
      }

      if (size > ROUNDS) {
        const max = Math.max(0, ...byeCounts.values());
        expect(max).toBeLessThanOrEqual(1);
      }

      if (size >= 2 * ROUNDS) {
        expect(repeatsForced).toBe(0);
      }
    });
  }
});

describe("pairing engine — same-club conflict", () => {
  /*
   * `roster.ts` hardcodes `club: "—"` for every player read from the database — there is no
   * real club/school field on a registration today. Before this guard, `a.club === b.club`
   * matched every single pairing, because every unaffiliated player's placeholder was
   * identical to every other one's.
   */
  it("does not flag two players who both have no club on file", () => {
    const players = makePlayers(8).map((p) => ({ ...p, club: "—" }));
    const { pairings } = generateRound({ players, pairings: [], tournament, round: 1 });
    const flagged = pairings.filter((p) => p.conflicts.some((c) => c.kind === "same-club"));
    expect(flagged).toHaveLength(0);
  });

  it("still flags two players who genuinely share a real club", () => {
    const players = makePlayers(4).map((p, i) => ({ ...p, club: i < 2 ? "Same School" : "—" }));
    const round: Pairing[] = [
      {
        id: "sc1", tournamentId: tournament.id, round: 1, division: "masters", board: 1,
        playerAId: players[0].id, playerBId: players[1].id,
        status: "scheduled", locked: false, reason: "", confidence: 90, conflicts: [],
      },
    ];
    const withConflicts = annotateConflicts(round, players, tournament, new Map());
    expect(withConflicts[0].conflicts.some((c) => c.kind === "same-club")).toBe(true);
  });
});

/** Plays out a full round robin, round by round, tracking who has met whom and who sat out. */
function playRoundRobin(players: Player[], rounds: number) {
  const rrTournament: Tournament = { ...tournament, system: "round-robin" };
  let pairings: Pairing[] = [];
  const met = new Map<string, Set<string>>();
  const byeCounts = new Map<string, number>();
  const roundsById: Pairing[][] = [];

  for (const p of players) met.set(p.id, new Set());

  for (let round = 1; round <= rounds; round++) {
    const { pairings: fresh, unpaired } = generateRound({
      players,
      pairings,
      tournament: rrTournament,
      round,
    });
    expect(unpaired).toHaveLength(0);
    roundsById.push(fresh);

    for (const p of fresh) {
      if (p.playerBId === null) {
        byeCounts.set(p.playerAId, (byeCounts.get(p.playerAId) ?? 0) + 1);
        continue;
      }
      // Never a repeat within one pass through the fixture.
      expect(met.get(p.playerAId)!.has(p.playerBId)).toBe(false);
      met.get(p.playerAId)!.add(p.playerBId);
      met.get(p.playerBId)!.add(p.playerAId);
    }

    pairings = [
      ...pairings,
      ...fresh.map((p) => (p.playerBId === null ? p : { ...p, status: "verified" as const, scoreA: 400, scoreB: 380 })),
    ];
  }

  return { roundsById, met, byeCounts };
}

describe("pairing engine — round robin", () => {
  it("pairs every player with every other player exactly once, even field", () => {
    const players = makePlayers(6);
    const needed = roundsForRoundRobin(6);
    expect(needed).toBe(5);

    const { roundsById, met } = playRoundRobin(players, needed);

    for (const round of roundsById) expect(round.some((p) => p.playerBId === null)).toBe(false);
    for (const p of players) expect(met.get(p.id)!.size).toBe(players.length - 1);
  });

  it("pairs every player with every other player exactly once, odd field, with one bye per round", () => {
    const players = makePlayers(5);
    const needed = roundsForRoundRobin(5);
    expect(needed).toBe(5);

    const { roundsById, met, byeCounts } = playRoundRobin(players, needed);

    for (const round of roundsById) expect(round.filter((p) => p.playerBId === null)).toHaveLength(1);
    for (const p of players) expect(met.get(p.id)!.size).toBe(players.length - 1);
    // Five players, five rounds, one bye each round: every player sits out exactly once.
    for (const p of players) expect(byeCounts.get(p.id) ?? 0).toBe(1);
  });

  it("cycles the fixture rather than pairing nobody once the schedule is exhausted", () => {
    const players = makePlayers(6);
    const needed = roundsForRoundRobin(6);
    const rrTournament: Tournament = { ...tournament, system: "round-robin" };

    const round1 = generateRound({ players, pairings: [], tournament: rrTournament, round: 1 });
    const roundAfterCycle = generateRound({
      players,
      pairings: [],
      tournament: rrTournament,
      round: needed + 1,
    });

    const shape = (r: Pairing[]) =>
      r
        .map((p) => [p.playerAId, p.playerBId].sort().join("-"))
        .sort()
        .join("|");
    expect(shape(roundAfterCycle.pairings)).toBe(shape(round1.pairings));
  });

  it("does not flag the cycled repeat as a repeat-opponent conflict", () => {
    const players = makePlayers(4);
    const needed = roundsForRoundRobin(4);
    const rrTournament: Tournament = { ...tournament, system: "round-robin" };

    let pairings: Pairing[] = [];
    for (let round = 1; round <= needed; round++) {
      const { pairings: fresh } = generateRound({ players, pairings, tournament: rrTournament, round });
      pairings = [...pairings, ...fresh.map((p) => ({ ...p, status: "verified" as const, scoreA: 400, scoreB: 380 }))];
    }

    const { pairings: cycled } = generateRound({ players, pairings, tournament: rrTournament, round: needed + 1 });
    for (const p of cycled) expect(p.conflicts.some((c) => c.kind === "repeat-opponent")).toBe(false);
  });
});

describe("pairing engine — king of the hill", () => {
  const kothTournament: Tournament = { ...tournament, system: "king-of-the-hill" };

  it("pairs first against second, third against fourth, by current standings", () => {
    const players = makePlayers(8);
    // Give player 8 (lowest rating) two wins so they lead the standings.
    const history: Pairing[] = [
      {
        id: "h1", tournamentId: tournament.id, round: 1, division: "masters", board: 1,
        playerAId: "p8", playerBId: "p7", status: "verified", locked: false, reason: "", confidence: 90,
        conflicts: [], scoreA: 450, scoreB: 300,
      },
    ];

    const { pairings } = generateRound({ players, pairings: history, tournament: kothTournament, round: 2 });
    const board1 = pairings.find((p) => p.board === 1)!;
    // p8 leads on the one result so far; standings order puts them first.
    expect([board1.playerAId, board1.playerBId]).toContain("p8");
  });

  it("does not avoid repeats — leaders keep meeting leaders without a conflict flag", () => {
    const players = makePlayers(4);
    let pairings: Pairing[] = [];

    for (let round = 1; round <= 3; round++) {
      const { pairings: fresh } = generateRound({ players, pairings, tournament: kothTournament, round });
      // Same two players lead every round (nobody's record changes), so board 1 repeats.
      if (round > 1) {
        const board1 = fresh.find((p) => p.board === 1)!;
        expect(board1.conflicts.some((c) => c.kind === "repeat-opponent")).toBe(false);
      }
      pairings = [...pairings, ...fresh.map((p) => (p.playerBId === null ? p : { ...p, status: "verified" as const, scoreA: 400, scoreB: 380 }))];
    }
  });

  it("gives the bye to the lowest-ranked eligible player without one yet", () => {
    const players = makePlayers(5);
    const { pairings } = generateRound({ players, pairings: [], tournament: kothTournament, round: 1 });
    const bye = pairings.find((p) => p.playerBId === null)!;
    // makePlayers ranks p5 lowest (rating descends with index) and nobody has a bye yet.
    expect(bye.playerAId).toBe("p5");
  });
});

describe("pairing engine — manual", () => {
  const manualTournament: Tournament = { ...tournament, system: "manual" };

  it("pairs nothing automatically — every eligible player comes back unpaired", () => {
    const players = makePlayers(6);
    const { pairings, unpaired } = generateRound({ players, pairings: [], tournament: manualTournament, round: 1 });
    expect(pairings).toHaveLength(0);
    expect(unpaired.sort()).toEqual(players.map((p) => p.id).sort());
  });

  it("pairUnpaired creates a board from two unpaired players", () => {
    const players = makePlayers(4);
    const next = pairUnpaired([], players, manualTournament, 1, "p1", "p2");
    expect(next).toHaveLength(1);
    expect([next[0].playerAId, next[0].playerBId].sort()).toEqual(["p1", "p2"]);
    expect(next[0].round).toBe(1);
  });

  it("pairUnpaired refuses a player already seated", () => {
    const players = makePlayers(4);
    const once = pairUnpaired([], players, manualTournament, 1, "p1", "p2");
    const twice = pairUnpaired(once, players, manualTournament, 1, "p1", "p3");
    expect(twice).toBe(once);
  });

  it("pairUnpaired refuses across divisions", () => {
    const players = makePlayers(4).map((p, i) => ({ ...p, division: i < 2 ? "masters" as const : "advanced" as const }));
    const next = pairUnpaired([], players, manualTournament, 1, "p1", "p3");
    expect(next).toHaveLength(0);
  });

  it("unpairPlayer removes their board entirely", () => {
    const players = makePlayers(4);
    const paired = pairUnpaired([], players, manualTournament, 1, "p1", "p2");
    const back = unpairPlayer(paired, "p1");
    expect(back).toHaveLength(0);
  });

  it("markBye adds a bye and refuses a player already seated", () => {
    const players = makePlayers(4);
    const withBye = markBye([], players, manualTournament, 1, "p1");
    expect(withBye).toHaveLength(1);
    expect(withBye[0].playerBId).toBeNull();

    const again = markBye(withBye, players, manualTournament, 1, "p1");
    expect(again).toBe(withBye);
  });
});

describe("pairing engine — swapPlayers refuses across divisions", () => {
  it("leaves the round unchanged when the two players are in different divisions", () => {
    const players = makePlayers(4).map((p, i) => ({ ...p, division: i < 2 ? "masters" as const : "advanced" as const }));
    const round: Pairing[] = [
      {
        id: "b1", tournamentId: tournament.id, round: 1, division: "masters", board: 1,
        playerAId: "p1", playerBId: "p2", status: "scheduled", locked: false, reason: "", confidence: 90, conflicts: [],
      },
      {
        id: "b2", tournamentId: tournament.id, round: 1, division: "advanced", board: 2,
        playerAId: "p3", playerBId: "p4", status: "scheduled", locked: false, reason: "", confidence: 90, conflicts: [],
      },
    ];

    const result = swapPlayers(round, players, tournament, "p1", "p3");
    expect(result).toBe(round);
  });
});
