/**
 * Swiss pairing engine.
 *
 * Deterministic and explainable: the same inputs always produce the same
 * pairings, and every pairing carries a plain-language reason. This is a
 * demonstration engine — it is not certified by any rating body, and every
 * result is presented for director review before publication.
 */

import {
  ConflictKind,
  Pairing,
  PairingConflict,
  PairingConstraints,
  Player,
  Tournament,
} from "../domain/types";
import { roundsForRoundRobin } from "../domain/pairingFormats";
import { buildRecords, compareByRules, PlayerRecord } from "./standings";

export interface PairingInput {
  players: Player[];
  pairings: Pairing[];
  tournament: Tournament;
  round: number;
  /** Pairings the director locked; carried through untouched. */
  locked?: Pairing[];
  /**
   * A source of randomness for the opening round.
   *
   * With no results yet, every player's record is identical, so the ranking rules fall
   * through to their last tie-break and the queue comes out in a fixed order — near enough
   * alphabetical. Folding that queue seats the two people whose names sort next to each
   * other opposite one another, which at a family event means brothers playing brothers on
   * board one.
   *
   * Pass `Math.random` to shuffle the opening queue instead. Later rounds ignore this
   * entirely: once games have been played the order is the standings, and that must not be
   * disturbed. Omitted, nothing changes — which is what keeps the engine's tests exact.
   */
  random?: () => number;
}

export interface PairingResult {
  pairings: Pairing[];
  unpaired: string[];
}

/** Players who may be paired this round. */
export function eligiblePlayers(players: Player[]): Player[] {
  return players.filter(
    (p) => p.checkIn !== "withdrawn" && p.checkIn !== "absent",
  );
}

/**
 * Detects every rule violation on a single pairing. Kept pure so both the
 * generator and the manual-adjustment UI report conflicts identically.
 */
function detectConflicts(
  pairing: Pairing,
  players: Map<string, Player>,
  history: Map<string, string[]>,
  byes: Map<string, number>,
  constraints: PairingConstraints,
  accessibleBoards: number[],
  seenThisRound: Map<string, number>,
): PairingConflict[] {
  const conflicts: PairingConflict[] = [];
  const a = players.get(pairing.playerAId);
  const b = pairing.playerBId ? players.get(pairing.playerBId) : null;
  if (!a) return conflicts;

  const push = (kind: ConflictKind, severity: "critical" | "warning", message: string) =>
    conflicts.push({ kind, severity, message });

  // A player may never appear on two boards in the same round.
  for (const id of [pairing.playerAId, pairing.playerBId].filter(Boolean) as string[]) {
    if ((seenThisRound.get(id) ?? 0) > 1) {
      push(
        "duplicate-assignment",
        "critical",
        `${players.get(id)?.fullName ?? id} is assigned to more than one board this round.`,
      );
    }
  }

  if (pairing.playerBId === null) {
    if ((byes.get(pairing.playerAId) ?? 0) > constraints.maxByesPerPlayer) {
      push(
        "already-had-bye",
        "critical",
        `${a.fullName} has already received a bye in this tournament.`,
      );
    }
  }

  if (b) {
    if (constraints.avoidRepeatOpponents && (history.get(a.id) ?? []).includes(b.id)) {
      push(
        "repeat-opponent",
        "critical",
        `${a.fullName} and ${b.fullName} have already played each other in this tournament.`,
      );
    }

    if (a.checkIn === "withdrawn" || b.checkIn === "withdrawn") {
      push("withdrawn-player", "critical", "A withdrawn player is included in this pairing.");
    }

    /*
     * `"—"` is the roster's placeholder for "no club on file" (`roster.ts`), not a club
     * called dash. Two players with no club recorded are not thereby clubmates — before
     * this guard, every pairing at all was flagged, because every unaffiliated player's
     * placeholder matched every other one's. That went unnoticed only because nothing had
     * ever rendered a conflict list to a human.
     */
    if (
      constraints.avoidSameClub &&
      a.club &&
      b.club &&
      a.club !== "—" &&
      b.club !== "—" &&
      a.club === b.club
    ) {
      push(
        "same-club",
        "warning",
        `Both players represent ${a.club}. Same-club pairings are discouraged by the current settings.`,
      );
    }

    const gap = Math.abs((a.rating || 0) - (b.rating || 0));
    if (a.rating && b.rating && gap > constraints.maxRatingGap) {
      push(
        "rating-gap",
        "warning",
        `Rating difference is ${gap}, above the configured threshold of ${constraints.maxRatingGap}.`,
      );
    }

    if (constraints.respectAccessibility) {
      const needsAccess = [a, b].filter((p) => p.accommodation?.toLowerCase().includes("wheelchair"));
      if (needsAccess.length > 0 && !accessibleBoards.includes(pairing.board)) {
        push(
          "accessibility",
          "critical",
          `${needsAccess[0].fullName} requires a ground-floor board. Board ${pairing.board} is not accessible.`,
        );
      }
    }
  }

  return conflicts;
}

