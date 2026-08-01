/**
 * Category recommendation engine.
 *
 * Produces recommendations only — it never changes a player's category. Every
 * recommendation carries the factors that produced it so an organizer can see
 * the reasoning before approving, rejecting or postponing.
 */

import {
  CategoryRecommendation,
  PlayerCategory,
  categoryEligibility,
  nextCategoryDown,
  nextCategoryUp,
} from "../domain/identity";
import { Pairing, Player } from "../domain/types";

/** Career signals the engine reasons over. */
export interface CategoryEvidence {
  playerId: string;
  playerName: string;
  category: PlayerCategory;
  dateOfBirth: string;
  /** Events played across the player's whole career. */
  eventsPlayed: number;
  /** Consecutive events missed since their last appearance. */
  eventsInactive: number;
  gamesPlayed: number;
  winRate: number;
  averageSpread: number;
  averageScore: number;
  rating: number;
  /** Average rating of opponents faced — a proxy for field strength. */
  opponentStrength: number;
  /** Share of recent events finishing in the top quarter of the field. */
  topQuarterFinishes: number;
  /** Standard deviation of per-event win rate; lower is more consistent. */
  consistency: number;
}

/** Thresholds the organizer could expose in settings later. */
export const CATEGORY_RULES = {
  promotion: {
    minEvents: 3,
    minWinRate: 65,
    minAverageSpread: 25,
    minTopQuarterFinishes: 2,
  },
  demotion: {
    minEvents: 4,
    maxWinRate: 30,
    maxAverageSpread: -40,
  },
  inactivity: {
    masters: 15,
    advanced: 20,
  },
} as const;

const pct = (n: number) => `${Math.round(n)}%`;
const signed = (n: number) => (n > 0 ? `+${Math.round(n)}` : String(Math.round(n)));

/**
 * Evaluates one player and returns a recommendation, or null when the record
 * supports keeping them where they are.
 */
export function evaluatePlayer(
  ev: CategoryEvidence,
  now = new Date(),
): Omit<CategoryRecommendation, "id" | "status" | "createdAt"> | null {
  /* ---- Inactivity ---------------------------------------------------- */
  // Checked first: a long absence outweighs older performance figures.
  const inactivityLimit =
    ev.category === "masters"
      ? CATEGORY_RULES.inactivity.masters
      : ev.category === "advanced"
        ? CATEGORY_RULES.inactivity.advanced
        : null;

  if (inactivityLimit !== null && ev.eventsInactive >= inactivityLimit) {
    const proposed = nextCategoryDown(ev.category);
    if (proposed) {
      return {
        playerId: ev.playerId,
        playerName: ev.playerName,
        current: ev.category,
        proposed,
        kind: "demotion",
        rationale: `This ${label(ev.category)} player has been inactive for ${ev.eventsInactive} consecutive events. Consider moving them to ${label(proposed)}.`,
        factors: [
          { label: "Consecutive events missed", value: String(ev.eventsInactive), supports: true },
          { label: "Inactivity threshold", value: String(inactivityLimit), supports: true },
          { label: "Career events played", value: String(ev.eventsPlayed), supports: false },
        ],
        confidence: Math.min(95, 60 + (ev.eventsInactive - inactivityLimit) * 3),
      };
    }
  }

  /* ---- Promotion ------------------------------------------------------ */
  const up = nextCategoryUp(ev.category);
  const promotionFactors = [
    {
      label: "Win rate",
      value: pct(ev.winRate),
      supports: ev.winRate >= CATEGORY_RULES.promotion.minWinRate,
    },
    {
      label: "Average spread",
      value: signed(ev.averageSpread),
      supports: ev.averageSpread >= CATEGORY_RULES.promotion.minAverageSpread,
    },
    {
      label: "Events played",
      value: String(ev.eventsPlayed),
      supports: ev.eventsPlayed >= CATEGORY_RULES.promotion.minEvents,
    },
    {
      label: "Top-quarter finishes",
      value: String(ev.topQuarterFinishes),
      supports: ev.topQuarterFinishes >= CATEGORY_RULES.promotion.minTopQuarterFinishes,
    },
    { label: "Opponent strength", value: String(Math.round(ev.opponentStrength)), supports: true },
    { label: "Rating", value: String(ev.rating || "Unrated"), supports: ev.rating > 0 },
  ];

  const promotionSupport = promotionFactors.filter((f) => f.supports).length;
  const promotionQualifies =
    up !== null &&
    ev.eventsPlayed >= CATEGORY_RULES.promotion.minEvents &&
    ev.winRate >= CATEGORY_RULES.promotion.minWinRate &&
    ev.averageSpread >= CATEGORY_RULES.promotion.minAverageSpread;

  if (promotionQualifies && up) {
    return {
      playerId: ev.playerId,
      playerName: ev.playerName,
      current: ev.category,
      proposed: up,
      kind: "promotion",
      rationale: `This player has maintained a ${pct(ev.winRate)} win rate with an average spread of ${signed(ev.averageSpread)} across ${ev.eventsPlayed} events. Promotion from ${label(ev.category)} to ${label(up)} is recommended.`,
      factors: promotionFactors,
      confidence: Math.min(96, 55 + promotionSupport * 7),
    };
  }

  /* ---- Demotion on performance ---------------------------------------- */
  const down = nextCategoryDown(ev.category);
  const demotionQualifies =
    down !== null &&
    ev.eventsPlayed >= CATEGORY_RULES.demotion.minEvents &&
    ev.winRate <= CATEGORY_RULES.demotion.maxWinRate &&
    ev.averageSpread <= CATEGORY_RULES.demotion.maxAverageSpread;

  if (demotionQualifies && down) {
    const demotionFactors = [
      { label: "Win rate", value: pct(ev.winRate), supports: true },
      { label: "Average spread", value: signed(ev.averageSpread), supports: true },
      { label: "Events played", value: String(ev.eventsPlayed), supports: true },
      { label: "Rating", value: String(ev.rating || "Unrated"), supports: false },
    ];

    // Novice exists for beginners. A player is never demoted into it on results
    // alone; the age rule must also be satisfied.
    if (down === "novice") {
      const eligibility = categoryEligibility("novice", ev.dateOfBirth, now);
      if (!eligibility.eligible) {
        return {
          playerId: ev.playerId,
          playerName: ev.playerName,
          current: ev.category,
          proposed: down,
          kind: "demotion",
          rationale: `Performance would suggest a move to ${label(down)}, but Novice is reserved for beginners and this player does not meet its eligibility rules. No change is recommended.`,
          factors: demotionFactors,
          confidence: 40,
          blockedBy: eligibility.reason,
        };
      }
    }

    return {
      playerId: ev.playerId,
      playerName: ev.playerName,
      current: ev.category,
      proposed: down,
      kind: "demotion",
      rationale: `This player has recorded a ${pct(ev.winRate)} win rate with an average spread of ${signed(ev.averageSpread)} across ${ev.eventsPlayed} events. Moving them to ${label(down)} would give them a more even field.`,
      factors: demotionFactors,
      confidence: Math.min(90, 55 + Math.abs(ev.averageSpread) / 6),
    };
  }

  return null;
}

