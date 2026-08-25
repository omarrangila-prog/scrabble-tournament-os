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

/**
 * What one player's certificate says about their day.
 *
 * There was a version of this that handed every player a different coined title — Nail-Biter,
 * Personal Best, Strong Finish. Each was earned by something real, and the whole idea was
 * still wrong: fifty-nine people holding fifty-nine different labels invites them to compare
 * labels rather than results, and a coined phrase is not something the tournament actually
 * awarded anybody.
 *
 * So every certificate now says the same kind of thing, and the only thing that differs
 * between them is what the player did: the division, how many rounds they played, where they
 * finished, their record and their spread. All of it is on the official report, and none of
 * it is a name somebody invented afterwards.
 */
export function citationFor(player: PlayerRecord, division: DivisionRecord): string {
  const rounds = player.rounds.length;
  const games = `${rounds} round${rounds === 1 ? "" : "s"}`;

  if (!player.ranked) {
    return (
      `played ${games} in the ${division.name} division at Blufy's AlphaBattle on ` +
      `23 August 2026 in Karachi.`
    );
  }

  const field = division.players.filter((p) => p.ranked).length;
  return (
    `played ${games} in the ${division.name} division at Blufy's AlphaBattle on ` +
    `23 August 2026 in Karachi, finishing ${ordinal(player.rank!)} of ${field} ` +
    `with a record of ${formatRecord(player)} and a spread of ${withSign(player.spread)}.`
  );
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
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
