/**
 * Registration pricing.
 *
 * An event offers several rates and a participant may qualify for more than
 * one. The rule that matters: **they pay the lowest rate they qualify for, and
 * they are told which one it is.** Applying tiers cumulatively would let three
 * PSA members registering together pay almost nothing, and picking silently
 * leaves someone unable to check the number they were charged.
 *
 * Rates are configured per event rather than hardcoded, because they change
 * between events — the poster event and the August one already differ.
 */

import type { ActivityOption, ActivityRate } from "./registrationParticipants";

export type RateId = "standard" | "member" | "family" | "early-bird";

export interface Rate {
  id: RateId;
  label: string;
  /** Per person, in whole currency units. */
  amount: number;
  /** Shown when the rate applies, so the participant can check it. */
  basis: string;
  /** Family rates need a minimum group size. */
  minGroupSize?: number;
  /** Early-bird rates expire. ISO date. */
  availableUntil?: string;
}

export interface RateContext {
  /** Whether the participant claims membership of the association. */
  isMember: boolean;
  /** People registering together, including this one. */
  groupSize: number;
  /** When the registration is being made. ISO date. */
  at: string;
}

export interface PriceResult {
  /** The rate charged: the cheapest the participant qualifies for. */
  applied: Rate;
  /** Everything they qualified for, cheapest first. */
  qualified: Rate[];
  /** Rates they did not qualify for, with the reason. */
  unavailable: { rate: Rate; reason: string }[];
  /** Per person. */
  perPerson: number;
  /** Everyone in the group. */
  total: number;
  /** Saving against the standard rate, per person. */
  savedPerPerson: number;
}

/** Whether a rate is available, and why not when it is not. */
export function rateAvailability(
  rate: Rate,
  context: RateContext,
): { available: boolean; reason: string } {
  if (rate.minGroupSize && context.groupSize < rate.minGroupSize)
    return {
      available: false,
      reason: `Needs ${rate.minGroupSize} or more people registering together.`,
    };

  /*
   * An early-bird amount with no end date is not a rate — it is a permanent discount with
   * the wrong name. Refuse it until somebody sets when it closes.
   */
  if (rate.id === "early-bird" && !rate.availableUntil) {
    return {
      available: false,
      reason: "Early bird needs an end date before it can be offered.",
    };
  }

  if (rate.availableUntil) {
    const closes = new Date(rate.availableUntil).getTime();
    const now = new Date(context.at).getTime();
    if (!Number.isNaN(closes) && !Number.isNaN(now) && now > closes)
      return { available: false, reason: "This rate has closed." };
  }

  if (rate.id === "member" && !context.isMember)
    return { available: false, reason: "For association members only." };

  return { available: true, reason: rate.basis };
}

/**
 * Prices a registration.
 *
 * Returns the cheapest qualifying rate along with everything considered, so
 * the form can show why a participant is paying what they are paying — and
 * what they would need to qualify for a lower rate.
 */
export function priceRegistration(
  rates: Rate[],
  context: RateContext,
): PriceResult {
  const standard =
    rates.find((r) => r.id === "standard") ??
    rates.reduce((max, r) => (r.amount > max.amount ? r : max), rates[0]);

  const qualified: Rate[] = [];
  const unavailable: { rate: Rate; reason: string }[] = [];

  for (const rate of rates) {
    const check = rateAvailability(rate, context);
    if (check.available) qualified.push(rate);
    else unavailable.push({ rate, reason: check.reason });
  }

  // Cheapest wins. Never cumulative.
  const sorted = [...qualified].sort((a, b) => a.amount - b.amount);
  const applied = sorted[0] ?? standard;

  const people = Math.max(1, context.groupSize);

  return {
    applied,
    qualified: sorted,
    unavailable,
    perPerson: applied.amount,
    total: applied.amount * people,
    savedPerPerson: Math.max(0, (standard?.amount ?? applied.amount) - applied.amount),
  };
}

