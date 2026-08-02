/**
 * Returning-participant rewards.
 *
 * A player who has entered before is worth keeping, and the platform already
 * knows they have. This module decides what that entitles them to and, just as
 * importantly, explains why — a discount a participant cannot account for reads
 * as a pricing error rather than a thank-you.
 *
 * Two rules shape everything here:
 *
 * 1. **Entitlement is derived, never stored.** It is computed from completed
 *    entries at the moment of registration, so it cannot go stale or be
 *    granted twice from a cached flag.
 * 2. **The participant always sees the arithmetic.** Base fee, each reduction
 *    with its reason, and the final amount — never a single adjusted number.
 */

/** How an organizer chooses to thank returning players. */
export type LoyaltyKind =
  | "none"
  | "percentage"
  | "fixed"
  | "free-entry"
  | "free-games"
  | "membership";

export const LOYALTY_KIND_LABEL: Record<LoyaltyKind, string> = {
  none: "No returning-player reward",
  percentage: "Percentage off",
  fixed: "Fixed amount off",
  "free-entry": "Free entry",
  "free-games": "Free games",
  membership: "Membership discount",
};

export interface LoyaltyPolicy {
  kind: LoyaltyKind;
  /** Percent for `percentage`, currency units for `fixed`, games for `free-games`. */
  value: number;
  /** Completed events required before the reward applies. */
  minEvents: number;
  /**
   * Caps how much loyalty alone can take off, as a percentage of the base fee.
   * Zero means uncapped. Guards against a policy that quietly makes entry free.
   */
  maxPercentOfFee: number;
  /** When true, the organizer confirms the reward rather than it applying automatically. */
  requiresApproval: boolean;
  active: boolean;
}

export const DEFAULT_LOYALTY: LoyaltyPolicy = {
  kind: "fixed",
  value: 300,
  minEvents: 1,
  maxPercentOfFee: 50,
  requiresApproval: false,
  active: true,
};

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

/** What the platform knows about a person's past entries. */
export interface ParticipantHistory {
  /** Events entered and not withdrawn from. */
  eventsCompleted: number;
  /** Whether they hold a current membership. */
  isMember: boolean;
  /** Free games carried over from a previous reward. */
  freeGameBalance: number;
  /** Most recent event name, for the explanation. */
  lastEventName?: string;
}

export const NO_HISTORY: ParticipantHistory = {
  eventsCompleted: 0,
  isMember: false,
  freeGameBalance: 0,
};

/**
 * Builds history from prior entries.
 *
 * Only entries that were approved count. A submitted-but-rejected registration
 * is not participation, and treating it as such would reward someone for an
 * entry the organizer turned down.
 */
export function buildHistory(
  priorEntries: { status: string; eventName: string; submittedAt: string }[],
  options: { isMember?: boolean; freeGameBalance?: number } = {},
): ParticipantHistory {
  const completed = priorEntries.filter((e) => e.status === "approved");
  const latest = [...completed].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];

  return {
    eventsCompleted: completed.length,
    isMember: options.isMember ?? false,
    freeGameBalance: Math.max(0, options.freeGameBalance ?? 0),
    lastEventName: latest?.eventName,
  };
}

/* -------------------------------------------------------------------------- */
/* Entitlement                                                                 */
/* -------------------------------------------------------------------------- */

export interface LoyaltyReward {
  /** Currency units off the entry fee. Zero for non-monetary rewards. */
  amountOff: number;
  /** Games granted, for a free-games reward. */
  freeGames: number;
  /** Shown to the participant, naming why they qualified. */
  explanation: string;
  /** True when the organizer must confirm before it takes effect. */
  needsApproval: boolean;
}

export const NO_REWARD: LoyaltyReward = {
  amountOff: 0,
  freeGames: 0,
  explanation: "",
  needsApproval: false,
};

/**
 * What a returning participant is entitled to.
 *
 * Returns nothing rather than a zero-valued reward when none applies, so the
 * form has no "0 off" line to render.
 */