/** Explains, in plain language, why two players were put together. */
function explain(
  a: Player,
  b: Player | null,
  ra: PlayerRecord,
  rb: PlayerRecord | null,
  rankA: number,
  rankB: number,
): string {
  if (!b || !rb) {
    return "Odd number of eligible players in this division. The bye goes to the lowest-ranked player who has not yet received one.";
  }
  const parts: string[] = [];
  const rankGap = Math.abs(rankA - rankB);
  parts.push(
    rankGap <= 1
      ? "These players are adjacent in the standings"
      : `These players are within ${rankGap} places of each other in the standings`,
  );
  if (ra.wins === rb.wins) parts.push(`both hold ${ra.wins}–${ra.losses} records`);
  parts.push("have not played each other");
  const gap = Math.abs((a.rating || 0) - (b.rating || 0));
  if (a.rating && b.rating) parts.push(`and are ${gap} rating points apart`);
  return `${parts.join(", ")}. No active pairing restrictions apply.`;
}

/** Fisher-Yates, on a copy, with the caller's own source of randomness. */
function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pairs an ordered queue so no two players who have already met are put
 * together. Backtracks when a greedy choice would strand the tail; if the
 * field genuinely offers no perfect assignment, falls back to adjacent
 * pairing and lets `annotateConflicts` flag the rematch for the director.
 */
function foldWithBacktracking(
  queue: Player[],
  history: Map<string, string[]>,
): [Player, Player][] {
  const result: [Player, Player][] = [];

  const solve = (pool: Player[]): boolean => {
    if (pool.length === 0) return true;
    const a = pool[0];
    const seen = history.get(a.id) ?? [];
    const rest = pool.slice(1);
    for (let i = 0; i < rest.length; i++) {
      if (seen.includes(rest[i].id)) continue;
      result.push([a, rest[i]]);
      if (solve([...rest.slice(0, i), ...rest.slice(i + 1)])) return true;
      result.pop();
    }
    return false;
  };

  if (!solve(queue)) {
    result.length = 0;
    for (let i = 0; i + 1 < queue.length; i += 2) result.push([queue[i], queue[i + 1]]);
  }
  return result;
}

/**
 * Generates pairings for one round.
 *
 * Dispatches on the tournament's configured system. Swiss is both the default and the
 * fallback for anything not (yet) implemented as its own generator, because a director who
 * never touched the format picker should see exactly what this engine has always done.
 * Knockout is refused outright rather than silently run as something else — eliminating a
 * player is a different kind of decision from pairing one, this engine tracks no
 * elimination state to make it correctly, and mislabelling a Swiss round as a knockout round
 * would be a worse failure than an honest error the caller can show.
 */
export function generateRound(input: PairingInput): PairingResult {
  switch (input.tournament.system) {
    case "round-robin":
      return generateRoundRobinRound(input);
    case "king-of-the-hill":
      return generateKothRound(input);
    case "manual":
      return generateManualRound(input);
    case "knockout":
      throw new Error(
        "Knockout pairing is not supported yet. Choose a different format for this event in Settings.",
      );
    default:
      return generateSwissRound(input);
  }
}

