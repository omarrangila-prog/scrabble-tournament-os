/**
 * Seeds a permanent identity for every demo player, plus a realistic pipeline
 * of registrations awaiting organizer review and a category ledger showing
 * past promotions. Deterministic, so a demo reset restores the same picture.
 */

import {
  CategoryLedgerEntry,
  CategoryRecommendation,
  PlayerIdentity,
  Registration,
} from "./identity";

/**
 * The identity ledger's starting state: empty.
 *
 * This used to derive identities, registrations and a category ledger from the
 * fabricated tournament field — invented names with invented CNICs, birth
 * dates and playing histories. Those records reached the player directory and
 * the category-review queue as though they described real people.
 *
 * Player identities are created when someone registers. Until then there are
 * none, and the directory says so.
 */
export function buildIdentitySeed() {
  return {
    identities: [] as PlayerIdentity[],
    registrations: [] as Registration[],
    ledger: [] as CategoryLedgerEntry[],
    recommendations: [] as CategoryRecommendation[],
    // The first player registered becomes PK-001.
    idSequence: 0,
  };
}
