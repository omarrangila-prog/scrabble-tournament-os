/**
 * What an import would do, worked out before it does anything.
 *
 * Fetch → parse → match → **plan** → apply. This is the plan: the boards that would be published,
 * the scores that would be recorded, and every reason a person should look twice. Nothing here
 * writes. The screen shows the plan, a person reads the warnings, and only then is it sent — and
 * the database re-checks the parts that matter, so a plan that was right when it was shown cannot
 * be wrong by the time it is applied.
 *
 * Blufy's own desk stays the authority on who is here and which category they are in. An outside
 * system's idea of either is a claim to compare, not a fact to adopt: a player the desk has not
 * checked in is flagged however confidently the source lists them, and the category on the board
 * is the venue's, with the difference reported.
 */

import type { ExternalMatch } from "./parse";
import type { RosterPlayer } from "./match";
import { isTokenSubset, nameKey, nameTokens } from "./names";

export interface ExistingGame {
  round: number;
  board: number;
  division: string;
  playerA: string;
  playerB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
}

export interface CategoryRef {
  id: string;
  name: string;
}

/** The labels staff are shown. Fixed text, so a screen and a test can both rely on it. */
export const ISSUE = {
  notFound: "PLAYER NOT FOUND",
  notCheckedIn: "PLAYER NOT CHECKED IN",
  categoryDifference: "CATEGORY DIFFERENCE",
  duplicatePlayer: "DUPLICATE PLAYER",
  duplicateTable: "DUPLICATE TABLE",
  crossCategory: "PLAYERS IN DIFFERENT CATEGORIES",
  previousRound: "PREVIOUS ROUND UNFINISHED",
  roundMismatch: "ROUND ALREADY PUBLISHED DIFFERENTLY",
  tablesNumbered: "TABLES NUMBERED BY ORDER",
  incompleteResult: "INCOMPLETE RESULT",
  badScore: "INVALID SCORE",
  resultChanged: "RESULT CHANGED AT SOURCE",
  nothing: "NOTHING TO IMPORT",
  leftOut: "BOARD LEFT OUT",
} as const;

export interface ImportIssue {
  level: "error" | "warn";
  code: string;
  message: string;
  /**
   * Stops the import. A blocking issue marked `overridable` can be lifted by an authorised
   * person ticking a box; one that is not cannot be, because there is nothing safe to apply.
   */
  blocking: boolean;
  overridable: boolean;
}

export interface PlannedBoard {
  board: number;
  /** The venue's category for this board, which is the one that is stored. */
  division: string;
  playerA: string;
  playerB: string | null;
  nameA: string;
  nameB: string | null;
  aPlaysFirst: boolean | null;
  scoreA: number | null;
  scoreB: number | null;
}

export interface ResultChange {
  board: number;
  nameA: string;
  nameB: string | null;
  old: [number | null, number | null];
  next: [number | null, number | null];
}

export interface ImportPlan {
  round: number;
  boards: PlannedBoard[];
  issues: ImportIssue[];
  /** Official scores the source now disagrees with. Empty unless the round already exists. */
  changes: ResultChange[];
  /** Whether the round is already in the database. */
  roundExists: boolean;
  counts: {
    pairings: number;
    players: number;
    results: number;
    pending: number;
    tables: number;
    categories: string[];
  };
}

export interface PlanOptions {
  /** Include players the desk has not checked in. Only an authorised person may turn this on. */
  allowNotCheckedIn?: boolean;
}

const issue = (
  level: ImportIssue["level"],
  code: string,
  message: string,
  blocking: boolean,
  overridable = false,
): ImportIssue => ({ level, code, message, blocking, overridable });

/** Whether an outside category name is, in effect, the venue's. */
export function sameCategory(external: string, venueId: string, categories: CategoryRef[]): boolean {
  const e = nameKey(external);
  if (e === "") return true;

  const venue = categories.find((c) => c.id === venueId);
  const names = [nameKey(venueId), venue ? nameKey(venue.name) : ""].filter(Boolean);

  return names.some((n) => n === e || isTokenSubset(nameTokens(n), nameTokens(e)) || isTokenSubset(nameTokens(e), nameTokens(n)));
}

