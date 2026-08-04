import { describe, expect, it } from "vitest";
import { generateRound, validateRound } from "./pairing";
import { computeStandings } from "./standings";
import { DivisionId, Pairing, Player, Tournament } from "../domain/types";

/**
 * Odd fields and safety nets.
 *
 * This file previously walked the scripted guided-demo story, asserting that a
 * particular invented player moved from rank 3 to rank 1. That data is gone —
 * the platform ships with no players — and those assertions described a
 * fixture rather than the engine.
 *
 * What survives is the behaviour that actually matters on the day: an odd
 * field must produce exactly one bye and leave nobody unpaired, and validation
 * must notice when somebody has been left out.
 */

function makePlayers(count: number, division: DivisionId = "masters"): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    playerId: `T-${i + 1}`,
    fullName: `Player ${i + 1}`,
    initials: "PP",
    avatarHue: 0,
    city: "Karachi",
    club: `Club ${(i % 5) + 1}`,
    division,
    rating: 1900 - i * 10,
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
    emergencyContact: { name: "C", relationship: "Sibling", phone: "+92" },
    payment: "paid" as const,
    registeredAt: "2026-06-01T00:00:00.000Z",
  }));
}

const TOURNAMENT: Tournament = {
  id: "t-test",
  name: "Test Event",
  organizer: "Test",
  organizationId: "org-federation",
  venueId: "venue-1",
  city: "Karachi",
  startDate: "2026-08-08",
  endDate: "2026-08-08",
  timeZone: "Asia/Karachi",
  status: "live",
  system: "swiss",
  totalRounds: 6,
  currentRound: 1,
  divisions: ["masters"],
  rankingRules: ["wins", "spread"],
  constraints: {
    avoidRepeatOpponents: true,
    balanceStarts: true,
    avoidSameClub: false,
    respectAccessibility: true,
    maxRatingGap: 0,
    maxByesPerPlayer: 1,
    rankProximityWindow: 0,
  },
  gameMinutes: 25,
  breakMinutes: 10,
  visibility: "public",
  registrationOpen: false,
  registrationFee: 1200,
  currency: "PKR",
  capacity: 128,
  sponsors: [],
};

describe("odd fields and safety nets", () => {
  /** An odd field cannot pair evenly, so exactly one player must sit out. */
  it("pairs an odd division with exactly one bye and nobody unassigned", () => {
    const players = makePlayers(29);

    const { pairings } = generateRound({
      players,
      pairings: [],
      tournament: TOURNAMENT,
      round: 1,
    });

    const byes = pairings.filter((p) => p.playerBId === null);
    expect(byes).toHaveLength(1);

    const report = validateRound(pairings, players);
    expect(report.unassignedPlayers).toBe(0);
    expect(report.duplicatePlayers).toBe(0);
  });

  it("pairs an even division with no byes at all", () => {
    const players = makePlayers(30);

    const { pairings } = generateRound({
      players,
      pairings: [],
      tournament: TOURNAMENT,
      round: 1,
    });

    expect(pairings.filter((p) => p.playerBId === null)).toHaveLength(0);
    expect(validateRound(pairings, players).valid).toBe(true);
  });

  /** A player left out of a round would arrive and find no board. */
  it("validation reports an unassigned eligible player", () => {
    const players = makePlayers(16);

    const { pairings } = generateRound({
      players,
      pairings: [],
      tournament: TOURNAMENT,
      round: 1,
    });

    // Drop a board, leaving two players with nowhere to sit.
    const report = validateRound(pairings.slice(0, -1), players);
    expect(report.unassignedPlayers).toBe(2);
    expect(report.valid).toBe(false);
  });

  it("excludes absent players from the next round", () => {
    const players = makePlayers(16).map((p, i) =>
      i < 2 ? { ...p, checkIn: "absent" as const } : p,
    );

    const { pairings } = generateRound({
      players,
      pairings: [],
      tournament: TOURNAMENT,
      round: 1,
    });

    const seated = pairings.flatMap((p) =>
      [p.playerAId, p.playerBId].filter(Boolean),
    ) as string[];

    expect(seated).not.toContain("p1");
    expect(seated).not.toContain("p2");
    expect(seated).toHaveLength(14);
  });

  /** Standings derive from verified results, so an empty field yields none. */
  it("produces no standings before anything is played", () => {
    const players = makePlayers(8);
    const standings = computeStandings(players, [] as Pairing[], TOURNAMENT, {
      division: "masters",
    });

    expect(standings.every((row) => row.played === 0)).toBe(true);
  });
});
