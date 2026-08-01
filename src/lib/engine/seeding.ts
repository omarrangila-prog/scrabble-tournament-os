/**
 * Seeding engine.
 *
 * Produces an ordered seed list for a division and explains, seed by seed, why
 * each player sits where they do. Two policies are supported:
 *
 *   rating — strict descending rating. Simple and defensible, but it can place
 *            clubmates or schoolmates adjacently, which tends to pair them
 *            against each other early in a Swiss draw.
 *
 *   hybrid — the same rating order, then a bounded local reshuffle that
 *            separates same-school neighbours. Movement is capped so the rating
 *            order stays visible: a player never moves more than
 *            HYBRID_MAX_SHIFT places from their rating seed.
 *
 * Nothing here decides anything on its own. The director reviews the list,
 * may override any position with a recorded reason, and must validate and
 * publish before the seeding is used to build round one.
 */

import { DivisionId, Player } from "../domain/types";

/** How far hybrid seeding may move a player from their strict rating position. */
export const HYBRID_MAX_SHIFT = 3;

export type SeedingMode = "rating" | "hybrid";

export type SeedWarningKind = "same-school" | "unrated" | "rating-gap" | "protected-moved";

export interface SeedWarning {
  kind: SeedWarningKind;
  severity: "warning" | "info";
  message: string;
  /** Seed numbers the warning concerns. */
  seeds: number[];
}

export interface SeedEntry {
  playerId: string;
  seed: number;
  /** Position this player held under strict rating order. */
  ratingSeed: number;
  /** Positive when hybrid moved the player up the list. */
  shift: number;
  /** Plain-language justification shown in "Why this seed?". */
  reason: string;
  /** Factors that produced the position, listed in the order applied. */
  factors: string[];
  /** Locked players keep their position through regeneration. */
  locked: boolean;
  /** Set when a director moved this player by hand. */
  override?: { by: string; reason: string; at: string };
}

export interface SeedResult {
  division: DivisionId;
  mode: SeedingMode;
  entries: SeedEntry[];
  warnings: SeedWarning[];
}

/* -------------------------------------------------------------------------- */

const byRating = (a: Player, b: Player) =>
  (b.rating || -1) - (a.rating || -1) || a.fullName.localeCompare(b.fullName);

/** Ordinal suffix for readable seed references: 1st, 2nd, 3rd, 4th. */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Detects adjacent players from the same school or club. These are the pairs a
 * director most wants to see, because a Swiss draw commonly pairs neighbouring
 * seeds in the opening round.
 */
export function sameSchoolWarnings(
  entries: SeedEntry[],
  players: Map<string, Player>,
): SeedWarning[] {
  const out: SeedWarning[] = [];
  for (let i = 0; i < entries.length - 1; i++) {
    const a = players.get(entries[i].playerId);
    const b = players.get(entries[i + 1].playerId);
    if (!a || !b || !a.club || a.club !== b.club) continue;
    out.push({
      kind: "same-school",
      severity: "warning",
      message: `${a.fullName} and ${b.fullName} both represent ${a.club} and sit at seeds ${entries[i].seed} and ${entries[i + 1].seed}. Adjacent seeds from one organization are often drawn against each other in round one.`,
      seeds: [entries[i].seed, entries[i + 1].seed],
    });
  }
  return out;
}

