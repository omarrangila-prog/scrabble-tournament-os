/**
 * Which physical table each board is played on.
 *
 * Pairing numbers boards 1, 2, 3… in the order it generates them. In a room that is fine
 * until somebody has to find their seat: the beginners are at tables 1 to 5 and the
 * recreational players at 6 to 12, so "Board 3" and "Table 3" are different places and the
 * player is standing in the wrong one.
 *
 * This maps a round's boards onto the tables that division actually occupies, so the number
 * on a phone is the number painted on the table.
 *
 * Two things it deliberately does not do:
 *
 *   It does not invent tables. If a division has more pairs than tables, it says so rather
 *   than seating two games at table 7 — a room cannot be fixed by arithmetic.
 *
 *   It does not assume tables are consecutive. Venues have pillars, doors and a table that
 *   wobbles, so "1-3, 7, 9-11" has to be as easy to say as "1-12".
 */

export interface DivisionTables {
  division: string;
  /** The table numbers this division occupies, in seating order. */
  tables: number[];
}

/**
 * Reads a table specification.
 *
 * Accepts ranges, single numbers and any mixture: "1-5", "1,2,3,5,7,8", "1-3, 7, 9-11".
 * Duplicates are dropped and the result is sorted, because two boards cannot share a table
 * however the organizer typed it.
 *
 * A reversed range reads as a range: somebody typing "12-6" means tables 6 to 12, and
 * refusing it would be pedantry about the order of two numbers.
 */
export function parseTableSpec(spec: string): number[] {
  const tables = new Set<number>();

  for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);

    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      const [low, high] = from <= to ? [from, to] : [to, from];

      /* A guard, not a preference: "1-9999" would otherwise build ten thousand tables. */
      if (high - low > 500) continue;
      for (let n = low; n <= high; n++) if (n > 0) tables.add(n);
      continue;
    }

    const single = Number(part);
    if (Number.isInteger(single) && single > 0) tables.add(single);
  }

  return [...tables].sort((a, b) => a - b);
}

/** Back to the shortest text that means the same thing, so an edited list stays readable. */
export function formatTableSpec(tables: number[]): string {
  const sorted = [...new Set(tables)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (const n of sorted.slice(1)) {
    if (n === previous + 1) {
      previous = n;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = n;
    previous = n;
  }
  parts.push(start === previous ? `${start}` : `${start}-${previous}`);

  return parts.join(", ");
}

export interface TableProblem {
  division: string;
  needed: number;
  available: number;
  message: string;
}

/**
 * Tables used by more than one division.
 *
 * Worth its own check because it is invisible until the day: two divisions both listing
 * table 6 looks fine in the settings and puts four people at one table in the room.
 */
export function overlappingTables(plan: DivisionTables[]): number[] {
  const seen = new Map<number, string>();
  const clashes = new Set<number>();

  for (const entry of plan) {
    for (const table of entry.tables) {
      const owner = seen.get(table);
      if (owner !== undefined && owner !== entry.division) clashes.add(table);
      else seen.set(table, entry.division);
    }
  }

  return [...clashes].sort((a, b) => a - b);
}

/**
 * Assigns a real table to every pairing, division by division.
 *
 * Byes are given no table. A player with a bye has nobody to play, and sending them to sit
 * somewhere is how they end up asking a volunteer why the seat opposite is empty.
 */
export function assignTables<T extends { division: string; board: number; playerB: string | null }>(
  pairings: T[],
  plan: DivisionTables[],
): { seated: T[]; problems: TableProblem[] } {
  const byDivision = new Map(plan.map((p) => [p.division, p.tables]));
  const problems: TableProblem[] = [];
  const seated: T[] = [];

  /* Grouped so each division's tables are handed out in order, from its own list. */
  const groups = new Map<string, T[]>();
  for (const pairing of pairings) {
    const list = groups.get(pairing.division) ?? [];
    list.push(pairing);
    groups.set(pairing.division, list);
  }

  for (const [division, group] of groups) {
    const played = group.filter((p) => p.playerB !== null);
    const byes = group.filter((p) => p.playerB === null);
    const tables = byDivision.get(division) ?? [];

    if (tables.length < played.length) {
      problems.push({
        division,
        needed: played.length,
        available: tables.length,
        message:
          tables.length === 0
            ? `No tables are set aside for the ${division} division.`
            : `The ${division} division needs ${played.length} tables and has ${tables.length}.`,
      });
    }

    played.forEach((pairing, i) => {
      /*
       * Beyond the list, the original number is kept rather than being overwritten with
       * something invented. The problem above is the honest signal; a made-up table would
       * hide it until somebody was standing in the room.
       */
      seated.push(i < tables.length ? { ...pairing, board: tables[i] } : pairing);
    });

    seated.push(...byes);
  }

  return { seated, problems };
}
