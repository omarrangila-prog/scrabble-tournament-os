/**
 * Pairing formats, described so a director can choose without prior knowledge.
 *
 * Five systems in a flat dropdown asks the organizer to already know what each
 * one does. Most Pakistani Scrabble events want Swiss and nothing else, so the
 * common choices lead, each says in one line what it is for, and the rarer
 * formats sit behind "More formats" rather than competing for attention.
 *
 * The recommendation is derived from the entry count and round count, because
 * those are what actually make a format suitable — round robin is excellent at
 * eight players and impossible at a hundred.
 */

import { PairingSystem } from "./types";

export interface FormatInfo {
  id: PairingSystem;
  label: string;
  /** One line, in the organizer's terms, on what this format is for. */
  summary: string;
  /** Shown when the format is selected — the trade-off worth knowing. */
  detail: string;
  /** Common formats lead; the rest sit behind "More formats". */
  common: boolean;
}

export const PAIRING_FORMATS: FormatInfo[] = [
  {
    id: "swiss",
    label: "Swiss System",
    summary: "Everyone plays every round, paired against players on similar scores.",
    detail:
      "Nobody is knocked out, and the field sorts itself as rounds go on. This is what most tournaments use.",
    common: true,
  },
  {
    id: "round-robin",
    label: "Round Robin",
    summary: "Everyone plays everyone. Best for small groups.",
    detail:
      "The fairest possible result, but it needs one round fewer than the number of players, so it only fits a small field.",
    common: true,
  },
  {
    id: "king-of-the-hill",
    label: "King of the Hill",
    summary: "First against second, third against fourth, and so on.",
    detail:
      "Puts the leaders together every round. Useful for a final round or a short decider, harsh as a whole-event format.",
    common: true,
  },
  {
    id: "manual",
    label: "Manual pairing",
    summary: "You decide every board yourself.",
    detail:
      "Nothing is paired automatically. Use it for an exhibition, a play-off, or when the situation needs a director's judgement.",
    common: true,
  },
  {
    id: "knockout",
    label: "Knockout",
    summary: "Losers are eliminated each round.",
    detail:
      "Half the field stops playing after round one, so most entrants get a single game. Rarely what a one-day open event wants.",
    common: false,
  },
];

export function formatInfo(system: PairingSystem): FormatInfo {
  return PAIRING_FORMATS.find((f) => f.id === system) ?? PAIRING_FORMATS[0];
}

export const COMMON_FORMATS = PAIRING_FORMATS.filter((f) => f.common);
export const OTHER_FORMATS = PAIRING_FORMATS.filter((f) => !f.common);

/* -------------------------------------------------------------------------- */
/* Recommendation                                                              */
/* -------------------------------------------------------------------------- */

export interface FormatRecommendation {
  system: PairingSystem;
  /** Why this format suits this event, naming the numbers behind it. */
  reason: string;
}

/**
 * Rounds needed for a full round robin.
 *
 * With an odd number of players one sits out each round, so it takes as many
 * rounds as there are players rather than one fewer.
 */
export function roundsForRoundRobin(players: number): number {
  if (players < 2) return 0;
  return players % 2 === 0 ? players - 1 : players;
}

/** The largest field a round robin can finish in the rounds available. */
const ROUND_ROBIN_MAX_PLAYERS = 12;

/**
 * Suggests a format for an event of this size and length.
 *
 * Always returns something — a director who has entered nothing yet still gets
 * the sensible default rather than an empty recommendation.
 */
export function recommendFormat(players: number, rounds: number): FormatRecommendation {
  if (players >= 2 && players <= ROUND_ROBIN_MAX_PLAYERS) {
    const needed = roundsForRoundRobin(players);
    if (rounds >= needed)
      return {
        system: "round-robin",
        reason: `With ${players} players and ${rounds} rounds, everyone can play everyone — the fairest result available.`,
      };

    return {
      system: "swiss",
      reason: `A round robin for ${players} players would need ${needed} rounds and you have ${rounds}. Swiss fits the rounds you have.`,
    };
  }

  return {
    system: "swiss",
    reason: `Best for a ${rounds}-round tournament with ${players || "many"} participants. Nobody is knocked out and the field sorts itself.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Suitability warnings                                                        */
/* -------------------------------------------------------------------------- */

export interface FormatWarning {
  severity: "warning" | "note";
  message: string;
}

/**
 * Problems with the chosen format, given the field and round count.
 *
 * Warnings rather than blocks: a director may have a reason for an unusual
 * choice, and this is their tournament. The point is that they see the
 * consequence before the event day rather than during it.
 */
export function formatWarnings(
  system: PairingSystem,
  players: number,
  rounds: number,
): FormatWarning[] {
  const warnings: FormatWarning[] = [];

  if (system === "round-robin") {
    const needed = roundsForRoundRobin(players);
    if (players > ROUND_ROBIN_MAX_PLAYERS)
      warnings.push({
        severity: "warning",
        message: `A round robin for ${players} players needs ${needed} rounds. Consider Swiss instead.`,
      });
    else if (rounds < needed)
      warnings.push({
        severity: "warning",
        message: `${rounds} rounds is not enough for everyone to play everyone — that needs ${needed}. Some pairings will not happen.`,
      });
    else if (rounds > needed)
      warnings.push({
        severity: "note",
        message: `${needed} rounds completes the round robin. The remaining ${rounds - needed} would repeat pairings.`,
      });
  }

  if (system === "knockout") {
    const survivors = players > 0 ? Math.ceil(players / 2 ** rounds) : 0;
    warnings.push({
      severity: "warning",
      message:
        players > 0
          ? `Half the field is eliminated each round: after ${rounds} rounds about ${survivors} would remain, and most entrants would play once.`
          : "Most entrants play a single game before being eliminated.",
    });
  }

  if (system === "king-of-the-hill" && rounds > 2)
    warnings.push({
      severity: "note",
      message:
        "King of the Hill pairs the leaders together every round, which suits a decider more than a full tournament.",
    });

  if (system === "manual")
    warnings.push({
      severity: "note",
      message: "Every board must be set by hand each round. Allow time between rounds.",
    });

  if (system === "swiss" && players > 0 && rounds > 0) {
    // Swiss cannot separate a field it has not had enough rounds to sort.
    const minimum = Math.ceil(Math.log2(Math.max(2, players)));
    if (rounds < minimum)
      warnings.push({
        severity: "note",
        message: `${rounds} rounds may not fully separate ${players} players; ${minimum} would give a clearer finish.`,
      });
  }

  return warnings;
}
