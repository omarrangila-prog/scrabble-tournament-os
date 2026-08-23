/**
 * The official record of Blufy's AlphaBattle, 23 August 2026, and what each player earned.
 *
 * The results were run in TSH and published by the Pakistan Scrabble Association; this
 * module reads that report and derives nothing that is not already in it. Placements come
 * from the official standings, not from a re-computation here: two orderings of the same
 * event, differing by one tie-break, would be worse than one.
 */

import data from "@/data/alphabattleResults.json";

export interface PlayerRound {
  round: number;
  /** Null when the player had no game that round. */
  scoreFor: number | null;
  scoreAgainst: number | null;
  opponent: string | null;
  result: "won" | "lost" | "drew" | "bye";
}

export interface PlayerRecord {
  seed: number;
  name: string;
  slug: string;
  rounds: PlayerRound[];
  /** Null for a player the official standings do not rank — a withdrawal. */
  rank: number | null;
  wins: number | null;
  losses: number | null;
  spread: number | null;
  rating: number | null;
  ranked: boolean;
}

export interface DivisionRecord {
  code: string;
  name: string;
  players: PlayerRecord[];
}

export interface EventRecord {
  name: string;
  date: string;
  divisions: DivisionRecord[];
}

/*
 * A player the standings do not rank has no rank at all in the report, so the field is
 * absent rather than empty. Filling it with null here means one shape reaches every page:
 * "not ranked" is a value to render, not a key to remember to check for.
 */
export const EVENT: EventRecord = {
  ...(data as EventRecord),
  divisions: (data as EventRecord).divisions.map((division) => ({
    ...division,
    players: division.players.map((player) => ({
      ...player,
      rank: player.rank ?? null,
      wins: player.wins ?? null,
      losses: player.losses ?? null,
      spread: player.spread ?? null,
      rating: player.rating ?? null,
    })),
  })),
};

export function allPlayers(): { player: PlayerRecord; division: DivisionRecord }[] {
  return EVENT.divisions.flatMap((division) =>
    division.players.map((player) => ({ player, division })),
  );
}

export function findPlayer(slug: string) {
  return allPlayers().find((entry) => entry.player.slug === slug) ?? null;
}

/**
 * Scores TSH writes for a game nobody sat down to play.
 *
 * A forfeit is recorded as 150–50, and a double forfeit as 50–50. They are real results and
 * are shown as such, but they are not performances: a certificate calling 150 somebody's
 * best game would be reporting an absence as an achievement.
 */
function wasPlayed(round: PlayerRound): boolean {
  const pair = [round.scoreFor, round.scoreAgainst];
  if (pair.some((s) => s === null)) return false;
  const [mine, theirs] = pair as [number, number];
  const forfeit = (mine === 150 && theirs === 50) || (mine === 50 && theirs === 150);
  return !forfeit && !(mine === 50 && theirs === 50);
}

export function playedRounds(player: PlayerRecord): PlayerRound[] {
  return player.rounds.filter(wasPlayed);
}

/** The player's own highest score in a game actually played. */
export function bestGame(player: PlayerRecord): PlayerRound | null {
  const played = playedRounds(player);
  if (played.length === 0) return null;
  return played.reduce((best, r) => ((r.scoreFor ?? 0) > (best.scoreFor ?? 0) ? r : best));
}

export function margin(round: PlayerRound): number | null {
  if (round.scoreFor === null || round.scoreAgainst === null) return null;
  return round.scoreFor - round.scoreAgainst;
}

export interface Honour {
  /** What goes on the certificate, under the name. */
  title: string;
  /** The sentence underneath it, which must be checkable against the record above. */
  citation: string;
}

const PLACE = ["Winner", "Runner-up"];

/**
 * What one player's certificate says.
 *
 * Two rules held this apart from a participation slip that repeats everybody's name.
 *
 * Every title has to be earned by something in the table on the same page — a placement, an
 * unbeaten card, the division's highest game, a win by a margin nobody else beat. A reader
 * who scrolls up must be able to see why it says what it says.
 *
 * And nothing is invented to fill a gap. A player whose day holds no superlative gets a
 * title drawn from what they actually did — their best game, their closest finish, the round
 * they turned around — rather than an inflated one. The last resort names the event and the
 * fact of having played it, which is true of everybody it will be given to.
 */