/**
 * Swiss fold with repeat-opponent avoidance and backtracking. Locked pairings are preserved
 * exactly. This was the engine's only pairing system before formats existed as a real,
 * per-event choice — everything about its behaviour is unchanged.
 */
function generateSwissRound(input: PairingInput): PairingResult {
  const { players, pairings, tournament, round } = input;
  const constraints = tournament.constraints;
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Opponent history and byes from all previous rounds.
  const history = new Map<string, string[]>();
  const byes = new Map<string, number>();
  for (const p of players) {
    history.set(p.id, []);
    byes.set(p.id, 0);
  }
  for (const pr of pairings.filter((x) => x.round < round)) {
    if (pr.playerBId === null) {
      byes.set(pr.playerAId, (byes.get(pr.playerAId) ?? 0) + 1);
      continue;
    }
    history.get(pr.playerAId)?.push(pr.playerBId);
    history.get(pr.playerBId)?.push(pr.playerAId);
  }

  const records = buildRecords(players, pairings, round - 1);
  const ctx = { all: records, players: playerMap, pairings };

  const lockedList = input.locked ?? [];
  const lockedIds = new Set(
    lockedList.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean) as string[]),
  );

  const out: Pairing[] = lockedList.map((p) => ({ ...p, round }));
  const unpaired: string[] = [];
  // Continue board numbering after any locked boards.
  let board = Math.max(0, ...lockedList.map((p) => p.board)) + 1;

  for (const divisionId of tournament.divisions) {
    const pool = eligiblePlayers(players)
      .filter((p) => p.division === divisionId && !lockedIds.has(p.id))
      .sort((x, y) => compareByRules(records.get(x.id)!, records.get(y.id)!, tournament.rankingRules, ctx));

    const rankOf = new Map(pool.map((p, i) => [p.id, i + 1]));
    /*
     * Nothing has been played yet, so there is no standing to respect and the fixed order
     * is an accident of the tie-breaks rather than a seeding. Shuffle it.
     */
    const opening = input.random && !pairings.some((x) => x.round < round);
    const queue = opening ? shuffled(pool, input.random!) : [...pool];

    // Bye first: lowest-ranked eligible player who has not had one.
    if (queue.length % 2 === 1) {
      let byeIdx = -1;
      for (let i = queue.length - 1; i >= 0; i--) {
        if ((byes.get(queue[i].id) ?? 0) < constraints.maxByesPerPlayer) {
          byeIdx = i;
          break;
        }
      }
      if (byeIdx === -1) byeIdx = queue.length - 1;
      const byePlayer = queue.splice(byeIdx, 1)[0];
      out.push({
        id: `pr-${round}-bye-${byePlayer.id}`,
        tournamentId: tournament.id,
        round,
        division: divisionId,
        board: 0,
        playerAId: byePlayer.id,
        playerBId: null,
        status: "bye",
        locked: false,
        reason: explain(byePlayer, null, records.get(byePlayer.id)!, null, 0, 0),
        confidence: 100,
        conflicts: [],
      });
    }

    // Swiss fold with backtracking, so a greedy choice early in the division
    // can never strand the last few players with only rematches available.
    for (const [a, b] of foldWithBacktracking(queue, history)) {
      const p: Pairing = {
        id: `pr-${round}-${board}`,
        tournamentId: tournament.id,
        round,
        division: divisionId,
        board,
        playerAId: a.id,
        playerBId: b.id,
        status: "scheduled",
        locked: false,
        reason: explain(
          a,
          b,
          records.get(a.id)!,
          records.get(b.id)!,
          rankOf.get(a.id)!,
          rankOf.get(b.id)!,
        ),
        // Confidence falls as rank distance grows — a readable proxy for fit.
        confidence: Math.max(
          60,
          100 - Math.abs((rankOf.get(a.id) ?? 0) - (rankOf.get(b.id) ?? 0)) * 4,
        ),
        conflicts: [],
      };
      out.push(p);
      board += 1;
    }

  }

  return { pairings: annotateConflicts(out, players, tournament, history, byes), unpaired };
}

