/**
 * The pairing validator.
 *
 * Deliberately separate from the engine that produces pairings. An engine checking its own
 * work can only find the mistakes its author thought of; a validator that knows nothing
 * about how a round was built — generated, hand-paired, or half of each — refuses the same
 * round for the same reasons whichever way it arrived.
 *
 * This exists because of a specific acceptance-test failure: a tester reported that
 * Beginner, Recreational and Advanced players were mixed together and that the pairings
 * looked random. Nothing in the system would have said so. `validateBoardPlan` sees a list
 * of boards and no roster, so it cannot tell a Beginner from an Advanced player, cannot
 * notice somebody missing from the round, and cannot know a repeat when it sees one. It
 * catches duplicate tables and double-booked players and is right about both — it was just
 * never able to answer the question that mattered.
 *
 * Not to be confused with `validateRound` in `pairing.ts`, which summarises the conflicts
 * the engine annotated onto its own output for the pairing cards. That one reports what the
 * generator already noticed. This one re-derives everything from the boards and the roster,
 * so it says the same thing about a hand-built round as about a generated one.
 *
 * Findings are blocking or advisory. Blocking means the round must not be published: it is
 * wrong in a way that cannot be explained to the room. Advisory means the director should
 * see it and decide — a repeat opponent under a policy that tolerates repeats is a fact
 * about the draw, not an error in it.
 */

export type RepeatPolicy =
  | "strict-no-repeat"
  | "avoid-repeat"
  | "allow-one-repeat"
  | "unlimited";

/** A player as the validator needs them: who they are, where they belong, whether they play. */
export interface ValidatorPlayer {
  id: string;
  /** The division id they are paired within. Empty means nobody has said, which blocks. */
  division: string;
  /**
   * Whether they are expected in this round.
   *
   * A player can be on the roster and out of the round — withdrawn, arrived after the round
   * was drawn, or marked absent — and every one of those is a reason to be absent from the
   * pairings rather than an error in them.
   */
  active: boolean;
  withdrawn?: boolean;
}

/** One board of a proposed round. `playerB: null` is a bye, and a bye sits at no table. */
export interface ValidatorBoard {
  board: number;
  division: string;
  playerA: string;
  playerB: string | null;
  /** Which of the two plays first, where the event tracks it. */
  aPlaysFirst?: boolean;
}

export interface ValidatorRules {
  /** The divisions this event actually runs. A board outside them belongs to no tournament. */
  divisions: string[];
  repeatPolicy: RepeatPolicy;
  /** Zero means no bye may be given at all. */
  maxByesPerPlayer: number;
  /**
   * Whether a board may hold two players from different divisions.
   *
   * False by default and for every event this system has run. A cross-division board is a
   * real format in team and handicap play, so it is a setting rather than an assertion —
   * but it has to be turned on deliberately, because the alternative is the failure this
   * module was written after.
   */
  crossDivisionPairing: boolean;
  firstSecondEnabled: boolean;
}

/** What happened in earlier rounds, which is what makes a repeat a repeat. */
export interface ValidatorHistory {
  /** Opponent ids by player, across every previous round. Byes are not opponents. */
  opponents: Record<string, string[]>;
  /** How many byes each player has already had. */
  byes: Record<string, number>;
}

export type Severity = "blocking" | "advisory";

export interface Finding {
  /** Stable identifier, so tests and the UI can act on a kind of problem rather than text. */
  code: string;
  severity: Severity;
  /** Written for the director standing in the room, not for a log. */
  message: string;
  playerIds?: string[];
  boards?: number[];
}

export interface ValidationReport {
  /** True when nothing blocking was found. Advisory findings do not stop a publish. */
  ok: boolean;
  findings: Finding[];
  blocking: Finding[];
  advisory: Finding[];
  counts: {
    activePlayers: number;
    accountedFor: number;
    matches: number;
    byes: number;
  };
}

const EMPTY_HISTORY: ValidatorHistory = { opponents: {}, byes: {} };

