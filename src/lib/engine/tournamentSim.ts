/**
 * A tournament simulator.
 *
 * Runs whole events through the real engine — generate, validate, score, stand, repeat — so
 * the properties that matter can be asserted over thousands of rounds instead of the one or
 * two a person can play by hand. Every claim the acceptance test makes about category
 * isolation, duplicate players, byes and tables is checked on every round of every
 * simulated tournament.
 *
 * It drives the production code. Nothing here re-implements pairing or standings: if the
 * simulator and the app ever disagree, the simulator is wrong and worth nothing.
 */

import { TOURNAMENT } from "@/lib/domain/seed";
import type { Pairing, Player, Tournament } from "@/lib/domain/types";

import { generateRound } from "./pairing";
import {
  validateRoundPlan,
  validateRosterForPairing,
  type Finding,
  type ValidatorBoard,
  type ValidatorPlayer,
  type ValidatorRules,
} from "./pairingValidator";
import { computeStandings } from "./standings";

export interface SimOptions {
  rounds: number;
  divisions: string[];
  /** How many players start in each division, by division id. */
  perDivision: Record<string, number>;
  rules: ValidatorRules;
  tournament?: Tournament;
  /** Seeded, so a failing run can be replayed exactly. */
  random: () => number;
  /** Withdraw one player after this round, to exercise the withdrawal path. */
  withdrawAfterRound?: { round: number; index: number };
  /** Hold one player back and add them after this round, for the late-arrival path. */
  lateArrivalAfterRound?: number;
}

export interface SimRoundReport {
  round: number;
  boards: ValidatorBoard[];
  findings: Finding[];
  blocking: Finding[];
}

export interface SimReport {
  rounds: SimRoundReport[];
  /** Every blocking finding across the whole event. The acceptance target is zero. */
  blocking: Finding[];
  players: number;
  matches: number;
  byes: number;
  /** Final order per division, from the app's own standings engine. */
  standings: Record<string, string[]>;
}

/**
 * A deterministic pseudo-random source.
 *
 * `Math.random` cannot reproduce a failure. A simulator that finds a one-in-four-thousand
 * pairing conflict and cannot say which tournament it happened in has found nothing
 * actionable.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    /* xorshift32 — small, fast, and good enough to shuffle a pairing pool. */
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** One synthetic player, complete enough for the engine and the standings to treat as real. */
function simPlayer(division: string, index: number, number: number): Player {
  return {
    id: `sim-${division}-${index}`,
    playerId: `S-${number}`,
    fullName: `${division} ${index}`,
    initials: "SP",
    avatarHue: 0,
    city: "Karachi",
    /*
     * Every third player has no club at all, and the blank is deliberate.
     *
     * The same-club constraint used to treat an empty string as a club, which made every
     * unaffiliated player a clubmate of every other one. A roster where a third of people
     * have no club is what catches that.
     */
    club: index % 3 === 0 ? "" : `Club ${index % 4}`,
    division,
    rating: 1600 - index * 13,
    ratingStatus: "rated",
    seed: index,
    wins: 0,
    losses: 0,
    draws: 0,
    spread: 0,
    rank: index,
    previousRank: index,
    checkIn: "checked-in",
    attendance: {},
    opponentHistory: [],
    boardHistory: [],
    byeRounds: [],
    tournamentHistory: [],
    emergencyContact: { name: "Contact", relationship: "Sibling", phone: "+92 300 0000000" },
    payment: "paid",
    registeredAt: "2026-06-01T00:00:00.000Z",
  };
}

/** Builds a roster with the requested shape. Ratings descend so seeding has something to do. */
export function simRoster(divisions: string[], perDivision: Record<string, number>): Player[] {
  const players: Player[] = [];
  let n = 0;

  for (const division of divisions) {
    const count = perDivision[division] ?? 0;
    for (let i = 1; i <= count; i += 1) {
      n += 1;
      players.push(simPlayer(division, i, 100 + n));
    }
  }

  return players;
}

/** The validator's view of a roster: who is expected in the round about to be drawn. */
function validatorPlayers(players: Player[], out: Set<string>): ValidatorPlayer[] {
  return players.map((p) => ({
    id: p.id,
    division: p.division,
    active: !out.has(p.id),
    withdrawn: out.has(p.id),
  }));
}

/**
 * Plays one tournament from check-in to final standings.
 *
 * The scores are invented; nothing derived from them is. Every win, loss, spread and
 * standing comes from the functions the app uses, which is the point — a standings bug
 * shows up here as a wrong order rather than as a different calculation.
 */