/**
 * Which of `seats` occupies each position this round, by the circle method: one seat is
 * fixed, every other seat rotates one place further each round. `seats.length` must be even
 * — an odd field is padded with a `null` bye seat by the caller before this is reached — and
 * over exactly `seats.length - 1` rounds, every seat meets every other seat exactly once.
 * Pure and stateless: called fresh each round with the same ordered `seats`, it always
 * reproduces the same schedule, so there is no running state to keep in step with what has
 * already been published.
 */
function circleArrangement<T>(seats: T[], round: number): T[] {
  const fixed = seats[0];
  const rotating = seats.slice(1);
  const shift = (round - 1) % rotating.length;
  const rotated = rotating.map((_, i) => rotating[(i + shift) % rotating.length]);
  return [fixed, ...rotated];
}

/**
 * Round robin: every player in a division plays every other player in the division exactly
 * once, in a schedule fixed for the whole event rather than decided round by round. Needs no
 * repeat-opponent avoidance — the schedule already guarantees no repeat is possible within
 * its own length — and if the event runs more rounds than the schedule needs, the fixture
 * repeats from the start rather than leaving a round with nothing to publish.
 *
 * The seat order is fixed by rating then name, not by anything the director can adjust here:
 * every seat still meets every other seat exactly once whatever that order is, so this only
 * decides which seat a given player sits in, not who ends up playing whom overall.
 */
function generateRoundRobinRound(input: PairingInput): PairingResult {
  const { players, pairings, tournament, round } = input;
  const roundConstraints = { ...tournament.constraints, avoidRepeatOpponents: false };

  // Real prior-round history and bye counts, so every other conflict type — duplicate
  // assignment, a second bye, accessibility — still works correctly; only the repeat-opponent
  // flag itself is suppressed above, since a cycled fixture repeats on purpose.
  const history = new Map<string, string[]>();
  const byes = new Map<string, number>();
  for (const p of players) {
    history.set(p.id, []);
    byes.set(p.id, 0);
  }
  for (const pr of pairings.filter((x) => x.round < round)) {
    if (pr.playerBId === null) {
      byes.set(pr.playerAId, (byes.get(pr.playerAId) ?? 0) + 1);
      continue;
    }
    history.get(pr.playerAId)?.push(pr.playerBId);
    history.get(pr.playerBId)?.push(pr.playerAId);
  }

  const out: Pairing[] = [];
  const unpaired: string[] = [];
  let board = 1;

  for (const divisionId of tournament.divisions) {
    const pool = eligiblePlayers(players)
      .filter((p) => p.division === divisionId)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.fullName.localeCompare(b.fullName));

    if (pool.length < 2) continue;

    const needed = roundsForRoundRobin(pool.length);
    // Cycles once the fixture has run its course, rather than a later round pairing nobody.
    const fixtureRound = ((round - 1) % needed) + 1;

    const seats: (Player | null)[] = pool.length % 2 === 0 ? [...pool] : [...pool, null];
    const arrangement = circleArrangement(seats, fixtureRound);
    const n = arrangement.length;

    for (let i = 0; i < n / 2; i++) {
      const a = arrangement[i];
      const b = arrangement[n - 1 - i];

      if (a === null || b === null) {
        const byePlayer = (a ?? b) as Player;
        out.push({
          id: `pr-${round}-bye-${byePlayer.id}`,
          tournamentId: tournament.id,
          round,
          division: divisionId,
          board: 0,
          playerAId: byePlayer.id,
          playerBId: null,
          status: "bye",
          locked: false,
          reason: `Round robin, fixture ${fixtureRound} of ${needed}: an odd-sized field means one player sits out each time through.`,
          confidence: 100,
          conflicts: [],
        });
        continue;
      }

      out.push({
        id: `pr-${round}-${board}`,
        tournamentId: tournament.id,
        round,
        division: divisionId,
        board,
        playerAId: a.id,
        playerBId: b.id,
        status: "scheduled",
        locked: false,
        reason: `Round robin, fixture ${fixtureRound} of ${needed}: this pairing happens exactly once across the schedule.`,
        confidence: 100,
        conflicts: [],
      });
      board += 1;
    }
  }

  return {
    pairings: annotateConflicts(out, players, { ...tournament, constraints: roundConstraints }, history, byes),
    unpaired,
  };
}

