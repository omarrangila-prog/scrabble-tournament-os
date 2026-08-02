/**
 * Promotions: campaigns that bring players in, and rewards that recognise them.
 *
 * Two things are kept strictly apart here, because conflating them would
 * corrupt the tournament record:
 *
 * - A **campaign** affects what a player *pays* to enter. It is commercial.
 * - A **reward** recognises something a player *did*. It is honorary.
 *
 * Neither ever touches game results, standings, or tie-breaks. A promotion
 * cannot move a player up the table; the official record stays derived from
 * verified scores alone.
 */

export type CampaignKind =
  | "early-bird"
  | "group"
  | "referral"
  | "returning"
  | "school"
  | "first-timer";

export const CAMPAIGN_KIND_LABEL: Record<CampaignKind, string> = {
  "early-bird": "Early bird",
  group: "Group entry",
  referral: "Referral",
  returning: "Returning player",
  school: "School partnership",
  "first-timer": "First timer",
};

export type CampaignStatus = "draft" | "active" | "paused" | "ended";

export interface Campaign {
  id: string;
  eventId: string;
  name: string;
  kind: CampaignKind;
  status: CampaignStatus;

  /** Percentage off the entry fee, 0–100. */
  percentOff: number;
  /** Fixed amount off, applied after the percentage. */
  amountOff: number;

  /** Code a player types at registration. Case-insensitive. */
  code: string;
  /** Total redemptions allowed; 0 means unlimited. */
  cap: number;
  redemptions: number;

  /** ISO dates. A campaign outside its window cannot be redeemed. */
  startsAt: string;
  endsAt: string;

