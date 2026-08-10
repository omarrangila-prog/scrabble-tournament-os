/**
 * Player profile enrichment.
 *
 * Derives the richer identity data the profile screen shows — portrait, career
 * record, achievements, rating history and documents — deterministically from
 * the player record, so no extra state has to be stored or synchronised.
 */

import { Pairing, Player, Tournament } from "./types";
import { rng } from "./seed";
import { computeStandings } from "../engine/standings";

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  year: number;
  tier: "gold" | "silver" | "bronze" | "milestone";
}

export interface ProfileDocument {
  id: string;
  name: string;
  kind: "identity" | "registration" | "medical" | "consent" | "rating";
  uploadedAt: string;
  verified: boolean;
  sizeKb: number;
}

export interface RatingPoint {
  label: string;
  rating: number;
}

export interface CareerStats {
  eventsPlayed: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  highestGame: number;
  averageScore: number;
  bestFinish: string;
  titlesWon: number;
  peakRating: number;
  currentStreak: { type: "win" | "loss" | "none"; count: number };
}

/** ISO-3166 alpha-2 → flag emoji, used for the profile country badge. */
export function flagOf(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export const PLAYER_COUNTRY = { code: "PK", name: "Pakistan" };

/** A player is "online" in the demo when they are checked in and playing. */
export function onlineStatus(player: Player): { online: boolean; label: string } {
  if (player.checkIn === "checked-in") return { online: true, label: "At the venue" };
  if (player.checkIn === "late") return { online: false, label: "Expected shortly" };
  if (player.checkIn === "withdrawn") return { online: false, label: "Withdrawn" };
  if (player.checkIn === "absent") return { online: false, label: "Not present" };
  return { online: false, label: "Not arrived" };
}

/** Verified once identity documents are on file — top-rated players in the demo. */
export function isVerified(player: Player): boolean {
  return player.ratingStatus === "rated" && player.seed <= 12;
}

export function careerStats(
  player: Player,
  pairings: Pairing[],
): CareerStats {

  const games = pairings.filter(
    (p) =>
      p.playerBId !== null &&
      p.scoreA !== undefined &&
      (p.playerAId === player.id || p.playerBId === player.id),
  );

  let wins = 0;
  let draws = 0;
  let totalScore = 0;
  let highest = 0;
  const results: ("win" | "loss" | "draw")[] = [];

  for (const g of games) {
    const isA = g.playerAId === player.id;
    const mine = isA ? g.scoreA! : g.scoreB!;
    const theirs = isA ? g.scoreB! : g.scoreA!;
    totalScore += mine;
    highest = Math.max(highest, mine);
    if (mine > theirs) {
      wins += 1;
      results.push("win");
    } else if (mine < theirs) {
      results.push("loss");
    } else {
      draws += 1;
      results.push("draw");
    }
  }

  // Current streak from the most recent games backwards.
  let streakCount = 0;
  let streakType: "win" | "loss" | "none" = "none";
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === "draw") break;
    if (streakType === "none") {
      streakType = results[i] as "win" | "loss";
      streakCount = 1;
    } else if (results[i] === streakType) {
      streakCount += 1;
    } else break;
  }

  /*
   * Only games that were actually played are counted.
   *
   * This used to pad the totals: career games invented from the number of prior
   * events, a highest game of "430 plus a bit" for anyone who had not played one,
   * titles handed out to whoever happened to be seeded in the top three, and a
   * peak rating set above the current one. Harmless against demo data, and a
   * fabrication the moment a real name is attached to the page — the profile would
   * have told a first-time entrant they were a national champion.
   *
   * Prior events are counted, because `tournamentHistory` is recorded rather than
   * guessed. What happened inside them is not invented.
   */
  const priorEvents = player.tournamentHistory.length;
  const titles = player.tournamentHistory.filter((h) =>
    /^(1st|winner|champion)/i.test(h.place.trim()),
  ).length;

  return {
    eventsPlayed: priorEvents + 1,
    gamesPlayed: games.length,
    wins,
    losses: Math.max(0, games.length - wins - draws),
    draws,
    winRate: games.length > 0 ? Math.round((wins / games.length) * 100) : 0,
    highestGame: highest,
    averageScore: games.length ? Math.round(totalScore / games.length) : 0,
    bestFinish: player.tournamentHistory[0]?.place ?? "—",
    titlesWon: titles,
    // No rating history exists, so there is no peak to report beyond the current one.
    peakRating: player.rating,
    currentStreak: { type: streakType, count: streakCount },
  };
}