/**
 * King of the Hill: the current standings, paired straight down — first against second,
 * third against fourth, and so on, every round. Repeats are not avoided because they are the
 * entire point of the format; flagging one as a conflict here would tell a director something
 * is wrong with a round that is working exactly as chosen.
 */
function generateKothRound(input: PairingInput): PairingResult {
  const { players, pairings, tournament, round } = input;
  const roundConstraints = { ...tournament.constraints, avoidRepeatOpponents: false };
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Real prior-round history and bye counts — used both to pick who sits out this round and,
  // below, so the final conflict pass can still catch a genuine second bye. Only the
  // repeat-opponent flag is suppressed, since KOTH pairs the same leaders together on purpose.
  const history = new Map<string, string[]>();
  const byes = new Map<string, number>();
  for (const p of players) {
    history.set(p.id, []);
    byes.set(p.id, 0);
  }
  for (const pr of pairings.filter((x) => x.round < round)) {
    if (pr.playerBId === null) {
      byes.set(pr.playerAId, (byes.get(pr.playerAId) ?? 0) + 1);
      continue;
    }
    history.get(pr.playerAId)?.push(pr.playerBId);
    history.get(pr.playerBId)?.push(pr.playerAId);
  }

  const records = buildRecords(players, pairings, round - 1);
  const ctx = { all: records, players: playerMap, pairings };

  const out: Pairing[] = [];
  const unpaired: string[] = [];
  let board = 1;

  for (const divisionId of tournament.divisions) {
    const queue = eligiblePlayers(players)
      .filter((p) => p.division === divisionId)
      .sort((x, y) => compareByRules(records.get(x.id)!, records.get(y.id)!, tournament.rankingRules, ctx));

    // Bye to the lowest-ranked eligible player who has not already had one — same rule Swiss
    // uses, so a player's bye entitlement means the same thing whichever format is running.
    if (queue.length % 2 === 1) {
      let byeIdx = -1;
      for (let i = queue.length - 1; i >= 0; i--) {
        if ((byes.get(queue[i].id) ?? 0) < roundConstraints.maxByesPerPlayer) {
          byeIdx = i;
          break;
        }
      }
      if (byeIdx === -1) byeIdx = queue.length - 1;
      const byePlayer = queue.splice(byeIdx, 1)[0];
      out.push({
        id: `pr-${round}-bye-${byePlayer.id}`,
        tournamentId: tournament.id,
        round,
        division: divisionId,
        board: 0,
        playerAId: byePlayer.id,
        playerBId: null,
        status: "bye",
        locked: false,
        reason: "King of the Hill: lowest-ranked eligible player without a bye yet sits out.",
        confidence: 100,
        conflicts: [],
      });
    }

    for (let i = 0; i < queue.length; i += 2) {
      const a = queue[i];
      const b = queue[i + 1];
      out.push({
        id: `pr-${round}-${board}`,
        tournamentId: tournament.id,
        round,
        division: divisionId,
        board,
        playerAId: a.id,
        playerBId: b.id,
        status: "scheduled",
        locked: false,
        reason: `King of the Hill: ${i + 1} plays ${i + 2} in the current standings.`,
        confidence: 100,
        conflicts: [],
      });
      board += 1;
    }
  }

  return {
    pairings: annotateConflicts(out, players, { ...tournament, constraints: roundConstraints }, history, byes),
    unpaired,
  };
}

/**
 * Manual: nothing is paired automatically. Every eligible player comes back unpaired, for a
 * director to build the round from scratch — the swap surface that adjusts a generated round
 * also handles pairing two names straight out of this pool.
 */
function generateManualRound(input: PairingInput): PairingResult {
  return { pairings: [], unpaired: eligiblePlayers(input.players).map((p) => p.id) };
}