/**
 * How many repeats a policy tolerates per pair.
 *
 * `avoid-repeat` returns zero like the strict policy: the difference between them is not
 * how many repeats are acceptable but what happens when none is avoidable, which is the
 * engine's decision to make and not this module's. Both report a repeat; only the severity
 * differs, below.
 */
function repeatAllowance(policy: RepeatPolicy): number {
  switch (policy) {
    case "unlimited":
      return Number.POSITIVE_INFINITY;
    case "allow-one-repeat":
      return 1;
    default:
      return 0;
  }
}

/**
 * Checks a roster before a round is drawn from it.
 *
 * Separate from the board check because it answers a question that comes earlier: whether
 * this roster can be paired at all. A player with no division cannot be placed by any
 * engine, and the honest response is to refuse and name them — the alternative is what the
 * acceptance test found, a round that quietly leaves somebody out or puts them anywhere.
 */
export function validateRosterForPairing(
  players: ValidatorPlayer[],
  rules: ValidatorRules,
): ValidationReport {
  const findings: Finding[] = [];
  const active = players.filter((p) => p.active && !p.withdrawn);

  const undivided = active.filter((p) => p.division.trim() === "");
  if (undivided.length > 0) {
    findings.push({
      code: "player-without-division",
      severity: "blocking",
      message:
        undivided.length === 1
          ? "1 active player has no category assigned. Assign one before pairing."
          : `${undivided.length} active players have no category assigned. Assign them before pairing.`,
      playerIds: undivided.map((p) => p.id),
    });
  }

  /*
   * A division the event does not run is worse than no division at all.
   *
   * The engine pairs by walking the event's division list, so a player filed under anything
   * else is not paired and not reported — they simply do not appear in the round. That is
   * the one failure mode nobody notices until somebody is standing in the room with no
   * table, so it blocks here.
   */
  const known = new Set(rules.divisions);
  const stray = active.filter((p) => p.division.trim() !== "" && !known.has(p.division));
  if (stray.length > 0) {
    const names = [...new Set(stray.map((p) => p.division))].sort();
    findings.push({
      code: "player-in-unknown-division",
      severity: "blocking",
      message: `${stray.length} active player${stray.length === 1 ? "" : "s"} sit in a category this event does not run (${names.join(", ")}). They would be left out of every round.`,
      playerIds: stray.map((p) => p.id),
    });
  }

  /*
   * A division of one cannot be paired, and a division of none is simply not running.
   *
   * Reported rather than refused: the answer is usually to move that player, and it is the
   * director's to make. A round generated in this state gives them a bye every time.
   */
  for (const division of rules.divisions) {
    const size = active.filter((p) => p.division === division).length;
    if (size === 1) {
      findings.push({
        code: "division-of-one",
        severity: "advisory",
        message: `Only 1 active player in ${division}. They can only receive a bye — move them to another category or withdraw them.`,
        playerIds: active.filter((p) => p.division === division).map((p) => p.id),
      });
    }
  }

  const duplicates = active
    .map((p) => p.id)
    .filter((id, i, all) => all.indexOf(id) !== i);
  if (duplicates.length > 0) {
    findings.push({
      code: "duplicate-roster-entry",
      severity: "blocking",
      message: `${new Set(duplicates).size} player${new Set(duplicates).size === 1 ? " appears" : "s appear"} on the roster twice.`,
      playerIds: [...new Set(duplicates)],
    });
  }

  return report(findings, {
    activePlayers: active.length,
    accountedFor: 0,
    matches: 0,
    byes: 0,
  });
}

/**
 * Checks a proposed round against the roster it was drawn from.
 *
 * Every check here answers a question a director would ask looking at a printed draw: is
 * everybody on it, is anybody on it twice, is anybody playing themselves, is anybody playing
 * out of their category, does every board have a table nobody else has, and has any of this
 * happened before.
 */