/** Rating trajectory across the last eight rating periods plus this event. */
export function ratingHistory(player: Player, currentPerformance: number): RatingPoint[] {
  if (!player.rating) return [];
  const r = rng(player.rating * 31 + player.seed);
  const points: RatingPoint[] = [];
  let value = player.rating - Math.round(40 + r() * 90);

  const labels = ["Jan 25", "Mar 25", "May 25", "Jul 25", "Sep 25", "Nov 25", "Jan 26", "Apr 26"];
  for (const label of labels) {
    value += Math.round((r() - 0.42) * 46);
    points.push({ label, rating: Math.max(600, value) });
  }
  points.push({ label: "Now", rating: player.rating });
  if (currentPerformance > 0) {
    points.push({ label: "Live", rating: Math.round((player.rating + currentPerformance) / 2) });
  }
  return points;
}

export function achievements(player: Player, stats: CareerStats): Achievement[] {
  const out: Achievement[] = [];

  if (stats.titlesWon > 0) {
    out.push({
      id: "title",
      title: stats.titlesWon > 1 ? `${stats.titlesWon}× National Champion` : "National Champion",
      detail: "Won the national championship title",
      year: 2025,
      tier: "gold",
    });
  }
  /*
   * A high seed is only an achievement where seeding means strength. On the roster
   * built from registrations it means nothing more than registering early, so
   * awarding the first five entrants a gold badge would be reading significance
   * into the order a form was filled in.
   */
  if (player.ratingStatus === "rated" && player.seed <= 5) {
    out.push({
      id: "top-seed",
      title: `Top ${player.seed} Seed`,
      detail: `Seeded ${player.seed} in the ${player.division.replace(/-/g, " ")} division`,
      year: 2026,
      tier: "gold",
    });
  }
  if (stats.highestGame >= 500) {
    out.push({
      id: "high-game",
      title: "500+ Game Club",
      detail: `Highest recorded game: ${stats.highestGame} points`,
      year: 2026,
      tier: "silver",
    });
  }
  if (stats.winRate >= 60) {
    out.push({
      id: "win-rate",
      title: "Consistent Performer",
      detail: `${stats.winRate}% career win rate`,
      year: 2026,
      tier: "silver",
    });
  }
  if (stats.currentStreak.type === "win" && stats.currentStreak.count >= 3) {
    out.push({
      id: "streak",
      title: `${stats.currentStreak.count}-Game Win Streak`,
      detail: "Currently unbeaten in this tournament",
      year: 2026,
      tier: "bronze",
    });
  }
  for (const h of player.tournamentHistory) {
    out.push({
      id: `hist-${h.year}-${h.event}`,
      title: h.event,
      detail: `Finished ${h.place}`,
      year: h.year,
      tier: "milestone",
    });
  }
  if (stats.eventsPlayed >= 3) {
    out.push({
      id: "veteran",
      title: "Tournament Veteran",
      detail: `${stats.eventsPlayed} championship events played`,
      year: 2026,
      tier: "milestone",
    });
  }

  return out;
}

/**
 * Documents held for a player.
 *
 * Empty, because nothing is held. This used to list an identity document, a rating
 * certificate and a parental consent form, each with an upload date, a file size
 * and a verified tick — none of which existed. Against demo data that was set
 * dressing; on a page showing a real person's name it is a records system claiming
 * to hold papers it has never seen, which is the sort of thing somebody relies on.
 *
 * The registration form does not collect documents. When it collects one — a
 * payment receipt is the likely first — it can be listed here from the row that
 * actually stores it.
 */
export function documents(): ProfileDocument[] {
  return [];
}