function label(c: PlayerCategory): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/**
 * Builds career evidence for a player from their tournament record. Figures
 * outside the current event come from the player's stored history.
 */
export function buildEvidence(
  player: Player,
  pairings: Pairing[],
  allPlayers: Player[],
  category: PlayerCategory,
  dateOfBirth: string,
  eventsInactive = 0,
): CategoryEvidence {
  const games = pairings.filter(
    (p) =>
      p.playerBId !== null &&
      p.scoreA !== undefined &&
      p.status === "verified" &&
      (p.playerAId === player.id || p.playerBId === player.id),
  );

  let wins = 0;
  let spreadTotal = 0;
  let scoreTotal = 0;
  const opponentRatings: number[] = [];

  for (const g of games) {
    const isA = g.playerAId === player.id;
    const mine = isA ? g.scoreA! : g.scoreB!;
    const theirs = isA ? g.scoreB! : g.scoreA!;
    if (mine > theirs) wins += 1;
    spreadTotal += mine - theirs;
    scoreTotal += mine;

    const oppId = isA ? g.playerBId! : g.playerAId;
    const opp = allPlayers.find((p) => p.id === oppId);
    if (opp?.rating) opponentRatings.push(opp.rating);
  }

  const eventsPlayed = player.tournamentHistory.length + 1;
  // Placings recorded as an ordinal such as "4th"; top-quarter is a proxy.
  const topQuarterFinishes = player.tournamentHistory.filter((h) => {
    const place = parseInt(h.place, 10);
    return !Number.isNaN(place) && place <= 8;
  }).length;

  return {
    playerId: player.playerId,
    playerName: player.fullName,
    category,
    dateOfBirth,
    eventsPlayed,
    eventsInactive,
    gamesPlayed: games.length,
    winRate: games.length ? (wins / games.length) * 100 : 0,
    averageSpread: games.length ? spreadTotal / games.length : 0,
    averageScore: games.length ? scoreTotal / games.length : 0,
    rating: player.rating,
    opponentStrength: opponentRatings.length
      ? opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length
      : 0,
    topQuarterFinishes,
    consistency: games.length ? Math.abs(50 - (wins / games.length) * 100) : 0,
  };
}