export function validateRoundPlan(
  boards: ValidatorBoard[],
  players: ValidatorPlayer[],
  rules: ValidatorRules,
  history: ValidatorHistory = EMPTY_HISTORY,
): ValidationReport {
  const findings: Finding[] = [];

  const byId = new Map(players.map((p) => [p.id, p]));
  const active = players.filter((p) => p.active && !p.withdrawn);
  const activeIds = new Set(active.map((p) => p.id));

  const matches = boards.filter((b) => b.playerB !== null);
  const byes = boards.filter((b) => b.playerB === null);

  if (boards.length === 0) {
    findings.push({
      code: "empty-round",
      severity: "blocking",
      message: "There are no boards to publish.",
    });
  }

  /* ---- Every active player exactly once ---------------------------------- */

  /** Which boards each id appears on. More than one is a double-booking. */
  const appearances = new Map<string, number[]>();
  for (const b of boards) {
    for (const id of [b.playerA, b.playerB]) {
      if (!id) continue;
      const at = appearances.get(id) ?? [];
      at.push(b.board);
      appearances.set(id, at);
    }
  }

  for (const [id, at] of appearances) {
    if (at.length > 1) {
      findings.push({
        code: "player-twice-in-round",
        severity: "blocking",
        message: `${label(byId, id)} appears on ${at.length} boards in one round (${at.join(", ")}).`,
        playerIds: [id],
        boards: at,
      });
    }
  }

  const missing = active.filter((p) => !appearances.has(p.id));
  if (missing.length > 0) {
    findings.push({
      code: "active-player-missing",
      severity: "blocking",
      message: `${missing.length} checked-in player${missing.length === 1 ? " is" : "s are"} not in this round at all.`,
      playerIds: missing.map((p) => p.id),
    });
  }

  /* ---- Nobody who should not be here ------------------------------------- */

  for (const [id] of appearances) {
    const player = byId.get(id);
    if (!player) {
      findings.push({
        code: "unknown-player",
        severity: "blocking",
        message: `A player on this round is not on the roster (${id}).`,
        playerIds: [id],
      });
      continue;
    }
    if (player.withdrawn) {
      findings.push({
        code: "withdrawn-player-paired",
        severity: "blocking",
        message: `${label(byId, id)} has withdrawn and is still paired.`,
        playerIds: [id],
      });
      continue;
    }
    if (!player.active) {
      findings.push({
        code: "inactive-player-paired",
        severity: "blocking",
        message: `${label(byId, id)} is not on the active roster for this round.`,
        playerIds: [id],
      });
    }
  }

  /* ---- Self-pairing ------------------------------------------------------ */

  for (const b of matches) {
    if (b.playerA === b.playerB) {
      findings.push({
        code: "self-pairing",
        severity: "blocking",
        message: `${label(byId, b.playerA)} is paired against themselves on board ${b.board}.`,
        playerIds: [b.playerA],
        boards: [b.board],
      });
    }
  }

  /* ---- Category isolation — the failure this module was written for ------ */

  if (!rules.crossDivisionPairing) {
    for (const b of matches) {
      const a = byId.get(b.playerA);
      const other = byId.get(b.playerB!);
      if (!a || !other) continue;
      if (a.division !== other.division) {
        findings.push({
          code: "cross-division-pairing",
          severity: "blocking",
          message: `Board ${b.board} pairs ${a.division} against ${other.division}. Categories play separately.`,
          playerIds: [a.id, other.id],
          boards: [b.board],
        });
      }
    }
  }

  /*
   * The board's own division has to match the players on it.
   *
   * Not the same check as the one above: two Beginners on a board labelled Advanced are
   * paired correctly and filed wrongly, and everything downstream reads the label — the
   * table plan seats by it, the standings group by it, the wall prints it. A correct pairing
   * under the wrong heading still puts somebody at the wrong table.
   */
  for (const b of boards) {
    const a = byId.get(b.playerA);
    if (!a) continue;
    if (b.division !== a.division && !(rules.crossDivisionPairing && b.playerB !== null)) {
      findings.push({
        code: "board-division-mismatch",
        severity: "blocking",
        message: `Board ${b.board} is filed under ${b.division || "no category"} but ${label(byId, a.id)} plays in ${a.division}.`,
        playerIds: [a.id],
        boards: [b.board],
      });
    }
    if (b.division.trim() !== "" && !rules.divisions.includes(b.division)) {
      findings.push({
        code: "board-in-unknown-division",
        severity: "blocking",
        message: `Board ${b.board} is filed under ${b.division}, which this event does not run.`,
        boards: [b.board],
      });
    }
  }

  /* ---- Byes -------------------------------------------------------------- */

  /*
   * One bye per division, and only where the numbers demand one.
   *
   * A division with an even number of active players needs none; an odd one needs exactly
   * one. Two byes in an even division means two people were sent home for no reason, and no
   * bye in an odd division means somebody is unaccounted for — which the missing-player
   * check would also catch, but this says why.
   */
  for (const division of rules.divisions) {
    const pool = active.filter((p) => p.division === division).length;
    if (pool === 0) continue;

    const given = byes.filter((b) => b.division === division).length;
    const needed = pool % 2 === 0 ? 0 : 1;

    if (given !== needed) {
      findings.push({
        code: "wrong-bye-count",
        severity: "blocking",
        message: `${division} has ${pool} active player${pool === 1 ? "" : "s"} and ${given} bye${given === 1 ? "" : "s"}. It needs ${needed}.`,
      });
    }
  }

  /*
   * Who the bye went to, which is the only part of it anybody can choose.
   *
   * Whether there is a bye at all is arithmetic: the check above already insists on exactly
   * one in an odd division and none in an even one. So a bye that exists had to exist, and
   * the meaningful question is not "is this one too many" but "was there somebody who had
   * had fewer".
   *
   * That distinction is the whole rule, and getting it wrong the first time made the
   * simulator refuse a legitimate event: three players in a division over five rounds must
   * hand somebody a second bye by round four, because there are only three people to give
   * it to. Blocking on the limit there tells the director their tournament is invalid when
   * what is actually true is that it is small.
   */
  for (const b of byes) {
    const had = history.byes[b.playerA] ?? 0;
    const pool = active.filter((p) => p.division === b.division);
    const fewest = pool.length === 0
      ? had
      : Math.min(...pool.map((p) => history.byes[p.id] ?? 0));

    /*
     * A bye handed to somebody who has sat out more often than a clubmate in the same
     * division is a selection fault, and it is unfair in a way a player will notice and
     * remember. This is a real defect, so it blocks.
     */
    if (had > fewest) {
      findings.push({
        code: "unfair-bye",
        severity: "blocking",
        message:
          `${label(byId, b.playerA)} is given the ${b.division} bye having already had ${had}, ` +
          `while somebody in the same category has had ${fewest}.`,
        playerIds: [b.playerA],
      });
      continue;
    }

    /*
     * Over the event's limit, and nobody in the division is under it. Unavoidable, so the
     * director is told rather than stopped — the alternatives are cross-category pairing or
     * a round that does not happen, and both are worse.
     */
    if (had + 1 > rules.maxByesPerPlayer) {
      findings.push({
        code: "unavoidable-bye",
        severity: "advisory",
        message:
          rules.maxByesPerPlayer === 0
            ? `${b.division} has an odd number of players, so somebody must sit out even though this event allows no byes.`
            : `${label(byId, b.playerA)} takes a ${had + 1}${ordinal(had + 1)} bye, over this event's limit of ${rules.maxByesPerPlayer}. Everybody in ${b.division} has had ${fewest}, so there is nobody left to give it to.`,
        playerIds: [b.playerA],
      });
    }
  }

  /* ---- Tables ------------------------------------------------------------ */

  /*
   * A bye occupies no table, so its board number is not a table number and is not compared.
   * Byes carry board 0 — "nowhere" — and counting those as a table made every round with two
   * byes invalid, which is most rounds of a three-division event.
   */
  const seats = new Map<number, number[]>();
  for (const b of matches) {
    if (!Number.isInteger(b.board) || b.board <= 0) {
      findings.push({
        code: "invalid-table",
        severity: "blocking",
        message: `A board has no usable table number (${b.board}).`,
        boards: [b.board],
      });
      continue;
    }
    const at = seats.get(b.board) ?? [];
    at.push(b.board);
    seats.set(b.board, at);
  }
  for (const [table, at] of seats) {
    if (at.length > 1) {
      findings.push({
        code: "duplicate-table",
        severity: "blocking",
        message: `${at.length} games are seated at table ${table}.`,
        boards: [table],
      });
    }
  }

  /* ---- Repeat opponents -------------------------------------------------- */

  const allowance = repeatAllowance(rules.repeatPolicy);
  for (const b of matches) {
    const before = (history.opponents[b.playerA] ?? []).filter((id) => id === b.playerB).length;
    if (before === 0) continue;

    const overLimit = before > allowance;
    findings.push({
      code: "repeat-opponent",
      /*
       * Over the limit is an error; at or under it is a fact.
       *
       * `avoid-repeat` allows none and still only warns, because that policy is a preference
       * the engine satisfies where it can — refusing to publish a round the engine could not
       * draw any other way would leave the director with a room and no round.
       */
      severity: overLimit && rules.repeatPolicy === "strict-no-repeat" ? "blocking" : "advisory",
      message:
        `${label(byId, b.playerA)} and ${label(byId, b.playerB!)} have already played ` +
        `${before === 1 ? "once" : `${before} times`}${overLimit ? ", over this event's limit" : ""}.`,
      playerIds: [b.playerA, b.playerB!],
      boards: [b.board],
    });
  }

  /* ---- First and second -------------------------------------------------- */

  if (rules.firstSecondEnabled) {
    for (const b of matches) {
      if (b.aPlaysFirst === undefined) {
        findings.push({
          code: "first-second-unset",
          severity: "blocking",
          message: `Board ${b.board} does not say who plays first, and this event tracks it.`,
          boards: [b.board],
        });
      }
    }
  }

  return report(findings, {
    activePlayers: active.length,
    accountedFor: [...appearances.keys()].filter((id) => activeIds.has(id)).length,
    matches: matches.length,
    byes: byes.length,
  });
}