/** Per-round result grid used by the profile heatmap. */
export function resultHeatmap(
  player: Player,
  pairings: Pairing[],
  totalRounds: number,
): { round: number; result: "win" | "loss" | "draw" | "bye" | "pending" | "none"; spread: number }[] {
  return Array.from({ length: totalRounds }, (_, i) => {
    const round = i + 1;
    const g = pairings.find(
      (p) => p.round === round && (p.playerAId === player.id || p.playerBId === player.id),
    );
    if (!g) return { round, result: "none" as const, spread: 0 };
    if (g.playerBId === null) return { round, result: "bye" as const, spread: 50 };
    if (g.scoreA === undefined || g.status !== "verified")
      return { round, result: "pending" as const, spread: 0 };

    const isA = g.playerAId === player.id;
    const mine = isA ? g.scoreA : g.scoreB!;
    const theirs = isA ? g.scoreB! : g.scoreA;
    return {
      round,
      result: mine > theirs ? ("win" as const) : mine < theirs ? ("loss" as const) : ("draw" as const),
      spread: mine - theirs,
    };
  });
}

/** Rank after each completed round, for the profile progression chart. */
export function rankProgression(
  player: Player,
  players: Player[],
  pairings: Pairing[],
  tournament: Tournament,
): { round: number; rank: number; spread: number }[] {
  return Array.from({ length: tournament.currentRound }, (_, i) => {
    const table = computeStandings(players, pairings, tournament, {
      division: player.division,
      upToRound: i + 1,
    });
    const row = table.find((x) => x.playerId === player.id);
    return { round: i + 1, rank: row?.rank ?? 0, spread: row?.spread ?? 0 };
  });
}

/**
 * Data-derived observations for the profile's insight panel. These summarise
 * what the record shows; they are never presented as predictions or rulings.
 */
export function playerInsights(
  player: Player,
  stats: CareerStats,
  heatmap: ReturnType<typeof resultHeatmap>,
  progression: ReturnType<typeof rankProgression>,
): { title: string; body: string; tone: "success" | "warning" | "info" }[] {
  const out: { title: string; body: string; tone: "success" | "warning" | "info" }[] = [];

  const played = heatmap.filter((h) => h.result === "win" || h.result === "loss" || h.result === "draw");
  const avgSpread = played.length
    ? Math.round(played.reduce((a, b) => a + b.spread, 0) / played.length)
    : 0;

  if (stats.currentStreak.type === "win" && stats.currentStreak.count >= 2) {
    out.push({
      title: `Winning run of ${stats.currentStreak.count}`,
      body: `${player.fullName} has won the last ${stats.currentStreak.count} completed games in this event.`,
      tone: "success",
    });
  }
  if (stats.currentStreak.type === "loss" && stats.currentStreak.count >= 2) {
    out.push({
      title: `${stats.currentStreak.count} consecutive losses`,
      body: "Recent form has dipped. Worth monitoring pairing difficulty in the coming rounds.",
      tone: "warning",
    });
  }

  if (progression.length >= 2) {
    const first = progression[0].rank;
    const last = progression[progression.length - 1].rank;
    if (last < first) {
      out.push({
        title: `Climbed ${first - last} places since round 1`,
        body: `Started the event at rank ${first} and now sits at rank ${last} in the division.`,
        tone: "success",
      });
    } else if (last > first) {
      out.push({
        title: `Down ${last - first} places since round 1`,
        body: `Opened at rank ${first} and currently sits at rank ${last}.`,
        tone: "warning",
      });
    }
  }

  out.push({
    title: avgSpread >= 0 ? `Average winning margin ${avgSpread}` : `Average margin ${avgSpread}`,
    body:
      avgSpread >= 60
        ? "Games are being won decisively rather than narrowly."
        : avgSpread >= 0
          ? "Results are close — spread is likely to decide final placings."
          : "Losses have been by larger margins than the wins.",
    tone: avgSpread >= 0 ? "info" : "warning",
  });

  if (player.rating && stats.peakRating > player.rating) {
    out.push({
      title: `${stats.peakRating - player.rating} points below peak rating`,
      body: `Career peak was ${stats.peakRating}; the current rating is ${player.rating}.`,
      tone: "info",
    });
  }

  if (player.accommodation) {
    out.push({
      title: "Accommodation on file",
      body: `${player.accommodation}. The pairing engine honours this when assigning boards.`,
      tone: "info",
    });
  }

  return out;
}