/** Recomputes conflicts for a whole round — used after any manual change. */
export function annotateConflicts(
  round: Pairing[],
  players: Player[],
  tournament: Tournament,
  history?: Map<string, string[]>,
  byes?: Map<string, number>,
  accessibleBoards: number[] = Array.from({ length: 20 }, (_, i) => i + 1),
): Pairing[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const hist = history ?? new Map<string, string[]>();
  const byeCount = byes ?? new Map<string, number>();

  // Count appearances to catch duplicate assignments.
  const seen = new Map<string, number>();
  for (const p of round) {
    for (const id of [p.playerAId, p.playerBId].filter(Boolean) as string[]) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    if (p.playerBId === null) byeCount.set(p.playerAId, (byeCount.get(p.playerAId) ?? 0) + 1);
  }

  return round.map((p) => ({
    ...p,
    conflicts: detectConflicts(
      p,
      playerMap,
      hist,
      byeCount,
      tournament.constraints,
      accessibleBoards,
      seen,
    ),
  }));
}

export interface ValidationReport {
  pairingCount: number;
  duplicatePlayers: number;
  repeatOpponents: number;
  unassignedPlayers: number;
  boardConflicts: number;
  approvedExceptions: number;
  valid: boolean;
  messages: string[];
}

/** The pre-publication check shown before a round goes live. */
export function validateRound(
  round: Pairing[],
  players: Player[],
): ValidationReport {
  const eligible = eligiblePlayers(players);
  const assigned = new Map<string, number>();
  for (const p of round) {
    for (const id of [p.playerAId, p.playerBId].filter(Boolean) as string[]) {
      assigned.set(id, (assigned.get(id) ?? 0) + 1);
    }
  }

  const duplicatePlayers = [...assigned.values()].filter((n) => n > 1).length;
  const unassignedPlayers = eligible.filter((p) => !assigned.has(p.id)).length;

  const flat = round.flatMap((p) => p.conflicts.map((c) => ({ p, c })));
  const unresolved = flat.filter((x) => !x.c.acknowledgedReason);
  const repeatOpponents = unresolved.filter((x) => x.c.kind === "repeat-opponent").length;
  const boardConflicts = unresolved.filter((x) => x.c.kind === "accessibility").length;
  const approvedExceptions = flat.filter((x) => !!x.c.acknowledgedReason).length;

  const criticalRemaining = unresolved.filter((x) => x.c.severity === "critical").length;
  const valid =
    duplicatePlayers === 0 && unassignedPlayers === 0 && criticalRemaining === 0;

  const messages: string[] = [];
  if (duplicatePlayers > 0) messages.push(`${duplicatePlayers} player(s) assigned more than once.`);
  if (unassignedPlayers > 0) messages.push(`${unassignedPlayers} eligible player(s) not assigned to a board.`);
  if (repeatOpponents > 0) messages.push(`${repeatOpponents} repeat-opponent conflict(s) unresolved.`);
  if (boardConflicts > 0) messages.push(`${boardConflicts} board accessibility conflict(s) unresolved.`);
  if (valid) messages.push("All pairing checks passed. This round is ready to publish.");

  return {
    pairingCount: round.filter((p) => p.playerBId !== null).length,
    duplicatePlayers,
    repeatOpponents,
    unassignedPlayers,
    boardConflicts,
    approvedExceptions,
    valid,
    messages,
  };
}

/** Swaps two players between boards and re-annotates the affected round. */
export function swapPlayers(
  round: Pairing[],
  players: Player[],
  tournament: Tournament,
  playerOneId: string,
  playerTwoId: string,
): Pairing[] {
  const next = round.map((p) => ({ ...p }));
  const locate = (id: string) => {
    for (const p of next) {
      if (p.playerAId === id) return { p, slot: "playerAId" as const };
      if (p.playerBId === id) return { p, slot: "playerBId" as const };
    }
    return null;
  };
  const one = locate(playerOneId);
  const two = locate(playerTwoId);
  if (!one || !two || one.p.locked || two.p.locked) return round;

  /*
   * A board's division does not travel with a swap — only the two ids do — so swapping
   * across divisions would leave the right division label on a board playing the wrong
   * players. Refused the same way a locked board already is: silently, because a swap
   * that cannot happen and a swap the director never actually asked for look the same from
   * here, and the preview simply keeps showing whatever was there before either tap.
   */
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const p1 = playerMap.get(playerOneId);
  const p2 = playerMap.get(playerTwoId);
  if (!p1 || !p2 || p1.division !== p2.division) return round;

  one.p[one.slot] = playerTwoId;
  two.p[two.slot] = playerOneId;

  // Rebuild history from prior rounds so conflicts stay accurate after the swap.
  const history = new Map<string, string[]>();
  for (const p of players) history.set(p.id, []);
  return annotateConflicts(next, players, tournament, history);
}

