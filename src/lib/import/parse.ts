/**
 * Reading an outside pairing or results table into Blufy's own shape.
 *
 * The source is another piece of software that this project has no control over and, until
 * someone pastes a real export, has not seen. So nothing here assumes its layout: a header row is
 * *found*, each column is recognised by what it is called, and a source may spell the same thing
 * several ways. What comes out is a list of `ExternalMatch`es and `ExternalStanding`s that nothing
 * downstream needs to know the origin of — which is what lets the source change without anything
 * but this file changing.
 *
 * Nothing is trusted. A score that is not a number is dropped with a warning, a table number that
 * is not a number is dropped with a warning, and an ambiguity is reported rather than resolved.
 */

import { gridsFrom, type Grid } from "./tabular";
import { cleanName, nameKey } from "./names";

export type FieldId =
  | "round"
  | "division"
  | "player"
  | "opponent"
  | "table"
  | "first"
  | "score"
  | "oppScore"
  | "result"
  | "wins"
  | "losses"
  | "draws"
  | "spread"
  | "rank"
  | "points"
  | "playerNumber"
  | "oppNumber"
  | "externalId"
  | "oppExternalId";

/** What each field may be called, lower-cased with everything but letters and digits removed. */
export const FIELD_NAMES: Record<FieldId, string[]> = {
  round: ["round", "rd", "rnd", "r", "roundnumber", "roundno"],
  division: ["division", "div", "category", "cat", "class", "group", "lobby", "section", "field", "level"],
  player: ["player", "name", "playername", "player1", "player1name", "p1", "playera", "name1", "firstplayer"],
  opponent: [
    "opponent", "opp", "opponentname", "oppname", "player2", "player2name", "p2", "playerb", "name2",
    "vs", "against", "secondplayer",
  ],
  table: ["table", "tbl", "tableno", "tablenumber", "tablenum", "board", "boardno", "boardnumber", "bd"],
  first: ["first", "firstsecond", "1st2nd", "startsfirst", "playsfirst", "firstmove", "goesfirst", "order"],
  score: ["score", "playerscore", "scorea", "score1", "ps", "pscore", "myscore", "scorefor"],
  oppScore: ["opponentscore", "oppscore", "scoreb", "score2", "os", "oscore", "oppscr", "scoreagainst"],
  result: ["result", "outcome", "wl", "winloss", "res"],
  wins: ["wins", "w", "won", "win"],
  losses: ["losses", "l", "lost", "loss"],
  draws: ["draws", "d", "ties", "drawn", "draw"],
  spread: ["spread", "spr", "margin", "diff", "pointdiff", "pointdifferential"],
  rank: ["rank", "pos", "position", "place", "standing"],
  points: ["pts", "points", "tournamentpoints", "tp", "matchpoints"],
  playerNumber: [
    "playernumber", "playerno", "playernum", "regno", "registration", "registrationnumber", "reg",
    "blufynumber", "entrynumber", "badge", "badgenumber", "number", "no",
  ],
  oppNumber: ["opponentnumber", "oppnumber", "oppno", "opponentno", "player2number", "player2no"],
  externalId: ["id", "playerid", "pid", "externalid", "tshid", "memberid"],
  oppExternalId: ["opponentid", "oppid", "player2id", "oppexternalid"],
};

const squash = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Which column holds which field, by position. */
export type ColumnMap = Partial<Record<FieldId, number>>;

/**
 * The columns a header row names.
 *
 * Longest-name-first within a row is not needed: each header is looked up whole, so "Opponent
 * Score" is `oppScore` and not `opponent`. The first column to claim a field keeps it.
 */
export function mapHeader(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((raw, index) => {
    const key = squash(raw);
    if (!key) return;
    for (const [field, names] of Object.entries(FIELD_NAMES) as [FieldId, string[]][]) {
      if (names.includes(key) && map[field] === undefined) {
        map[field] = index;
        return;
      }
    }
  });
  return map;
}

export interface ExternalPlayerRef {
  /** As the source wrote it, minus any trailing record or rating. */
  name: string;
  /** `nameKey(name)`, or `id:<id>` where the source gave an id, so a mapping can survive a respelling. */
  key: string;
  number?: string;
  externalId?: string;
}

export interface ExternalMatch {
  round: number | null;
  /** As the source wrote it. Blank when the source does not say. */
  division: string;
  table: number | null;
  a: ExternalPlayerRef;
  /** Null on a bye. */
  b: ExternalPlayerRef | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Whether `a` goes first, where the source says. */
  aFirst: boolean | null;
  /** Which rows of the source this came from, 1-based, for a warning a person can find. */
  rows: number[];
}

export interface ExternalStanding {
  name: string;
  key: string;
  division: string;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  spread: number | null;
  points: number | null;
}

export interface ParseWarning {
  level: "warn" | "error";
  message: string;
}

export interface ParsedSource {
  matches: ExternalMatch[];
  standings: ExternalStanding[];
  warnings: ParseWarning[];
  /** The fields found, for showing a person what was understood. */
  recognised: FieldId[];
  /** How many data rows were read. */
  rowCount: number;
}

