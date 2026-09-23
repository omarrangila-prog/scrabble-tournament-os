/**
 * Provisional pairing, while people are still arriving.
 *
 * Before a round is locked, the draw is a guess that improves. Somebody checks in and has
 * nobody to play; somebody else checks in and now they do. Showing that as it happens lets a
 * director see the room filling up in the shape it will actually play in, rather than waiting
 * for the door to close and finding out then that Advanced has seven people in it.
 *
 * Two rules make this safe rather than the chaos it could easily be:
 *
 *   1. It never touches a published round. Nothing here writes anything; it is a view of
 *      what a draw would look like if the door shut now.
 *   2. It only exists before the lock. After the lock the draw is the engine's, and after
 *      START the boards on the wall are fixed — enforced in the database, not here. What a
 *      running round still accepts is a *new* match between two late arrivals, which is a
 *      different thing from this card and lives in `rollingEntry.ts`.
 *
 * Within a category, never across one. A beginner waiting for an opponent waits for another
 * beginner, however long that takes, because the alternative is the failure an acceptance
 * tester already reported.
 */

export interface ProvisionalPlayer {
  id: string;
  fullName: string;
  playerNumber: string;
  division: string;
  /** When they arrived. Pairs form in arrival order, which is what people can see happening. */
  checkedInAt: string;
}

export interface ProvisionalPair {
  division: string;
  a: ProvisionalPlayer;
  b: ProvisionalPlayer;
}

export interface ProvisionalDivision {
  division: string;
  pairs: ProvisionalPair[];
  /** At most one per category: an odd arrival with nobody yet to play. */
  waiting: ProvisionalPlayer | null;
  arrived: number;
}

export interface ProvisionalDraw {
  divisions: ProvisionalDivision[];
  /** Everybody checked in, across every category. */
  arrived: number;
  /** How many are currently without an opponent — one per odd category, at most. */
  waiting: number;
  pairs: number;
}

/**
 * The draw as it stands right now.
 *
 * Pairs are formed in arrival order rather than by rating or standing, and that is
 * deliberate: this is not the real draw and must not look like one. The real draw is made by
 * the engine from the locked roster, against the standings, with repeat-opponent and bye
 * history taken into account. What this answers is a smaller question — "has everybody got
 * somebody to play?" — and answering it by arrival order makes it obvious to anybody
 * watching that the pairing is provisional.
 */
export function provisionalDraw(
  players: ProvisionalPlayer[],
  divisions: string[],
): ProvisionalDraw {
  const out: ProvisionalDivision[] = [];

  for (const division of divisions) {
    const pool = players
      .filter((p) => p.division === division)
      .sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));

    const pairs: ProvisionalPair[] = [];
    for (let i = 0; i + 1 < pool.length; i += 2) {
      pairs.push({ division, a: pool[i], b: pool[i + 1] });
    }

    /* An odd arrival is waiting, not on a bye. A bye is a decision the director makes. */
    const waiting = pool.length % 2 === 1 ? pool[pool.length - 1] : null;

    out.push({ division, pairs, waiting, arrived: pool.length });
  }

  return {
    divisions: out,
    arrived: out.reduce((n, d) => n + d.arrived, 0),
    waiting: out.filter((d) => d.waiting !== null).length,
    pairs: out.reduce((n, d) => n + d.pairs.length, 0),
  };
}

/**
 * What to say about a category, in one line.
 *
 * Written for a director glancing at a screen between conversations, so it leads with the
 * thing that needs doing — somebody without an opponent — rather than with a count.
 */
export function provisionalLine(division: ProvisionalDivision): string {
  if (division.arrived === 0) return "Nobody here yet";

  if (division.waiting) {
    return `${division.pairs.length} pair${division.pairs.length === 1 ? "" : "s"} · ${division.waiting.fullName} is waiting for an opponent`;
  }

  return `${division.pairs.length} pair${division.pairs.length === 1 ? "" : "s"} · everybody has somebody`;
}

/**
 * Whether the room is in a shape that can be locked.
 *
 * Never a refusal — an odd category is completely normal and resolves itself with a bye. It
 * is a heads-up, so the director locks knowing that somebody is about to sit out rather than
 * discovering it in the published draw.
 */
export function lockWarnings(draw: ProvisionalDraw): string[] {
  const out: string[] = [];

  for (const d of draw.divisions) {
    if (d.arrived === 1) {
      out.push(
        `${d.division} has only ${d.waiting?.fullName ?? "one player"} — they can only take a bye. Move them to another category, or wait for somebody else.`,
      );
    } else if (d.waiting) {
      out.push(`${d.division} has an odd number here, so ${d.waiting.fullName} would take the bye.`);
    }
  }

  return out;
}