export function simulateTournament(options: SimOptions): SimReport {
  const {
    rounds,
    divisions,
    perDivision,
    rules,
    random,
    withdrawAfterRound,
    lateArrivalAfterRound,
  } = options;

  const tournament: Tournament = {
    ...(options.tournament ?? TOURNAMENT),
    divisions,
    currentRound: 1,
  };

  const roster = simRoster(divisions, perDivision);
  const withdrawn = new Set<string>();
  /* A late arrival starts off the active roster and joins it mid-event. */
  const notYetArrived = new Set<string>();

  if (lateArrivalAfterRound !== undefined) {
    const late = roster[roster.length - 1];
    if (late) notYetArrived.add(late.id);
  }

  const pairings: Pairing[] = [];
  const reports: SimRoundReport[] = [];
  const blocking: Finding[] = [];
  let matches = 0;
  let byes = 0;

  for (let round = 1; round <= rounds; round += 1) {
    const out = new Set([...withdrawn, ...notYetArrived]);
    const present = roster.filter((p) => !out.has(p.id));

    /* Fewer than two people left is the end of the event, not a failure of the round. */
    if (present.length < 2) break;

    const rosterCheck = validateRosterForPairing(validatorPlayers(roster, out), rules);
    blocking.push(...rosterCheck.blocking);

    const generated = generateRound({
      players: present,
      pairings,
      tournament,
      round,
      /* Only Swiss draws at random, and only in the opening round — see the app's own call. */
      random: tournament.system === "swiss" ? random : undefined,
    });

    const seated = seatByDivision(generated.pairings, divisions);

    const boards: ValidatorBoard[] = seated.map((p) => ({
      board: p.playerBId === null ? 0 : p.board,
      division: p.division,
      playerA: p.playerAId,
      playerB: p.playerBId,
      aPlaysFirst: p.aPlaysFirst ?? undefined,
    }));

    const check = validateRoundPlan(
      boards,
      validatorPlayers(roster, out),
      rules,
      historyFrom(pairings, round),
    );

    reports.push({ round, boards, findings: check.findings, blocking: check.blocking });
    blocking.push(...check.blocking);

    /* Results, so the next round has standings to pair on. */
    for (const p of seated) {
      pairings.push(scored(p, round, random));
      if (p.playerBId === null) byes += 1;
      else matches += 1;
    }

    if (withdrawAfterRound && withdrawAfterRound.round === round) {
      const victim = present[withdrawAfterRound.index % present.length];
      if (victim) withdrawn.add(victim.id);
    }

    if (lateArrivalAfterRound === round) notYetArrived.clear();
  }

  return {
    rounds: reports,
    blocking,
    players: roster.length,
    matches,
    byes,
    standings: finalStandings(roster, pairings, divisions, tournament, withdrawn),
  };
}

/**
 * Gives each division its own block of tables.
 *
 * The engine numbers boards 1..n *within* each division, so two divisions both start at
 * board 1 — one table, two games. The app resolves this from the director's table plan;
 * the simulator does the equivalent so a duplicate-table finding means a real fault rather
 * than an artefact of board numbering.
 */
function seatByDivision(pairings: Pairing[], divisions: string[]): Pairing[] {
  let next = 1;
  const out: Pairing[] = [];

  for (const division of divisions) {
    for (const p of pairings.filter((x) => x.division === division)) {
      if (p.playerBId === null) {
        out.push({ ...p, board: 0 });
        continue;
      }
      out.push({ ...p, board: next });
      next += 1;
    }
  }

  /* Anything filed under a division the event does not run keeps its number and is reported. */
  for (const p of pairings) {
    if (!divisions.includes(p.division)) out.push(p);
  }

  return out;
}

/** Opponent and bye history from the rounds already played. */
function historyFrom(pairings: Pairing[], round: number) {
  const opponents: Record<string, string[]> = {};
  const byes: Record<string, number> = {};

  for (const p of pairings.filter((x) => x.round < round)) {
    if (p.playerBId === null) {
      byes[p.playerAId] = (byes[p.playerAId] ?? 0) + 1;
      continue;
    }
    (opponents[p.playerAId] ??= []).push(p.playerBId);
    (opponents[p.playerBId] ??= []).push(p.playerAId);
  }

  return { opponents, byes };
}

/**
 * A plausible result.
 *
 * Verified, not merely entered: `buildRecords` counts a game only once its result is
 * verified, so a simulator that left these awaiting verification would produce a tournament
 * in which nobody ever won anything and every round paired on an empty table of standings.
 * Draws appear often enough to exercise the tie-break path.
 */
function scored(pairing: Pairing, round: number, random: () => number): Pairing {
  if (pairing.playerBId === null) {
    return { ...pairing, round, status: "bye" };
  }

  const a = 320 + Math.floor(random() * 140);
  const b = random() < 0.06 ? a : 320 + Math.floor(random() * 140);

  return { ...pairing, round, scoreA: a, scoreB: b, status: "verified" };
}

/** Final order per division, straight from the app's own standings engine. */
function finalStandings(
  roster: Player[],
  pairings: Pairing[],
  divisions: string[],
  tournament: Tournament,
  withdrawn: Set<string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const playing = roster.filter((p) => !withdrawn.has(p.id));

  for (const division of divisions) {
    if (!playing.some((p) => p.division === division)) continue;
    const rows = computeStandings(playing, pairings, tournament, { division });
    out[division] = rows.map((r) => r.playerId);
  }

  return out;
}