/* -------------------------------------------------------------------------- */
/* Cells                                                                       */
/* -------------------------------------------------------------------------- */

function integer(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const text = raw.replace(/[,\s]/g, "").replace(/^\+/, "");
  return /^-?\d+$/.test(text) ? Number(text) : null;
}

/** "Round 2", "R2", "2" → 2. */
function roundNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /(\d+)\s*$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

/** "Table 17", "T17", "17" → 17. */
function tableNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /(\d+)\s*$/.exec(raw.trim());
  const n = m ? Number(m[1]) : null;
  return n !== null && n > 0 ? n : null;
}

function firstFlag(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (["1", "1st", "first", "f", "y", "yes", "true", "start", "starts"].includes(v)) return true;
  if (["2", "2nd", "second", "s", "n", "no", "false"].includes(v)) return false;
  return null;
}

const BYE = /^(bye|-+|—|–|n\/a|none|)$/i;

function player(
  rawName: string | undefined,
  number: string | undefined,
  externalId: string | undefined,
): ExternalPlayerRef | null {
  const name = cleanName(rawName ?? "");
  if (name === "" || BYE.test(name)) return null;
  const id = externalId?.trim();
  return {
    name,
    key: id ? `id:${id.toLowerCase()}` : nameKey(name),
    ...(number?.trim() ? { number: number.trim() } : {}),
    ...(id ? { externalId: id } : {}),
  };
}

/** "Ahmed Khan vs Hammad Ali" → both names. Only the word "vs", with spaces, so a hyphen never splits one. */
function splitVersus(cell: string): [string, string] | null {
  const m = /^(.+?)\s+(?:vs\.?|v\.?|versus)\s+(.+)$/i.exec(cell);
  return m ? [m[1], m[2]] : null;
}

/* -------------------------------------------------------------------------- */
/* One grid                                                                    */
/* -------------------------------------------------------------------------- */

