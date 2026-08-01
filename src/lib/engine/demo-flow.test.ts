import { describe, expect, it } from "vitest";
import { buildSeed, DEMO_PLAYER_A, DEMO_PLAYER_B } from "../domain/seed";
import { computeStandings } from "./standings";
import { generateRound, validateRound } from "./pairing";
import { Pairing } from "../domain/types";

/**
 * Walks the exact ten-step guided demo story and asserts the outcomes the
 * presenter will show the client.
 */
describe("guided demo story", () => {
  it("board 3 verification lifts Ahmad Raza from rank 3 to rank 1", () => {
    const seed = buildSeed();
    const ahmad = seed.players.find((p) => p.playerId === DEMO_PLAYER_A)!;
    const usman = seed.players.find((p) => p.playerId === DEMO_PLAYER_B)!;

    const before = computeStandings(seed.players, seed.pairings, seed.tournament, {
      division: "masters",
    });
    expect(before.find((r) => r.playerId === ahmad.id)!.rank).toBe(3);

    // Step 5 + 6: enter and verify Ahmad Raza 498 – Usman Ali 472.
    const board3 = seed.pairings.find((p) => p.round === 5 && p.board === 3)!;
    const ahmadIsA = board3.playerAId === ahmad.id;
    const played: Pairing[] = seed.pairings.map((p) =>
      p.id === board3.id
        ? {
            ...p,
            scoreA: ahmadIsA ? 498 : 472,
            scoreB: ahmadIsA ? 472 : 498,
            status: "verified" as const,
          }
        : p,
    );

    const after = computeStandings(seed.players, played, seed.tournament, {
      division: "masters",
    });
    expect(after.find((r) => r.playerId === ahmad.id)!.rank).toBe(1);
    // Usman was rank 1 on 4-0; the loss must move him down.
    expect(after.find((r) => r.playerId === usman.id)!.rank).toBeGreaterThan(1);
  });

  it("round 6 generates cleanly once round 5 is complete", () => {
    const seed = buildSeed();
    const complete: Pairing[] = seed.pairings.map((p) =>
      p.round === 5 && p.playerBId !== null
        ? { ...p, status: "verified" as const, scoreA: p.scoreA ?? 445, scoreB: p.scoreB ?? 402 }
        : p,
    );

    const { pairings, unpaired } = generateRound({
      players: seed.players,
      pairings: complete,
      tournament: { ...seed.tournament, currentRound: 6 },
      round: 6,
    });

    const report = validateRound(pairings, seed.players);
    expect(unpaired).toHaveLength(0);
    expect(report.duplicatePlayers).toBe(0);
    expect(report.unassignedPlayers).toBe(0);
    expect(report.repeatOpponents).toBe(0);
    expect(report.boardConflicts).toBe(0);
    expect(report.valid).toBe(true);

    // No player faces someone they have already met.
    const met = new Map<string, Set<string>>();
    for (const p of complete.filter((x) => x.playerBId !== null)) {
      if (!met.has(p.playerAId)) met.set(p.playerAId, new Set());
      if (!met.has(p.playerBId!)) met.set(p.playerBId!, new Set());
      met.get(p.playerAId)!.add(p.playerBId!);
      met.get(p.playerBId!)!.add(p.playerAId);
    }
    for (const p of pairings.filter((x) => x.playerBId !== null)) {
      expect(met.get(p.playerAId)?.has(p.playerBId!) ?? false).toBe(false);
    }
  });

  it("absent players are excluded from the next round", () => {
    const seed = buildSeed();
    const absent = seed.players.filter((p) => p.checkIn === "absent");
    expect(absent.length).toBeGreaterThan(0);

    const complete: Pairing[] = seed.pairings.map((p) =>
      p.round === 5 && p.playerBId !== null
        ? { ...p, status: "verified" as const, scoreA: p.scoreA ?? 445, scoreB: p.scoreB ?? 402 }
        : p,
    );
    const { pairings } = generateRound({
      players: seed.players,
      pairings: complete,
      tournament: { ...seed.tournament, currentRound: 6 },
      round: 6,
    });

    const assigned = pairings.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean));
    for (const a of absent) expect(assigned).not.toContain(a.id);
  });

  it("the seeded score mismatch is detectable on board 22", () => {
    const seed = buildSeed();
    const board22 = seed.pairings.find((p) => p.round === 5 && p.board === 22)!;
    const subs = seed.submissions.filter((s) => s.pairingId === board22.id);
    expect(subs).toHaveLength(2);
    expect(subs[0].scoreA).toBe(subs[1].scoreA);
    expect(subs[0].scoreB).not.toBe(subs[1].scoreB);
  });
});

describe("odd fields and safety nets", () => {
  it("pairs an odd division with exactly one bye and nobody unassigned", () => {
    const seed = buildSeed();
    // Masters already has one absent player, so withdrawing two more leaves an
    // odd eligible field of 29 and forces a bye.
    let withdrawn = 0;
    const players = seed.players.map((p) => {
      if (p.division === "masters" && p.checkIn === "checked-in" && withdrawn < 2) {
        withdrawn += 1;
        return { ...p, checkIn: "withdrawn" as const };
      }
      return p;
    });
    expect(
      players.filter((p) => p.division === "masters" && p.checkIn !== "withdrawn" && p.checkIn !== "absent"),
    ).toHaveLength(29);
    const complete: Pairing[] = seed.pairings.map((p) =>
      p.round === 5 && p.playerBId !== null
        ? { ...p, status: "verified" as const, scoreA: p.scoreA ?? 445, scoreB: p.scoreB ?? 402 }
        : p,
    );

    const { pairings } = generateRound({
      players,
      pairings: complete,
      tournament: { ...seed.tournament, currentRound: 6 },
      round: 6,
    });

    const mastersByes = pairings.filter((p) => p.division === "masters" && p.playerBId === null);
    expect(mastersByes).toHaveLength(1);

    const report = validateRound(pairings, players);
    expect(report.unassignedPlayers).toBe(0);
    expect(report.duplicatePlayers).toBe(0);
  });

  it("validation reports an unassigned eligible player", () => {
    const seed = buildSeed();
    const round = seed.pairings.filter((p) => p.round === 5).slice(0, 5);
    const report = validateRound(round, seed.players);
    expect(report.unassignedPlayers).toBeGreaterThan(0);
    expect(report.valid).toBe(false);
  });
});