/**
 * Pairs two players straight out of the unpaired pool onto a new board — the other half of
 * manual pairing, alongside `swapPlayers` adjusting a board that already exists. Refuses
 * across divisions for the same reason `swapPlayers` does, and refuses if either player is
 * already seated somewhere in `round` — the preview only ever offers this for names still in
 * the unpaired list, but a stale click after a fast second tap should not seat somebody
 * twice.
 */
export function pairUnpaired(
  round: Pairing[],
  players: Player[],
  tournament: Tournament,
  roundNumber: number,
  playerOneId: string,
  playerTwoId: string,
): Pairing[] {
  if (playerOneId === playerTwoId) return round;

  const seated = new Set(round.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean) as string[]));
  if (seated.has(playerOneId) || seated.has(playerTwoId)) return round;

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const p1 = playerMap.get(playerOneId);
  const p2 = playerMap.get(playerTwoId);
  if (!p1 || !p2 || p1.division !== p2.division) return round;

  /*
   * `games.board` has a database-level check constraint requiring a positive number — the
   * `board: 0` convention every other bye in this engine uses only ever reaches the database
   * after `numberByes` (domain/tables.ts) renumbers it, as part of the one-time table
   * assignment `openPairingPreview` runs before a round is first shown. Manual pairing edits
   * happen after that point, so every board created here computes its own number directly —
   * counting every board already in the round, bye or real, so a new real board and a bye
   * created moments apart can never collide on the same number.
   */
  const board = Math.max(0, ...round.map((p) => p.board)) + 1;
  const next: Pairing[] = [
    ...round,
    {
      id: `pr-${p1.division}-manual-${playerOneId}-${playerTwoId}`,
      tournamentId: tournament.id,
      round: roundNumber,
      division: p1.division,
      board,
      playerAId: playerOneId,
      playerBId: playerTwoId,
      status: "scheduled",
      locked: false,
      reason: "Paired by hand.",
      confidence: 100,
      conflicts: [],
    },
  ];

  const history = new Map<string, string[]>();
  for (const p of players) history.set(p.id, []);
  return annotateConflicts(next, players, tournament, history);
}

/**
 * Sends a player back to the unpaired pool — the manual-pairing undo. Removing their board
 * outright rather than leaving a one-sided pairing behind, which is not a shape any other
 * screen expects to see.
 */
export function unpairPlayer(round: Pairing[], playerId: string): Pairing[] {
  return round.filter((p) => p.playerAId !== playerId && p.playerBId !== playerId);
}

/**
 * Marks an unpaired player as this round's bye — manual pairing's way of sitting somebody
 * out on purpose, same board-0 shape every other format uses for a bye.
 */
export function markBye(
  round: Pairing[],
  players: Player[],
  tournament: Tournament,
  roundNumber: number,
  playerId: string,
): Pairing[] {
  const seated = new Set(round.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean) as string[]));
  if (seated.has(playerId)) return round;

  const player = players.find((p) => p.id === playerId);
  if (!player) return round;

  // Same reasoning as pairUnpaired above: `board: 0` only ever reaches the database once
  // `numberByes` renumbers it, which manual edits made after the round first opens bypass.
  // Counting every board already present, bye or real, keeps this collision-free with them.
  const board = Math.max(0, ...round.map((p) => p.board)) + 1;

  return [
    ...round,
    {
      id: `pr-manual-bye-${playerId}`,
      tournamentId: tournament.id,
      round: roundNumber,
      division: player.division,
      board,
      playerAId: playerId,
      playerBId: null,
      status: "bye",
      locked: false,
      reason: "Marked as a bye by hand.",
      confidence: 100,
      conflicts: [],
    },
  ];
}