function headerRowIndex(grid: Grid): number {
  let best = -1;
  let bestScore = 1;
  grid.slice(0, 8).forEach((row, i) => {
    const score = Object.keys(mapHeader(row)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

function readGrid(
  grid: Grid,
  defaultRound: number | null,
): { matches: ExternalMatch[]; standings: ExternalStanding[]; warnings: ParseWarning[]; recognised: FieldId[]; rows: number } {
  const warnings: ParseWarning[] = [];
  const at = headerRowIndex(grid);
  if (at < 0) {
    return { matches: [], standings: [], warnings, recognised: [], rows: 0 };
  }

  const map = mapHeader(grid[at]);
  const recognised = Object.keys(map) as FieldId[];
  const data = grid.slice(at + 1);

  const cell = (row: string[], field: FieldId) => (map[field] === undefined ? undefined : row[map[field] as number]);

  const hasPair = map.player !== undefined && (map.opponent !== undefined || data.some((r) => splitVersus(cell(r, "player") ?? "")));
  const hasStanding =
    map.player !== undefined &&
    (map.rank !== undefined || map.wins !== undefined || map.losses !== undefined || map.points !== undefined);

  const matches: ExternalMatch[] = [];
  const standings: ExternalStanding[] = [];

  data.forEach((row, i) => {
    const rowNo = at + 2 + i;
    const rawPlayer = cell(row, "player") ?? "";

    if (hasPair) {
      let nameA = rawPlayer;
      let nameB = cell(row, "opponent");
      const versus = nameB === undefined ? splitVersus(rawPlayer) : null;
      if (versus) [nameA, nameB] = versus;

      const a = player(nameA, cell(row, "playerNumber"), cell(row, "externalId"));
      if (!a) return;
      const b = player(nameB, cell(row, "oppNumber"), cell(row, "oppExternalId"));

      let scoreA = integer(cell(row, "score"));
      let scoreB = integer(cell(row, "oppScore"));

      /* A single "421-388" cell where the source has no separate opponent column. */
      const both = /^(\d+)\s*[-–:]\s*(\d+)$/.exec((cell(row, "score") ?? "").trim());
      if (both && scoreB === null) {
        scoreA = Number(both[1]);
        scoreB = Number(both[2]);
      }

      for (const [label, raw, parsed] of [
        ["score", cell(row, "score"), scoreA],
        ["opponent score", cell(row, "oppScore"), scoreB],
      ] as const) {
        if (raw && raw.trim() !== "" && parsed === null && !both)
          warnings.push({ level: "warn", message: `Row ${rowNo}: "${raw}" is not a ${label}, so it was left out.` });
      }

      const table = tableNumber(cell(row, "table"));
      if (cell(row, "table") && table === null)
        warnings.push({ level: "warn", message: `Row ${rowNo}: "${cell(row, "table")}" is not a table number.` });

      matches.push({
        round: roundNumber(cell(row, "round")) ?? defaultRound,
        division: (cell(row, "division") ?? "").trim(),
        table,
        a,
        b,
        scoreA,
        scoreB: b ? scoreB : null,
        aFirst: b ? firstFlag(cell(row, "first")) : null,
        rows: [rowNo],
      });
      return;
    }

    if (hasStanding) {
      const name = cleanName(rawPlayer);
      if (!name) return;
      standings.push({
        name,
        key: nameKey(name),
        division: (cell(row, "division") ?? "").trim(),
        rank: integer(cell(row, "rank")),
        wins: integer(cell(row, "wins")),
        losses: integer(cell(row, "losses")),
        draws: integer(cell(row, "draws")),
        spread: integer(cell(row, "spread")),
        points: (() => {
          const raw = cell(row, "points");
          if (raw === undefined) return null;
          const n = Number(raw.replace(/,/g, ""));
          return Number.isFinite(n) && raw.trim() !== "" ? n : null;
        })(),
      });
    }
  });

  return { matches, standings, warnings, recognised, rows: data.length };
}

/* -------------------------------------------------------------------------- */
/* Merging the two sides of a game                                             */
/* -------------------------------------------------------------------------- */

/**
 * One game per pairing.
 *
 * Many exports are player-centric: every game appears twice, once from each player's side, with
 * the scores swapped. Treating those as two games would seat everybody twice. Rows for the same
 * two players in the same round are folded into one, and if the two sides disagree — different
 * scores, a different table — that is reported, not silently resolved: the director needs to know
 * the source contradicts itself.
 */
export function mergeMatches(matches: ExternalMatch[], warnings: ParseWarning[]): ExternalMatch[] {
  const merged = new Map<string, ExternalMatch>();

  for (const m of matches) {
    const pair = m.b ? [m.a.key, m.b.key].sort().join("\u0000") : `${m.a.key}\u0000bye`;
    const key = `${m.round ?? "?"}\u0001${pair}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...m, rows: [...m.rows] });
      continue;
    }

    /* The second view of the same game: orient it to the first, then reconcile. */
    const flipped = !!m.b && existing.a.key === m.b.key;
    const scoreA = flipped ? m.scoreB : m.scoreA;
    const scoreB = flipped ? m.scoreA : m.scoreB;
    const aFirst = m.aFirst === null ? null : flipped ? !m.aFirst : m.aFirst;
    const who = `${existing.a.name} v ${existing.b?.name ?? "bye"}`;

    if (existing.scoreA === null && scoreA !== null) existing.scoreA = scoreA;
    else if (scoreA !== null && existing.scoreA !== scoreA)
      warnings.push({ level: "error", message: `The source gives two different scores for ${who} (rows ${[...existing.rows, ...m.rows].join(", ")}).` });

    if (existing.scoreB === null && scoreB !== null) existing.scoreB = scoreB;
    else if (scoreB !== null && existing.scoreB !== scoreB)
      warnings.push({ level: "error", message: `The source gives two different scores for ${who} (rows ${[...existing.rows, ...m.rows].join(", ")}).` });

    if (existing.table === null) existing.table = m.table;
    else if (m.table !== null && m.table !== existing.table)
      warnings.push({ level: "error", message: `The source gives two different tables for ${who}: ${existing.table} and ${m.table}.` });

    if (existing.aFirst === null) existing.aFirst = aFirst;
    else if (aFirst !== null && aFirst !== existing.aFirst)
      warnings.push({ level: "warn", message: `The source disagrees about who goes first in ${who}.` });

    if (!existing.division) existing.division = m.division;
    existing.rows.push(...m.rows);
  }

  return [...merged.values()];
}

/* -------------------------------------------------------------------------- */
/* The whole source                                                            */
/* -------------------------------------------------------------------------- */

export function parseSource(text: string, options: { defaultRound?: number | null } = {}): ParsedSource {
  const defaultRound = options.defaultRound ?? null;
  const warnings: ParseWarning[] = [];

  const grids = gridsFrom(text);
  const all: ExternalMatch[] = [];
  const standings: ExternalStanding[] = [];
  const recognised = new Set<FieldId>();
  let rowCount = 0;

  for (const grid of grids) {
    const read = readGrid(grid, defaultRound);
    all.push(...read.matches);
    standings.push(...read.standings);
    read.recognised.forEach((f) => recognised.add(f));
    warnings.push(...read.warnings);
    rowCount += read.rows;
  }

  if (grids.length === 0)
    warnings.push({ level: "error", message: "Nothing that looks like a table was found in that." });
  else if (all.length === 0 && standings.length === 0)
    warnings.push({
      level: "error",
      message:
        "A table was found, but no header row this importer recognises. It needs columns such as Player, Opponent and Table (and Score where there are results).",
    });

  const matches = mergeMatches(all, warnings);
  return { matches, standings, warnings, recognised: [...recognised], rowCount };
}

/** The rounds a parse mentions, ascending. */
export function roundsIn(parsed: ParsedSource): number[] {
  return [...new Set(parsed.matches.map((m) => m.round).filter((r): r is number => r !== null))].sort((a, b) => a - b);
}