/** One line explaining the rate, for the participant. */
export function describeRate(result: PriceResult, currency = "PKR"): string {
  const money = (n: number) => `${currency} ${n.toLocaleString("en-PK")}`;

  if (result.savedPerPerson === 0)
    return `${money(result.perPerson)} per person — ${result.applied.label}.`;

  return `${money(result.perPerson)} per person — ${result.applied.label}, saving ${money(result.savedPerPerson)}.`;
}

/**
 * What the participant would need to do to pay less.
 *
 * Only ever suggests something they can act on. Telling someone they could
 * have paid less had they registered a week earlier is not advice, it is a
 * complaint, so closed rates are never offered as a suggestion.
 */
export function cheaperRateHint(
  result: PriceResult,
  context: RateContext,
  currency = "PKR",
): string | null {
  const cheaper = result.unavailable
    .filter(({ rate }) => rate.amount < result.perPerson)
    .filter(({ rate }) => {
      // Incomplete early-bird (no end date) is not something they can act on.
      if (rate.id === "early-bird" && !rate.availableUntil) return false;
      // A closed early-bird rate cannot be reached; a group size can.
      if (!rate.availableUntil) return true;
      return new Date(rate.availableUntil).getTime() >= new Date(context.at).getTime();
    })
    .sort((a, b) => a.rate.amount - b.rate.amount)[0];

  if (!cheaper) return null;

  const money = `${currency} ${cheaper.rate.amount.toLocaleString("en-PK")}`;

  if (cheaper.rate.minGroupSize)
    return `Registering ${cheaper.rate.minGroupSize} or more together brings this down to ${money} each.`;

  if (cheaper.rate.id === "member")
    return `Association members pay ${money}.`;

  return null;
}

/* -------------------------------------------------------------------------- */
/* Priority pricing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A coupon that sets a price rather than taking an amount off.
 *
 * The organizer states these as prices — "HHS → PKR 1,000" — so they are stored
 * that way. Expressing them as a discount amount instead would mean recomputing
 * the offer every time the regular fee moved, and one stale subtraction would
 * quietly charge the wrong figure.
 */
export interface PriceCoupon {
  code: string;
  label: string;
  price: number;
  /** Inclusive: a coupon available "until today" works all of that day. */
  availableUntil?: string;
}

export interface PriceRules {
  regular: number;
  regularLabel: string;
  /** The member price, and the body it belongs to. */
  member?: { price: number; label: string };
  coupons: PriceCoupon[];
  currency: string;
}

export interface PriceContext {
  isMember: boolean;
  /** Whatever the participant typed, if anything. */
  code?: string;
  at: string;
}

export type CouponState =
  | { status: "none" }
  | { status: "accepted"; coupon: PriceCoupon }
  | { status: "unknown"; message: string }
  | { status: "expired"; message: string };

export interface ResolvedPrice {
  regular: number;
  final: number;
  /** What earned the price, for the line the participant reads. */
  appliedLabel: string;
  appliedKind: "regular" | "coupon" | "member";
  saving: number;
  coupon: CouponState;
  currency: string;
}

/**
 * Resolves one price from the rules the organizer set.
 *
 * Exactly one reduction applies. The order is coupon, then membership, then the
 * regular fee — so somebody cannot combine a coupon with PSA membership and pay
 * less than either offer alone. Stacking is the failure that matters here:
 * three reductions on a PKR 1,250 entry could take it near nothing, and the
 * organizer would only find out while counting the takings.
 *
 * A coupon that is not recognised, or has expired, does not silently fall back
 * to the regular fee — the refusal is returned so the form can say which it was.
 * Someone hunting for a typo in a code that merely expired wastes their time.
 */
