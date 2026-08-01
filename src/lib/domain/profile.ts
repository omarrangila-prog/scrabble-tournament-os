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
  const r = rng(player.id.split("-").reduce((a, c) => a + c.charCodeAt(0), 0) * 7919);

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

  // Career figures beyond this event come from the player's prior history.
  const priorEvents = player.tournamentHistory.length;
  const careerGames = games.length + priorEvents * Math.floor(6 + r() * 6);
  const careerWins = wins + Math.round(priorEvents * (3 + r() * 3));

  return {
    eventsPlayed: priorEvents + 1,
    gamesPlayed: careerGames,
    wins: careerWins,
    losses: Math.max(0, careerGames - careerWins - draws),
    draws,
    winRate: careerGames > 0 ? Math.round((careerWins / careerGames) * 100) : 0,
    highestGame: highest || Math.round(430 + r() * 120),
    averageScore: games.length ? Math.round(totalScore / games.length) : 0,
    bestFinish: player.tournamentHistory[0]?.place ?? "—",
    titlesWon: player.seed <= 3 ? Math.floor(1 + r() * 2) : player.seed <= 10 ? (r() < 0.4 ? 1 : 0) : 0,
    peakRating: player.rating ? player.rating + Math.round(10 + r() * 70) : 0,
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
  if (player.seed <= 5) {
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

export function documents(player: Player): ProfileDocument[] {
  const r = rng(player.seed * 977 + player.rating);
  const base: ProfileDocument[] = [
    {
      id: "doc-id",
      name: "National identity document",
      kind: "identity",
      uploadedAt: "2026-06-12T09:20:00+05:00",
      verified: isVerified(player),
      sizeKb: Math.round(180 + r() * 320),
    },
    {
      id: "doc-reg",
      name: "Tournament registration form",
      kind: "registration",
      uploadedAt: "2026-06-18T14:05:00+05:00",
      verified: true,
      sizeKb: Math.round(90 + r() * 140),
    },
    {
      id: "doc-rating",
      name: "Rating certificate",
      kind: "rating",
      uploadedAt: "2026-05-30T11:42:00+05:00",
      verified: player.ratingStatus === "rated",
      sizeKb: Math.round(60 + r() * 90),
    },
  ];

  if (player.division === "youth-u18" || player.division === "junior-u14") {
    base.push({
      id: "doc-consent",
      name: "Parental consent form",
      kind: "consent",
      uploadedAt: "2026-06-20T10:15:00+05:00",
      verified: true,
      sizeKb: Math.round(70 + r() * 60),
    });
  }
  return base;
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