function otherWarnings(
  entries: SeedEntry[],
  players: Map<string, Player>,
): SeedWarning[] {
  const out: SeedWarning[] = [];

  const unrated = entries.filter((e) => !(players.get(e.playerId)?.rating ?? 0));
  if (unrated.length > 0) {
    out.push({
      kind: "unrated",
      severity: "info",
      message: `${unrated.length} unrated player${unrated.length === 1 ? " is" : "s are"} seeded at the foot of the division until a rating is established.`,
      seeds: unrated.map((e) => e.seed),
    });
  }

  // A large gap between neighbours means the draw may be lopsided at that point.
  for (let i = 0; i < entries.length - 1; i++) {
    const a = players.get(entries[i].playerId);
    const b = players.get(entries[i + 1].playerId);
    if (!a?.rating || !b?.rating) continue;
    const gap = a.rating - b.rating;
    if (gap > 220) {
      out.push({
        kind: "rating-gap",
        severity: "info",
        message: `A ${gap}-point rating gap separates seeds ${entries[i].seed} and ${entries[i + 1].seed}.`,
        seeds: [entries[i].seed, entries[i + 1].seed],
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */

/**
 * Builds the seed list for one division.
 *
 * @param locked  Player ids whose seed must be preserved exactly.
 * @param overrides Manual placements, keyed by player id → target seed.
 */
export function generateSeeding(
  pool: Player[],
  division: DivisionId,
  mode: SeedingMode,
  options: {
    locked?: Set<string>;
    overrides?: Map<string, { seed: number; by: string; reason: string; at: string }>;
  } = {},
): SeedResult {
  const locked = options.locked ?? new Set<string>();
  const overrides = options.overrides ?? new Map();

  const players = new Map(pool.map((p) => [p.id, p]));

  // 1. Strict rating order — the baseline every mode starts from.
  const rated = [...pool].sort(byRating);
  const ratingSeedOf = new Map(rated.map((p, i) => [p.id, i + 1]));

  const ordered = [...rated];

  // 2. Hybrid: separate same-school neighbours within a bounded window.
  const separations: { a: string; b: string }[] = [];
  /** Players displaced by a separation swap, so they can be explained too. */
  const displaced = new Set<string>();
  if (mode === "hybrid") {
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (!a.club || a.club !== b.club) continue;
      if (locked.has(b.id) || overrides.has(b.id)) continue;

      // Find the nearest later player from a different club, within the cap.
      let swapWith = -1;
      for (let j = i + 2; j < ordered.length; j++) {
        const c = ordered[j];
        if (locked.has(c.id) || overrides.has(c.id)) continue;
        const shift = Math.abs(j - (i + 1));
        if (shift > HYBRID_MAX_SHIFT) break;
        const prev = ordered[i];
        const next = ordered[j + 1];
        // The swap must not create a new adjacency at either end.
        if (c.club === prev.club) continue;
        if (next && next.club === b.club) continue;
        swapWith = j;
        break;
      }

      if (swapWith > -1) {
        const moved = ordered[swapWith];
        ordered[swapWith] = b;
        ordered[i + 1] = moved;
        separations.push({ a: a.id, b: b.id });
        displaced.add(moved.id);
      }
    }
  }

  // 3. Apply director overrides last, so a manual decision always wins.
  for (const [playerId, ov] of overrides) {
    const from = ordered.findIndex((p) => p.id === playerId);
    if (from === -1) continue;
    const [moved] = ordered.splice(from, 1);
    const to = Math.max(0, Math.min(ordered.length, ov.seed - 1));
    ordered.splice(to, 0, moved);
  }

  // 4. Build entries with explanations.
  const entries: SeedEntry[] = ordered.map((p, i) => {
    const seed = i + 1;
    const ratingSeed = ratingSeedOf.get(p.id) ?? seed;
    const shift = ratingSeed - seed;
    const override = overrides.get(p.id);
    const separated = separations.some((s) => s.b === p.id);

    const factors: string[] = [];
    if (p.rating) {
      factors.push(`Rating ${p.rating} places this player ${ordinal(ratingSeed)} on rating alone.`);
    } else {
      factors.push("Unrated players are seeded below every rated player.");
    }
    if (mode === "hybrid" && separated) {
      factors.push(
        `Hybrid seeding moved this player ${Math.abs(shift)} place${Math.abs(shift) === 1 ? "" : "s"} to avoid an adjacent seed from ${p.club}.`,
      );
    } else if (mode === "hybrid" && shift !== 0) {
      // Displaced by someone else's separation swap.
      factors.push(
        `Hybrid seeding moved this player ${Math.abs(shift)} place${Math.abs(shift) === 1 ? "" : "s"} ${shift > 0 ? "up" : "down"} to make room for a same-organization separation nearby.`,
      );
    }
    if (override) {
      factors.push(`Placed at seed ${seed} by ${override.by}. Reason: ${override.reason}`);
    }
    if (locked.has(p.id)) factors.push("This seed is locked and survives regeneration.");

    const reason = override
      ? `Seed ${seed} was set manually by ${override.by}.`
      : shift === 0
        ? `Seed ${seed} follows directly from a rating of ${p.rating || "none"}.`
        : `Seed ${seed} — moved ${Math.abs(shift)} place${Math.abs(shift) === 1 ? "" : "s"} ${shift > 0 ? "up" : "down"} from the rating order to separate same-organization neighbours.`;

    return {
      playerId: p.id,
      seed,
      ratingSeed,
      shift,
      reason,
      factors,
      locked: locked.has(p.id),
      override,
    };
  });

  const warnings = [...sameSchoolWarnings(entries, players), ...otherWarnings(entries, players)];

  return { division, mode, entries, warnings };
}

/* -------------------------------------------------------------------------- */

export interface SeedValidation {
  playerCount: number;
  duplicateSeeds: number;
  missingSeeds: number;
  sameSchoolAdjacent: number;
  unratedPlaced: number;
  overrides: number;
  maxShift: number;
  valid: boolean;
  messages: string[];
}

/** Pre-publication check for a seed list. */
export function validateSeeding(result: SeedResult, players: Map<string, Player>): SeedValidation {
  const seeds = result.entries.map((e) => e.seed);
  const unique = new Set(seeds);
  const duplicateSeeds = seeds.length - unique.size;
  const expected = Array.from({ length: result.entries.length }, (_, i) => i + 1);
  const missingSeeds = expected.filter((n) => !unique.has(n)).length;
  const sameSchoolAdjacent = result.warnings.filter((w) => w.kind === "same-school").length;
  const unratedPlaced = result.entries.filter((e) => !(players.get(e.playerId)?.rating ?? 0)).length;
  const overrides = result.entries.filter((e) => !!e.override).length;
  const maxShift = result.entries.reduce((m, e) => Math.max(m, Math.abs(e.shift)), 0);

  const valid = duplicateSeeds === 0 && missingSeeds === 0;

  const messages: string[] = [];
  if (duplicateSeeds > 0) messages.push(`${duplicateSeeds} duplicate seed position(s).`);
  if (missingSeeds > 0) messages.push(`${missingSeeds} seed position(s) missing from the sequence.`);
  if (sameSchoolAdjacent > 0)
    messages.push(
      `${sameSchoolAdjacent} same-organization pair(s) remain adjacent. This is permitted but will be flagged again at pairing.`,
    );
  if (maxShift > HYBRID_MAX_SHIFT)
    messages.push(
      `A player moved ${maxShift} places from their rating seed, beyond the ${HYBRID_MAX_SHIFT}-place hybrid cap. This can only result from a director override.`,
    );
  if (valid && messages.length === 0)
    messages.push("All seeding checks passed. This division is ready to publish.");

  return {
    playerCount: result.entries.length,
    duplicateSeeds,
    missingSeeds,
    sameSchoolAdjacent,
    unratedPlaced,
    overrides,
    maxShift,
    valid,
    messages,
  };
}

/**
 * Builds the opening round from a published seed list using the standard
 * top-half versus bottom-half fold: seed 1 meets seed n/2+1, and so on. This is
 * what makes the seeding decision visible in the Pairing Lab.
 */
export function firstRoundFromSeeds(
  result: SeedResult,
): { board: number; topSeed: number; bottomSeed: number; topId: string; bottomId: string }[] {
  const entries = [...result.entries].sort((a, b) => a.seed - b.seed);
  const half = Math.floor(entries.length / 2);
  const out: {
    board: number;
    topSeed: number;
    bottomSeed: number;
    topId: string;
    bottomId: string;
  }[] = [];

  for (let i = 0; i < half; i++) {
    const top = entries[i];
    const bottom = entries[i + half];
    if (!top || !bottom) continue;
    out.push({
      board: i + 1,
      topSeed: top.seed,
      bottomSeed: bottom.seed,
      topId: top.playerId,
      bottomId: bottom.playerId,
    });
  }
  return out;
}
