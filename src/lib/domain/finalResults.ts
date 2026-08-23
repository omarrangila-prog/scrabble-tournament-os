/**
 * What each player is called at the end, and what their certificate says.
 *
 * Every title here is decided by arithmetic on verified games. Nothing is chosen, weighted or
 * described by a model — the organizer's rule, and the right one: a tournament that cannot
 * explain why somebody came second has not finished, it has just stopped.
 *
 * So each title states a fact that can be checked against the board list on the wall, and the
 * summary underneath is the same numbers written out.
 */

export interface FinalPlayer {
  id: string;
  number: string;
  name: string;
  email: string;
  division: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  spread: number;
  bestScore: number | null;
  bestMargin: number | null;
  bestAgainst: string | null;
}

export interface Award {
  /** The certificate's headline. Unique to this person's tournament. */
  title: string;
  /** The numbers behind it, in a sentence. */
  summary: string;
  /** One line that is true of them and nobody else, where there is one. */
  note: string | null;
  kind: "placement" | "achievement" | "participation";
}

const DIVISION: Record<string, string> = {
  beginner: "Beginner",
  recreational: "Recreational",
  advanced: "Advanced",
};

export function divisionName(raw: string): string {
  return DIVISION[raw] ?? (raw ? raw[0].toUpperCase() + raw.slice(1) : "Open");
}

const PLACE = ["Champion", "Runner-up", "Third place"];

/**
 * How many of a category win something: half of it, rounded down.
 *
 * The organizer's rule, and it is a rule about the room rather than about the game — at an
 * event this young, half the field going home with something recognised is the point.
 *
 * Rounded down so it can never be more than half: nineteen players is nine winners, not ten.
 * Counted from the players who actually played, because a prize list built from the
 * registration list would award somebody who never sat down.
 */
export function winnersIn(playersInDivision: number): number {
  return Math.max(1, Math.floor(playersInDivision / 2));
}

/** "+142" or "−87": a spread reads as a direction before it reads as a number. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/**
 * The whole field's superlatives, worked out once.
 *
 * Computed across everybody rather than per player, because "highest score of the day" is a
 * fact about the day. Ties keep every holder: two people who both scored 512 both hold it,
 * and inventing a tiebreak to make the sentence singular would be inventing a result.
 */
export interface Superlatives {
  highestScore: number | null;
  highestScoreIds: Set<string>;
  biggestWin: number | null;
  biggestWinIds: Set<string>;
  bestSpread: number | null;
  bestSpreadIds: Set<string>;
}

export function superlatives(players: FinalPlayer[]): Superlatives {
  const played = players.filter((p) => p.played > 0);

  const top = (list: FinalPlayer[], pick: (p: FinalPlayer) => number | null) => {
    const values = list.map(pick).filter((v): v is number => v !== null);
    if (values.length === 0) return { value: null as number | null, ids: new Set<string>() };
    const best = Math.max(...values);
    return { value: best, ids: new Set(list.filter((p) => pick(p) === best).map((p) => p.id)) };
  };

  const score = top(played, (p) => p.bestScore);
  const margin = top(played, (p) => p.bestMargin);
  const spread = top(played, (p) => p.spread);

  return {
    highestScore: score.value,
    highestScoreIds: score.ids,
    biggestWin: margin.value,
    biggestWinIds: margin.ids,
    bestSpread: spread.value,
    bestSpreadIds: spread.ids,
  };
}

/**
 * One player's award.
 *
 * Placement first, because that is what a tournament is for. Everything else is a way of
 * saying something true to the sixty people who did not finish in the top three — and it has
 * to be true, so each branch is a fact about their own games.
 */
export function awardFor(p: FinalPlayer, all: FinalPlayer[], sup = superlatives(all)): Award {
  const division = divisionName(p.division);

  if (p.played === 0) {
    return {
      title: "For taking part",
      summary: `Entered the ${division} division at Blufy's AlphaBattle.`,
      note: null,
      kind: "participation",
    };
  }

  const record = `Played ${p.played}, won ${p.wins}, lost ${p.losses}${
    p.draws ? `, drew ${p.draws}` : ""
  }. Spread ${signed(p.spread)}.`;

  const best =
    p.bestScore !== null
      ? ` Best game ${p.bestScore}${p.bestAgainst ? ` against ${p.bestAgainst}` : ""}.`
      : "";

  const summary = record + best;

  /* A note only where it is theirs alone or shared with one other. */
  const note = (() => {
    if (sup.highestScore !== null && sup.highestScoreIds.has(p.id))
      return `Highest single score of the day: ${sup.highestScore}.`;
    if (sup.biggestWin !== null && sup.biggestWinIds.has(p.id) && sup.biggestWin > 0)
      return `Biggest winning margin of the day: ${signed(sup.biggestWin)}.`;
    if (sup.bestSpread !== null && sup.bestSpreadIds.has(p.id))
      return `Best total spread of the day: ${signed(sup.bestSpread)}.`;
    if (p.wins === p.played && p.played > 1) return `Won every game.`;
    return null;
  })();

  /*
   * The top three are named; the rest of the winning half are told they are in it.
   *
   * "Fourth in Beginner" and "a winner in Beginner" are the same fact, and only one of them
   * reads like something worth keeping.
   */
  const inDivision = all.filter((x) => x.division === p.division && x.played > 0).length;
  const winners = winnersIn(inDivision);

  if (p.rank <= 3) {
    return {
      title: `${PLACE[p.rank - 1]} — ${division}`,
      summary,
      note,
      kind: "placement",
    };
  }

  if (p.rank <= winners) {
    return {
      title: `Winner — ${division}`,
      summary,
      note: note ?? `Finished ${ordinal(p.rank)} of ${inDivision}, in the winning half.`,
      kind: "placement",
    };
  }

  if (p.wins === p.played && p.played > 1) {
    return { title: `Unbeaten — ${division}`, summary, note, kind: "achievement" };
  }

  if (note) {
    return { title: note.replace(/:.*$/, "").trim(), summary, note, kind: "achievement" };
  }

  if (p.wins > p.losses) {
    return {
      title: `A winning record — ${division}`,
      summary,
      note: null,
      kind: "achievement",
    };
  }

  /*
   * The last resort, and it still has to be worth keeping.
   *
   * This said "9th in Beginner", which is true and is also the least interesting true thing
   * about somebody's afternoon — and most of the people reading it are between eight and
   * thirteen. Their placing is on the wall and in the summary below; the certificate says
   * what they did, which is that they turned up and played every one of their games.
   */
  return {
    title: `Played ${p.played} ${p.played === 1 ? "game" : "games"} — ${division}`,
    summary,
    note: null,
    kind: "participation",
  };
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
