import { describe, expect, it } from "vitest";
import {
  annotateConflicts,
  eligiblePlayers,
  generateRound,
  swapPlayers,
  validateRound,
} from "./pairing";
import { buildRecords, computeStandings } from "./standings";
import { buildSeed, DEMO_PLAYER_A, DEMO_PLAYER_B, TOURNAMENT } from "../domain/seed";
import { Pairing, Player, Tournament } from "../domain/types";

const seed = buildSeed();

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

describe("seeded demo data", () => {
  it("contains the specified tournament shape", () => {
    expect(seed.players).toHaveLength(128);
    expect(seed.players.filter((p) => p.checkIn === "checked-in")).toHaveLength(124);
    expect(seed.players.filter((p) => p.checkIn === "absent")).toHaveLength(3);
    expect(seed.players.filter((p) => p.checkIn === "late")).toHaveLength(1);
    expect(seed.divisions).toHaveLength(4);
  });

  it("assigns every player exactly once in each round", () => {
    for (let round = 1; round <= 5; round++) {
      const seen = new Set<string>();
      for (const p of seed.pairings.filter((x) => x.round === round)) {
        for (const id of [p.playerAId, p.playerBId].filter(Boolean) as string[]) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
      expect(seen.size).toBe(128);
    }
  });

  it("contains no repeat opponents across the played rounds", () => {
    const met = new Map<string, Set<string>>();
    for (const p of seed.pairings.filter((x) => x.playerBId !== null)) {
      const a = p.playerAId;
      const b = p.playerBId!;
      if (!met.has(a)) met.set(a, new Set());
      if (!met.has(b)) met.set(b, new Set());
      expect(met.get(a)!.has(b)).toBe(false);
      met.get(a)!.add(b);
      met.get(b)!.add(a);
    }
  });

  it("seats the guided-demo players on board 3 of round 5", () => {
    const ahmad = seed.players.find((p) => p.playerId === DEMO_PLAYER_A)!;
    const usman = seed.players.find((p) => p.playerId === DEMO_PLAYER_B)!;
    expect(ahmad.fullName).toBe("Ahmad Raza");
    expect(usman.fullName).toBe("Usman Ali");

    const board3 = seed.pairings.find((p) => p.round === 5 && p.board === 3)!;
    expect([board3.playerAId, board3.playerBId]).toContain(ahmad.id);
    expect([board3.playerAId, board3.playerBId]).toContain(usman.id);
  });

  it("leaves exactly three round 5 results pending verification", () => {
    const pending = seed.pairings.filter(
      (p) => p.round === 5 && p.status === "awaiting-verification",
    );
    expect(pending).toHaveLength(3);
    expect(pending.map((p) => p.board).sort((a, b) => a - b)).toEqual([14, 33, 51]);
  });

  it("generates round 6 cleanly from the seeded state", () => {
    const played = seed.pairings.map((p) =>
      p.round === 5 && p.status !== "bye"
        ? { ...p, status: "verified" as const, scoreA: p.scoreA ?? 430, scoreB: p.scoreB ?? 400 }
        : p,
    );
    const { pairings, unpaired } = generateRound({
      players: seed.players,
      pairings: played,
      tournament: { ...seed.tournament, currentRound: 6 },
      round: 6,
    });

    expect(unpaired).toHaveLength(0);
    const report = validateRound(pairings, seed.players);
    expect(report.duplicatePlayers).toBe(0);
    expect(report.unassignedPlayers).toBe(0);
  });
});