export function planRound(input: {
  round: number;
  matches: ExternalMatch[];
  /** Outside identity → registration id, after matching and confirmation. */
  resolved: Map<string, string>;
  roster: RosterPlayer[];
  categories: CategoryRef[];
  existing: ExistingGame[];
  /**
   * Outside players a person chose to leave out. A board with either of them is dropped, and
   * said so, rather than blocking everything else for one player nobody can place.
   */
  skipped?: Set<string>;
  options?: PlanOptions;
}): ImportPlan {
  const { round, resolved, roster, categories, existing } = input;
  const options = input.options ?? {};
  const skipped = input.skipped ?? new Set<string>();
  const issues: ImportIssue[] = [];
  const byId = new Map(roster.map((p) => [p.id, p]));

  const inRound = input.matches.filter((m) => m.round === round);
  const matches = inRound.filter((m) => !skipped.has(m.a.key) && !(m.b && skipped.has(m.b.key)));
  for (const m of inRound.filter((x) => !matches.includes(x)))
    issues.push(
      issue("warn", ISSUE.leftOut, `${m.a.name}${m.b ? ` v ${m.b.name}` : ""} was left out of the import.`, false),
    );

  if (matches.length === 0) {
    issues.push(
      issue("error", ISSUE.nothing, inRound.length === 0 ? `The source has no boards for round ${round}.` : "Every board was left out.", true),
    );
    return emptyPlan(round, issues, existing);
  }

  /* ---- Who is on each board ------------------------------------------------ */
  const reportedMissing = new Set<string>();
  const boards: PlannedBoard[] = [];
  const unplaced: ExternalMatch[] = [];

  for (const m of matches) {
    const a = resolved.get(m.a.key);
    const b = m.b ? resolved.get(m.b.key) : null;

    let complete = !!a && (m.b === null || !!b);
    for (const ref of [m.a, m.b]) {
      if (ref && !resolved.get(ref.key) && !reportedMissing.has(ref.key)) {
        reportedMissing.add(ref.key);
        issues.push(
          issue("error", ISSUE.notFound, `${ref.name} is not matched to a registration. Choose who they are, or leave their board out.`, true),
        );
      }
    }
    if (!complete) {
      unplaced.push(m);
      continue;
    }

    const playerA = byId.get(a as string);
    const playerB = b ? byId.get(b) : null;
    if (!playerA || (b && !playerB)) {
      unplaced.push(m);
      complete = false;
      continue;
    }

    /* Two players the venue keeps in different categories cannot share a board. */
    if (playerB && playerA.division !== playerB.division) {
      issues.push(
        issue(
          "error",
          ISSUE.crossCategory,
          `${playerA.name} (${labelFor(playerA.division, categories)}) and ${playerB.name} (${labelFor(playerB.division, categories)}) are in different categories at the venue.`,
          true,
        ),
      );
    }

    if (m.division && !sameCategory(m.division, playerA.division, categories)) {
      issues.push(
        issue(
          "warn",
          ISSUE.categoryDifference,
          `${playerA.name} is in ${labelFor(playerA.division, categories)} at the venue; the source says ${m.division}. The venue's category is used.`,
          false,
        ),
      );
    }

    let scoreA = m.scoreA;
    let scoreB = m.scoreB;

    if ((scoreA !== null && scoreA < 0) || (scoreB !== null && scoreB < 0)) {
      issues.push(issue("error", ISSUE.badScore, `${playerA.name}'s board has a score below zero.`, true));
    }

    /* Half a result is not a result. Both scores, or neither. */
    if (playerB && (scoreA === null) !== (scoreB === null)) {
      issues.push(
        issue("warn", ISSUE.incompleteResult, `${playerA.name} v ${playerB.name} has only one score, so no result is recorded for it.`, false),
      );
      scoreA = null;
      scoreB = null;
    }

    boards.push({
      board: m.table ?? 0,
      division: playerA.division,
      playerA: playerA.id,
      playerB: playerB?.id ?? null,
      nameA: playerA.name,
      nameB: playerB?.name ?? null,
      aPlaysFirst: m.aFirst,
      scoreA,
      scoreB,
    });
  }

  /* ---- Tables --------------------------------------------------------------- */
  const used = new Set(boards.filter((b) => b.board > 0).map((b) => b.board));
  const dupTables = [...used].filter((t) => boards.filter((b) => b.board === t).length > 1);
  for (const t of dupTables)
    issues.push(issue("error", ISSUE.duplicateTable, `Table ${t} is given to more than one board.`, true));

  const unnumbered = boards.filter((b) => b.board === 0);
  if (unnumbered.length > 0) {
    let next = 1;
    for (const b of unnumbered) {
      while (used.has(next)) next += 1;
      b.board = next;
      used.add(next);
    }
    issues.push(
      issue("warn", ISSUE.tablesNumbered, `${unnumbered.length} board(s) had no table number, so they were numbered in the order given.`, false),
    );
  }

  /* ---- Players ------------------------------------------------------------- */
  const appearances = new Map<string, number>();
  for (const b of boards) for (const id of [b.playerA, b.playerB]) if (id) appearances.set(id, (appearances.get(id) ?? 0) + 1);
  for (const [id, n] of appearances)
    if (n > 1)
      issues.push(issue("error", ISSUE.duplicatePlayer, `${byId.get(id)?.name ?? "A player"} is on ${n} boards in round ${round}.`, true));

  for (const id of appearances.keys()) {
    const p = byId.get(id);
    if (p && !p.checkedIn)
      issues.push(
        issue(
          options.allowNotCheckedIn ? "warn" : "error",
          ISSUE.notCheckedIn,
          `${p.name} has not been checked in at the desk.`,
          !options.allowNotCheckedIn,
          true,
        ),
      );
  }

  /* ---- Against what is already there ---------------------------------------- */
  const previous = existing.filter((g) => g.round === round - 1 && g.playerB !== null);
  const unfinished = previous.filter((g) => g.status !== "verified").length;
  if (round > 1 && unfinished > 0)
    issues.push(
      issue("error", ISSUE.previousRound, `Round ${round - 1} still has ${unfinished} board(s) without a verified result.`, true),
    );

  const current = existing.filter((g) => g.round === round);
  const roundExists = current.length > 0;
  const changes: ResultChange[] = [];

  if (roundExists) {
    /*
     * Every board the source lists must be a board that is already there, with the same two
     * players. The source need not list them all: a results page usually shows only the games
     * that have finished, and refusing it for being short would make scores impossible to bring
     * in as they arrive.
     */
    const mismatched =
      boards.some((b) => {
        const g = current.find((x) => x.board === b.board);
        if (!g) return true;
        return !(
          (g.playerA === b.playerA && g.playerB === b.playerB) ||
          (g.playerB !== null && g.playerA === b.playerB && g.playerB === b.playerA)
        );
      });

    if (mismatched)
      issues.push(
        issue(
          "error",
          ISSUE.roundMismatch,
          `Round ${round} is already published and the source's pairings are not the same. An import does not re-pair a published round.`,
          true,
        ),
      );
    else {
      for (const b of boards) {
        const g = current.find((x) => x.board === b.board);
        if (!g || b.scoreA === null) continue;
        const flipped = g.playerA !== b.playerA;
        const next: [number | null, number | null] = flipped ? [b.scoreB, b.scoreA] : [b.scoreA, b.scoreB];
        if (g.scoreA !== null && (g.scoreA !== next[0] || g.scoreB !== next[1]))
          changes.push({
            board: b.board,
            nameA: flipped ? (b.nameB ?? "") : b.nameA,
            nameB: flipped ? b.nameA : b.nameB,
            old: [g.scoreA, g.scoreB],
            next,
          });
      }
      if (changes.length > 0)
        issues.push(
          issue(
            "warn",
            ISSUE.resultChanged,
            `${changes.length} result(s) differ from the official record. They are applied only if you choose to apply the correction.`,
            false,
          ),
        );
    }
  }

  boards.sort((x, y) => x.board - y.board);

  const withResult = boards.filter((b) => b.scoreA !== null).length;
  const playable = boards.filter((b) => b.playerB !== null).length;

  return {
    round,
    boards,
    issues,
    changes,
    roundExists,
    counts: {
      pairings: boards.length,
      players: appearances.size,
      results: withResult,
      pending: playable - boards.filter((b) => b.playerB !== null && b.scoreA !== null).length,
      tables: new Set(boards.map((b) => b.board)).size,
      categories: [...new Set(boards.map((b) => labelFor(b.division, categories)))],
    },
  };
}

function labelFor(id: string, categories: CategoryRef[]): string {
  return categories.find((c) => c.id === id)?.name ?? id;
}

function emptyPlan(round: number, issues: ImportIssue[], existing: ExistingGame[]): ImportPlan {
  return {
    round,
    boards: [],
    issues,
    changes: [],
    roundExists: existing.some((g) => g.round === round),
    counts: { pairings: 0, players: 0, results: 0, pending: 0, tables: 0, categories: [] },
  };
}

/** Whether the plan may be applied as it stands. */
export function canApply(plan: ImportPlan): boolean {
  return plan.boards.length > 0 && !plan.issues.some((i) => i.blocking);
}

/** What the database function takes: boards with the venue's own ids. */
export function payloadOf(plan: ImportPlan): Record<string, unknown>[] {
  return plan.boards.map((b) => ({
    board: b.board,
    division: b.division,
    playerA: b.playerA,
    playerB: b.playerB,
    aPlaysFirst: b.aPlaysFirst,
    scoreA: b.scoreA,
    scoreB: b.scoreB,
  }));
}
