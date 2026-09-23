/**
 * The draw made the night before, and what the morning does to it.
 *
 * Preparing Round 1 in advance saves twenty minutes at exactly the moment twenty minutes are
 * worth most. The catch is that a draw made from the registration list is a draw for a room
 * that does not exist yet: some of those people will not come, and a pairing whose opponent
 * never arrives is worse than no pairing, because somebody sits at a table waiting.
 *
 * So the night-before draw is never published. It is reconciled: on the morning, once
 * check-in has settled, every pair is checked against who actually turned up. A pair where
 * both arrived survives untouched — that is the whole saving. A pair where one did not is
 * broken, and the player who came is handed back to the engine to be paired properly with
 * the other survivors.
 *
 * Nothing here decides the final draw. It decides which parts of a guess are still usable,
 * and the engine does the rest from the locked roster.
 */

export interface PreliminaryPlayer {
  id: string;
  fullName: string;
  playerNumber: string;
  division: string;
}

export interface PreliminaryPair {
  division: string;
  a: PreliminaryPlayer;
  b: PreliminaryPlayer;
}

export interface PreliminaryDraw {
  pairs: PreliminaryPair[];
  /** One per odd division: nobody to play, pending whoever else registers. */
  unpaired: PreliminaryPlayer[];
  divisions: string[];
}

export interface Reconciliation {
  /** Both players arrived. These can be published as they stand. */
  intact: PreliminaryPair[];
  /** One player arrived and one did not. The pair is void; the survivor needs a new opponent. */
  broken: { pair: PreliminaryPair; missing: PreliminaryPlayer; survivor: PreliminaryPlayer }[];
  /**
   * Everybody who arrived and now has no opponent: survivors of broken pairs, players who
   * were unpaired in the draw, and anybody who checked in without being in it at all.
   */
  needPairing: PreliminaryPlayer[];
  /** Registered, drawn, and did not come. */
  noShows: PreliminaryPlayer[];
  /** Arrived without appearing in the night-before draw — a walk-in, or a late registration. */
  unexpected: PreliminaryPlayer[];
}

/**
 * Draws Round 1 from the registration list.
 *
 * Within a category, never across one — the same rule that governs every other draw in this
 * system. `random` is supplied by the caller so a preliminary draw can be reproduced: a
 * director who prints one at midnight and regenerates it at nine should get the same sheet,
 * or the printed one becomes a second version of the truth.
 */
export function preliminaryDraw(
  registered: PreliminaryPlayer[],
  divisions: string[],
  random: () => number,
): PreliminaryDraw {
  const pairs: PreliminaryPair[] = [];
  const unpaired: PreliminaryPlayer[] = [];

  for (const division of divisions) {
    const pool = shuffle(
      registered.filter((p) => p.division === division),
      random,
    );

    for (let i = 0; i + 1 < pool.length; i += 2) {
      pairs.push({ division, a: pool[i], b: pool[i + 1] });
    }

    if (pool.length % 2 === 1) unpaired.push(pool[pool.length - 1]);
  }

  return { pairs, unpaired, divisions };
}

/**
 * What the morning leaves of it.
 *
 * `arrived` is the set of player ids actually checked in. Everything else is derived from
 * that one fact, which is the only fact the morning adds.
 */
export function reconcile(
  draw: PreliminaryDraw,
  arrived: PreliminaryPlayer[],
): Reconciliation {
  const here = new Set(arrived.map((p) => p.id));

  const intact: PreliminaryPair[] = [];
  const broken: Reconciliation["broken"] = [];
  const needPairing: PreliminaryPlayer[] = [];
  const noShows: PreliminaryPlayer[] = [];

  for (const pair of draw.pairs) {
    const aHere = here.has(pair.a.id);
    const bHere = here.has(pair.b.id);

    if (aHere && bHere) {
      intact.push(pair);
      continue;
    }

    if (!aHere && !bHere) {
      /* Neither came. Nothing to salvage and nobody to re-pair. */
      noShows.push(pair.a, pair.b);
      continue;
    }

    const survivor = aHere ? pair.a : pair.b;
    const missing = aHere ? pair.b : pair.a;

    broken.push({ pair, missing, survivor });
    needPairing.push(survivor);
    noShows.push(missing);
  }

  /* Drawn without an opponent: if they came, they still need one. */
  for (const p of draw.unpaired) {
    if (here.has(p.id)) needPairing.push(p);
    else noShows.push(p);
  }

  /*
   * Anybody who arrived and was not in the draw at all — a walk-in added at the door, or
   * somebody who registered after the sheet was printed. They need pairing like everybody
   * else, and naming them separately is what stops them being quietly overlooked.
   */
  const drawn = new Set([
    ...draw.pairs.flatMap((p) => [p.a.id, p.b.id]),
    ...draw.unpaired.map((p) => p.id),
  ]);
  const unexpected = arrived.filter((p) => !drawn.has(p.id));
  needPairing.push(...unexpected);

  return { intact, broken, needPairing, noShows, unexpected };
}

/**
 * One line a director can act on.
 *
 * Leads with what survived, because that is the saving the whole exercise was for, and then
 * with the work left.
 */
export function reconciliationSummary(out: Reconciliation): string {
  const parts = [`${out.intact.length} pair${out.intact.length === 1 ? "" : "s"} still stand`];

  if (out.broken.length > 0) {
    parts.push(`${out.broken.length} lost an opponent`);
  }
  if (out.unexpected.length > 0) {
    parts.push(`${out.unexpected.length} arrived unexpectedly`);
  }
  if (out.needPairing.length > 0) {
    parts.push(`${out.needPairing.length} need pairing`);
  } else {
    parts.push("nobody left to pair");
  }

  return parts.join(" · ");
}

/**
 * Fisher-Yates, driven by the caller's own source of randomness.
 *
 * `sort(() => random() - 0.5)` is the usual shortcut and it is not a shuffle: the comparator
 * is inconsistent, so the result is biased in a way that depends on the sort implementation.
 * For a tournament draw that bias is somebody's opponent.
 */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