  /** For group campaigns: minimum entries required together. */
  minGroupSize?: number;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

export interface RedemptionContext {
  /** When the registration is being made. */
  at: string;
  /** Entries being registered together, for group campaigns. */
  groupSize?: number;
}

export interface Eligibility {
  eligible: boolean;
  /** Always populated — a refusal a participant cannot understand is a bug. */
  reason: string;
}

/**
 * Whether a campaign may be redeemed right now.
 *
 * Every failure path names the specific obstacle, because this string is shown
 * to the person typing the code.
 */
export function checkEligibility(campaign: Campaign, ctx: RedemptionContext): Eligibility {
  if (campaign.status !== "active")
    return { eligible: false, reason: `This code is ${campaign.status} and cannot be used.` };

  const now = new Date(ctx.at).getTime();
  const starts = new Date(campaign.startsAt).getTime();
  const ends = new Date(campaign.endsAt).getTime();

  if (Number.isNaN(now) || Number.isNaN(starts) || Number.isNaN(ends))
    return { eligible: false, reason: "This code has an invalid date range." };

  if (now < starts) return { eligible: false, reason: "This code is not active yet." };
  if (now > ends) return { eligible: false, reason: "This code has expired." };

  if (campaign.cap > 0 && campaign.redemptions >= campaign.cap)
    return { eligible: false, reason: "This code has reached its limit." };

  if (campaign.minGroupSize && (ctx.groupSize ?? 1) < campaign.minGroupSize)
    return {
      eligible: false,
      reason: `This code needs at least ${campaign.minGroupSize} entries registered together.`,
    };

  return { eligible: true, reason: "Code applied." };
}

/** Finds an active campaign by code, ignoring case and surrounding space. */
export function findByCode(campaigns: Campaign[], code: string): Campaign | undefined {
  const needle = code.trim().toLowerCase();
  if (!needle) return undefined;
  return campaigns.find((c) => c.code.trim().toLowerCase() === needle);
}

/* -------------------------------------------------------------------------- */
/* Fee application                                                             */
/* -------------------------------------------------------------------------- */

export interface CampaignFee {
  baseFee: number;
  discount: number;
  payable: number;
  /** The arithmetic, in words, so a participant can check it. */
  explanation: string;
}

/**
 * Applies a campaign to a fee.
 *
 * The percentage is taken first, then the fixed amount, and the result is
 * clamped at zero — a promotion can make entry free but never owes the player
 * money.
 */
export function applyCampaign(baseFee: number, campaign: Campaign | undefined): CampaignFee {
  const base = Math.max(0, baseFee);
  if (!campaign)
    return { baseFee: base, discount: 0, payable: base, explanation: "No promotion applied." };

  const pct = Math.min(100, Math.max(0, campaign.percentOff));
  const pctCut = Math.round((base * pct) / 100);
  const fixedCut = Math.max(0, campaign.amountOff);

  const discount = Math.min(base, pctCut + fixedCut);
  const parts: string[] = [];
  if (pct > 0) parts.push(`${pct}% off`);
  if (fixedCut > 0) parts.push(`${fixedCut} off`);

  return {
    baseFee: base,
    discount,
    payable: base - discount,
    explanation: parts.length
      ? `${campaign.name}: ${parts.join(" and ")}.`
      : `${campaign.name}: no reduction.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Campaign performance                                                        */
/* -------------------------------------------------------------------------- */

export interface CampaignPerformance {
  campaignId: string;
  name: string;
  redemptions: number;
  /** Fee income given up through this campaign. */
  revenueForgone: number;
  /** Fee income still collected from entries that used it. */
  revenueKept: number;
  /** Percentage of the cap consumed; 0 when uncapped. */
  capUsed: number;
  /** Average reduction per redemption. */
  averageDiscount: number;
}

export function campaignPerformance(
  campaign: Campaign,
  redemptions: { discountAmount: number; amountPaid: number }[],
): CampaignPerformance {
  const forgone = redemptions.reduce((s, r) => s + Math.max(0, r.discountAmount), 0);
  const kept = redemptions.reduce((s, r) => s + Math.max(0, r.amountPaid), 0);
  return {
    campaignId: campaign.id,
    name: campaign.name,
    redemptions: redemptions.length,
    revenueForgone: forgone,
    revenueKept: kept,
    capUsed: campaign.cap > 0 ? Math.round((redemptions.length / campaign.cap) * 100) : 0,
    averageDiscount: redemptions.length ? Math.round(forgone / redemptions.length) : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Rewards                                                                     */
/* -------------------------------------------------------------------------- */

export type RewardKind =
  | "highest-word"
  | "biggest-upset"
  | "best-newcomer"
  | "sporting-conduct"
  | "most-improved"
  | "perfect-attendance"
  | "custom";

export const REWARD_KIND_LABEL: Record<RewardKind, string> = {
  "highest-word": "Highest word",
  "biggest-upset": "Biggest upset",
  "best-newcomer": "Best newcomer",
  "sporting-conduct": "Sporting conduct",
  "most-improved": "Most improved",
  "perfect-attendance": "Perfect attendance",
  custom: "Special award",
};

/**
 * Whether a reward can be decided from the record, or needs a human.
 *
 * `measured` awards are computed from verified game data and can be suggested.
 * `judged` awards depend on conduct or spirit, which no data can establish —
 * the director names the winner, and the system only records the decision.
 */
export const REWARD_BASIS: Record<RewardKind, "measured" | "judged"> = {
  "highest-word": "measured",
  "biggest-upset": "measured",
  "best-newcomer": "measured",
  "sporting-conduct": "judged",
  "most-improved": "measured",
  "perfect-attendance": "measured",
  custom: "judged",
};

export interface Reward {
  id: string;
  eventId: string;
  kind: RewardKind;
  title: string;
  /** Registration or player id of the recipient. */
  recipientId?: string;
  recipientName?: string;
  /** The evidence, e.g. "QUIXOTRY, 365 points, round 4, board 2". */
  citation: string;
  /** Prize value, if any. Zero for purely honorary awards. */
  prizeValue: number;
  /** Who decided. A judged award without an author is not defensible. */
  awardedBy?: string;
  awardedAt?: string;
}

/** A reward is ready to publish once it has a recipient and a citation. */
export function isAwarded(reward: Reward): boolean {
  return !!reward.recipientId && reward.citation.trim().length > 0 && !!reward.awardedBy;
}

export interface RewardSummary {
  total: number;
  awarded: number;
  pending: number;
  prizeValue: number;
  /** Judged awards still waiting on a director's decision. */
  needingDecision: number;
}

export function rewardSummary(rewards: Reward[]): RewardSummary {
  const awarded = rewards.filter(isAwarded);
  return {
    total: rewards.length,
    awarded: awarded.length,
    pending: rewards.length - awarded.length,
    prizeValue: awarded.reduce((s, r) => s + Math.max(0, r.prizeValue), 0),
    needingDecision: rewards.filter((r) => !isAwarded(r) && REWARD_BASIS[r.kind] === "judged")
      .length,
  };
}

/* -------------------------------------------------------------------------- */
/* Suggestions from the record                                                 */
/* -------------------------------------------------------------------------- */

export interface GameRecord {
  playerId: string;
  playerName: string;
  round: number;
  board: number;
  score: number;
  opponentScore: number;
  /** Rating at the time of the game, if known. */
  rating?: number;
  opponentRating?: number;
  /** Highest single word played, if recorded by the scorekeeper. */
  bestWord?: { word: string; points: number };
}

export interface RewardSuggestion {
  kind: RewardKind;
  recipientId: string;
  recipientName: string;
  citation: string;
  /** Always shown next to the suggestion — the director confirms or overrides. */
  basis: string;
}

/**
 * Suggests measured awards from verified games.
 *
 * These are proposals only. Nothing here writes a reward: the director accepts
 * a suggestion explicitly, and may name someone else instead.
 */
export function suggestRewards(games: GameRecord[]): RewardSuggestion[] {
  const out: RewardSuggestion[] = [];

  // Highest word — needs a recorded word, not just a high game score.
  const withWords = games.filter((g) => g.bestWord && g.bestWord.points > 0);
  if (withWords.length) {
    const best = withWords.reduce((a, b) =>
      b.bestWord!.points > a.bestWord!.points ? b : a,
    );
    out.push({
      kind: "highest-word",
      recipientId: best.playerId,
      recipientName: best.playerName,
      citation: `${best.bestWord!.word.toUpperCase()}, ${best.bestWord!.points} points, round ${best.round}, board ${best.board}`,
      basis: "Highest single word recorded across all verified games.",
    });
  }

  // Biggest upset — a win over a materially higher-rated opponent.
  const upsets = games.filter(
    (g) =>
      g.score > g.opponentScore &&
      typeof g.rating === "number" &&
      typeof g.opponentRating === "number" &&
      g.opponentRating > g.rating,
  );
  if (upsets.length) {
    const best = upsets.reduce((a, b) =>
      b.opponentRating! - b.rating! > a.opponentRating! - a.rating! ? b : a,
    );
    const gap = best.opponentRating! - best.rating!;
    out.push({
      kind: "biggest-upset",
      recipientId: best.playerId,
      recipientName: best.playerName,
      citation: `Beat an opponent rated ${gap} points higher, ${best.score}–${best.opponentScore}, round ${best.round}`,
      basis: "Largest rating gap overcome in a verified win.",
    });
  }

  return out;
}