/** "st", "nd", "rd", "th" — so a message reads as a sentence rather than as a count. */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** A name for a message. Ids are what the validator has; they are not what anybody reads. */
function label(byId: Map<string, ValidatorPlayer>, id: string): string {
  return byId.has(id) ? `Player ${id}` : id;
}

function report(findings: Finding[], counts: ValidationReport["counts"]): ValidationReport {
  const blocking = findings.filter((f) => f.severity === "blocking");
  const advisory = findings.filter((f) => f.severity === "advisory");
  return { ok: blocking.length === 0, findings, blocking, advisory, counts };
}

/**
 * Opponent and bye history from games already published.
 *
 * Built here so the live preview and the simulator ask the same question of earlier rounds
 * rather than each inventing a shape for it.
 */
export function historyFromBoards(
  boards: Array<{ round: number; playerA: string; playerB: string | null }>,
  beforeRound: number,
): ValidatorHistory {
  const opponents: Record<string, string[]> = {};
  const byes: Record<string, number> = {};

  for (const b of boards.filter((x) => x.round < beforeRound)) {
    if (b.playerB === null) {
      byes[b.playerA] = (byes[b.playerA] ?? 0) + 1;
      continue;
    }
    (opponents[b.playerA] ??= []).push(b.playerB);
    (opponents[b.playerB] ??= []).push(b.playerA);
  }

  return { opponents, byes };
}

/**
 * One line summarising a report, for the preview screen's header.
 *
 * The acceptance test asked for a director to be able to read "18 / 18 players accounted
 * for, 9 matches, 0 blocking warnings" and press Publish without reading a table.
 */
export function summarise(report: ValidationReport): string {
  const { activePlayers, accountedFor, matches, byes } = report.counts;
  const parts = [
    `${accountedFor} / ${activePlayers} players accounted for`,
    `${matches} match${matches === 1 ? "" : "es"}`,
  ];
  if (byes > 0) parts.push(`${byes} bye${byes === 1 ? "" : "s"}`);
  parts.push(
    report.blocking.length === 0
      ? "0 blocking problems"
      : `${report.blocking.length} blocking problem${report.blocking.length === 1 ? "" : "s"}`,
  );
  return parts.join(" · ");
}