export function honourFor(player: PlayerRecord, division: DivisionRecord): Honour {
  const played = playedRounds(player);
  const games = played.length;
  const wins = played.filter((r) => r.result === "won").length;

  if (player.rank !== null && player.rank <= PLACE.length) {
    return {
      title: `${PLACE[player.rank - 1]} — ${division.name}`,
      citation:
        `Finished ${player.rank === 1 ? "first" : "second"} of ${division.players.filter((p) => p.ranked).length} ` +
        `in the ${division.name} division with ${formatRecord(player)} and a spread of ${withSign(player.spread)}.`,
    };
  }

  /*
   * Unbeaten means no loss and no draw anywhere on the card, not merely none among the
   * games that were played out. A player whose round 3 was drawn has a drawn round on the
   * page above; calling them unbeaten two inches below it would read as a mistake, because
   * it would be one.
   */
  const blemish = player.rounds.some((r) => r.result === "lost" || r.result === "drew");
  if (games >= 2 && wins === games && !blemish) {
    return {
      title: "Unbeaten",
      citation: `Won every game at Blufy's AlphaBattle — ${wins} from ${games}.`,
    };
  }

  const best = bestGame(player);
  const divisionHigh = highestGame(division);
  if (best && divisionHigh && best.scoreFor === divisionHigh.score && best.scoreFor !== null) {
    return {
      title: `High Game of the ${division.name} Division`,
      citation: `Scored ${best.scoreFor} in round ${best.round}, the highest single game in the division.`,
    };
  }

  const widest = played.reduce<PlayerRound | null>(
    (top, r) => (r.result === "won" && (margin(r) ?? 0) > (margin(top ?? r) ?? 0) ? r : top),
    null,
  );
  if (widest && (margin(widest) ?? 0) >= 200) {
    return {
      title: "Decisive Victory",
      citation:
        `Won round ${widest.round} against ${widest.opponent ?? "an opponent"} by ${margin(widest)} points, ` +
        `${widest.scoreFor}–${widest.scoreAgainst}.`,
    };
  }

  const closest = played.reduce<PlayerRound | null>(
    (tight, r) =>
      tight === null || Math.abs(margin(r) ?? 999) < Math.abs(margin(tight) ?? 999) ? r : tight,
    null,
  );
  if (closest && Math.abs(margin(closest) ?? 999) <= 10) {
    return {
      title: "Nail-Biter",
      citation:
        `Round ${closest.round} against ${closest.opponent ?? "an opponent"} was decided by ` +
        `${Math.abs(margin(closest) ?? 0)} point${Math.abs(margin(closest) ?? 0) === 1 ? "" : "s"} — ` +
        `${closest.scoreFor}–${closest.scoreAgainst}.`,
    };
  }

  /* Lost the opening round and won after it: the day turned around. */
  const first = played.find((r) => r.round === Math.min(...played.map((p) => p.round)));
  const later = played.filter((r) => first && r.round > first.round);
  if (first?.result === "lost" && later.length > 0 && later.every((r) => r.result === "won")) {
    return {
      title: "Strong Finish",
      citation: `Lost the opening game and won every round after it, finishing ${formatRecord(player)}.`,
    };
  }

  const last = played.length > 0 ? played[played.length - 1] : null;
  if (last?.result === "won") {
    return {
      title: "Finished on a Win",
      citation:
        `Closed the day by beating ${last.opponent ?? "an opponent"} in round ${last.round}, ` +
        `${last.scoreFor}\u2013${last.scoreAgainst}.`,
    };
  }

  const firstWin = played.find((r) => r.result === "won");
  if (firstWin && wins === 1) {
    return {
      title: "First Win",
      citation:
        `Beat ${firstWin.opponent ?? "an opponent"} in round ${firstWin.round}, ` +
        `${firstWin.scoreFor}\u2013${firstWin.scoreAgainst}.`,
    };
  }

  if (best && best.scoreFor !== null) {
    return {
      title: "Personal Best",
      citation:
        `Best game of the day: ${best.scoreFor} against ${best.opponent ?? "an opponent"} in round ${best.round}.`,
    };
  }

  return {
    title: "Player, Blufy's AlphaBattle",
    citation: `Took part in the ${division.name} division on 23 August 2026 in Karachi.`,
  };
}

/** The highest single game played in a division, and who scored it. */
export function highestGame(division: DivisionRecord): { score: number; by: string; round: number } | null {
  let top: { score: number; by: string; round: number } | null = null;
  for (const player of division.players) {
    for (const round of playedRounds(player)) {
      if (round.scoreFor !== null && (top === null || round.scoreFor > top.score)) {
        top = { score: round.scoreFor, by: player.name, round: round.round };
      }
    }
  }
  return top;
}

export function formatRecord(player: PlayerRecord): string {
  if (player.wins === null || player.losses === null) return "no ranked record";
  return `${trim(player.wins)}–${trim(player.losses)}`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, "");
}

export function withSign(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : String(value);
}