export function loyaltyReward(
  policy: LoyaltyPolicy,
  history: ParticipantHistory,
  baseFee: number,
): LoyaltyReward {
  if (!policy.active || policy.kind === "none") return NO_REWARD;
  if (history.eventsCompleted < policy.minEvents) return NO_REWARD;

  const fee = Math.max(0, baseFee);
  const events = history.eventsCompleted;
  const eventWord = events === 1 ? "event" : "events";

  let amountOff = 0;
  let freeGames = 0;
  let reason = "";

  switch (policy.kind) {
    case "percentage": {
      const pct = Math.min(100, Math.max(0, policy.value));
      amountOff = Math.round((fee * pct) / 100);
      reason = `${pct}% off for returning after ${events} ${eventWord}`;
      break;
    }

    case "fixed":
      amountOff = Math.max(0, policy.value);
      reason = `Returning participant discount after ${events} ${eventWord}`;
      break;

    case "free-entry":
      amountOff = fee;
      reason = `Free entry for returning after ${events} ${eventWord}`;
      break;

    case "free-games":
      freeGames = Math.max(0, Math.round(policy.value));
      reason = `${freeGames} free game${freeGames === 1 ? "" : "s"} for returning after ${events} ${eventWord}`;
      break;

    case "membership":
      if (!history.isMember) return NO_REWARD;
      amountOff = Math.max(0, policy.value);
      reason = "Member discount";
      break;
  }

  // A cap protects the organizer from a policy that makes entry free by
  // accident. Free entry is explicit, so it is exempt.
  if (policy.maxPercentOfFee > 0 && policy.kind !== "free-entry") {
    const ceiling = Math.round((fee * Math.min(100, policy.maxPercentOfFee)) / 100);
    if (amountOff > ceiling) amountOff = ceiling;
  }

  amountOff = Math.min(amountOff, fee);

  if (amountOff === 0 && freeGames === 0) return NO_REWARD;

  return {
    amountOff,
    freeGames,
    explanation: reason,
    needsApproval: policy.requiresApproval,
  };
}

/* -------------------------------------------------------------------------- */
/* Combined pricing                                                            */
/* -------------------------------------------------------------------------- */

export interface PricingLine {
  label: string;
  /** Negative for a reduction. */
  amount: number;
  kind: "fee" | "loyalty" | "campaign";
}

export interface PricingBreakdown {
  baseFee: number;
  lines: PricingLine[];
  totalOff: number;
  payable: number;
  freeGames: number;
  currency: string;
  /** True when something applied but awaits organizer confirmation. */
  pendingApproval: boolean;
}

export interface CampaignReduction {
  code: string;
  name: string;
  percentOff: number;
  amountOff: number;
}

/**
 * Combines the entry fee, a loyalty reward and a campaign code into one
 * itemised breakdown.
 *
 * Both reductions are computed against the *base* fee rather than compounding.
 * Compounding would make a 50% loyalty reward plus a 50% code cost the
 * organizer 75% instead of the 100% they intended to offer, and no participant
 * would be able to check the arithmetic.
 *
 * The total is clamped at the fee: promotions can make entry free but never
 * owe the participant money.
 */
export function priceRegistration(
  baseFee: number,
  currency: string,
  loyalty: LoyaltyReward = NO_REWARD,
  campaign?: CampaignReduction,
): PricingBreakdown {
  const fee = Math.max(0, baseFee);
  const lines: PricingLine[] = [{ label: "Entry fee", amount: fee, kind: "fee" }];

  let totalOff = 0;

  if (loyalty.amountOff > 0) {
    lines.push({ label: loyalty.explanation, amount: -loyalty.amountOff, kind: "loyalty" });
    totalOff += loyalty.amountOff;
  }

  if (campaign) {
    const pct = Math.min(100, Math.max(0, campaign.percentOff));
    const fromPercent = Math.round((fee * pct) / 100);
    const campaignOff = fromPercent + Math.max(0, campaign.amountOff);
    if (campaignOff > 0) {
      lines.push({
        label: `${campaign.name} (${campaign.code})`,
        amount: -campaignOff,
        kind: "campaign",
      });
      totalOff += campaignOff;
    }
  }

  totalOff = Math.min(totalOff, fee);

  return {
    baseFee: fee,
    lines,
    totalOff,
    payable: fee - totalOff,
    freeGames: loyalty.freeGames,
    currency,
    pendingApproval: loyalty.needsApproval && loyalty.amountOff > 0,
  };
}

/** One-line summary for a confirmation screen or email. */
export function summarise(breakdown: PricingBreakdown): string {
  if (breakdown.totalOff === 0)
    return `${breakdown.currency} ${breakdown.payable.toLocaleString("en-PK")} due.`;

  return `${breakdown.currency} ${breakdown.totalOff.toLocaleString("en-PK")} off — ${breakdown.currency} ${breakdown.payable.toLocaleString("en-PK")} due.`;
}