export function resolvePrice(rules: PriceRules, context: PriceContext): ResolvedPrice {
  const typed = (context.code ?? "").trim().toUpperCase();
  const now = new Date(context.at).getTime();

  let coupon: CouponState = { status: "none" };

  if (typed) {
    const match = rules.coupons.find((c) => c.code.toUpperCase() === typed);

    if (!match) {
      coupon = { status: "unknown", message: "That code is not recognised." };
    } else if (match.availableUntil) {
      const ends = new Date(match.availableUntil).getTime();
      coupon =
        !Number.isNaN(ends) && !Number.isNaN(now) && now > ends
          ? { status: "expired", message: `${match.label} has closed.` }
          : { status: "accepted", coupon: match };
    } else {
      coupon = { status: "accepted", coupon: match };
    }
  }

  const base = {
    regular: rules.regular,
    coupon,
    currency: rules.currency,
  };

  if (coupon.status === "accepted") {
    return {
      ...base,
      final: coupon.coupon.price,
      appliedLabel: coupon.coupon.label,
      appliedKind: "coupon",
      saving: Math.max(0, rules.regular - coupon.coupon.price),
    };
  }

  if (context.isMember && rules.member) {
    return {
      ...base,
      final: rules.member.price,
      appliedLabel: rules.member.label,
      appliedKind: "member",
      saving: Math.max(0, rules.regular - rules.member.price),
    };
  }

  return {
    ...base,
    final: rules.regular,
    appliedLabel: rules.regularLabel,
    appliedKind: "regular",
    saving: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* The rate card an event charges from                                         */
/* -------------------------------------------------------------------------- */

/**
 * The rates an event charges from.
 *
 * An organiser who has entered nothing beyond the entry fee has one rate, and it is the
 * fee — so a form reading this prices correctly for an event that was never given a rate
 * card, rather than falling through to zero.
 *
 * The reason this exists: the brackets used to live in `feeDetails`, a free-text box that
 * was printed on the form and read by nothing. Somebody ticking "PSA member" was charged
 * the regular fee, because no code anywhere connected the sentence to the price. A rate
 * card is the same information in a shape that can be charged from.
 */
export function rateCardFor(event: { fee: number; currency?: string; rates?: Rate[] }): Rate[] {
  const configured = (event.rates ?? []).filter((r) => Number.isFinite(r.amount) && r.amount >= 0);

  const standard: Rate = {
    id: "standard",
    label: "Regular",
    amount: Math.max(0, event.fee),
    basis: "The regular entry fee.",
  };

  if (configured.length === 0) return [standard];

  /*
   * Entry fee is the regular rate. A card that already has `standard` keeps its label, but
   * the amount always follows `fee` — otherwise Settings can change the entry fee while the
   * form keeps charging an older number buried in the rate card.
   */
  if (configured.some((r) => r.id === "standard")) {
    return configured.map((r) =>
      r.id === "standard" ? { ...r, amount: Math.max(0, event.fee) } : r,
    );
  }

  return [standard, ...configured];
}

/**
 * Whether the desk has to see something before this rate is honoured.
 *
 * A membership and a group of three are both claims made by the person registering, and
 * neither can be checked from here. The price they are quoted is the price they claimed,
 * and the desk settles it — so the claim travels with the registration instead of being
 * silently trusted or silently ignored.
 */
export function rateNeedsVerification(rate: Rate): boolean {
  return rate.id === "member" || rate.id === "family";
}

/* -------------------------------------------------------------------------- */
/* Pricing one activity                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What somebody pays for the activity they chose.
 *
 * Separate from `priceRegistration` above, which prices an event from one rate card. An event
 * that sells several things prices each of them differently: the tournament is tiered — a
 * member price, an early bird, a higher price at the door — and the painting seat is one
 * number. A single card for the whole event could not say that, which is how the form ended
 * up asking "Are you a PSA member?" above a ticket the answer had no effect on.
 *
 * The rule is the same as everywhere else here: **the cheapest bracket they qualify for, and
 * they are told which one it is.** Never a stack.
 */


export interface ActivityPriceContext {
  /** Whether the participant claims membership. Checked at the desk, not here. */
  isMember: boolean;
  /** When the registration is being made. ISO. */
  at: string;
  /**
   * How they said they will pay, once they have said.
   *
   * Paying now is cheaper than settling at the desk, so the method is part of the price and
   * not merely a note attached to it. Null while the question is unanswered, which prices
   * them at the regular rate rather than at a discount they have not earned.
   */
  payment?: "online" | "cash" | "complimentary" | null;
}

export interface ActivityTier {
  rate: ActivityRate;
  /** Whether this form can charge it. */
  available: boolean;
  /** Why not, for the line under a bracket somebody cannot have. */
  reason?: string;
  /** True for the one actually being charged. */
  applied: boolean;
}

export interface ActivityPrice {
  /** What they pay, per person. */
  amount: number;
  /** The bracket charged, for the record and the line they read. */
  label: string;
  id: string;
  /** Every bracket, in the order the organiser listed them. */
  tiers: ActivityTier[];
  /** The regular price, for comparison. */
  regular: number;
  /** Whether the desk has to see something before this price is honoured. */
  needsCheck: boolean;
}

/**
 * Whether this form may charge a bracket, and why not when it may not.
 *
 * `walk-in` is the interesting one: it is a real price, it belongs on the price list, and it
 * must never be charged here. It exists to tell somebody that registering now is cheaper than
 * turning up — a list that omits it loses the whole point, and a form that applies it would
 * charge a walk-in rate to somebody who did not walk in.
 */
export function activityRateAvailability(
  rate: ActivityRate,
  context: ActivityPriceContext,
): { available: boolean; reason?: string } {
  if (rate.id === "walk-in")
    return { available: false, reason: "Paid at the door, without registering." };

  if (rate.id === "member" && !context.isMember)
    return { available: false, reason: "For association members." };

  /*
   * The online price is earned by paying now.
   *
   * Somebody settling at the desk has not paid anything yet, and the gap between the two is
   * the whole reason the organiser offers it — so it cannot be given to a registration that
   * has only promised cash on the day.
   */
  if (rate.id === "online" && context.payment !== "online")
    return { available: false, reason: "When you pay online now." };

  if (rate.id === "early-bird") {
    /*
     * An early-bird amount with no end date is not a rate — it is a permanent discount with
     * the wrong name. The same refusal `rateAvailability` makes, for the same reason.
     */
    if (!rate.availableUntil)
      return { available: false, reason: "Not open yet." };

    const closes = new Date(rate.availableUntil).getTime();
    const now = new Date(context.at).getTime();
    if (!Number.isNaN(closes) && !Number.isNaN(now) && now > closes)
      return { available: false, reason: "This rate has closed." };
  }

  return { available: true };
}

export function priceActivity(
  option: ActivityOption,
  context: ActivityPriceContext,
): ActivityPrice {
  const card: ActivityRate[] =
    option.rates && option.rates.length > 0
      ? option.rates
      : [{ id: "regular", label: "Regular", amount: option.price }];

  const judged = card.map((rate) => ({ rate, ...activityRateAvailability(rate, context) }));

  const chargeable = judged.filter((t) => t.available);
  /* Cheapest wins. Never cumulative — see priceRegistration for why. */
  const cheapest = [...chargeable].sort((a, b) => a.rate.amount - b.rate.amount)[0];

  const applied =
    cheapest?.rate ?? card.find((r) => r.id === "regular") ?? { id: "regular" as const, label: "Regular", amount: option.price };

  return {
    amount: applied.amount,
    label: applied.label,
    id: applied.id,
    tiers: judged.map((t) => ({ ...t, applied: t.rate === applied })),
    regular: card.find((r) => r.id === "regular")?.amount ?? option.price,
    /* A membership is a claim the desk settles; a date is not. */
    needsCheck: applied.id === "member",
  };
}
