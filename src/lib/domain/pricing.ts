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
): string | null {
  const cheaper = result.unavailable
    .filter(({ rate }) => rate.amount < result.perPerson)
    .filter(({ rate }) => {
      // A closed early-bird rate cannot be reached; a group size can.
      if (!rate.availableUntil) return true;
      return new Date(rate.availableUntil).getTime() >= new Date(context.at).getTime();
    })
    .sort((a, b) => a.rate.amount - b.rate.amount)[0];

  if (!cheaper) return null;

  if (cheaper.rate.minGroupSize)
    return `Registering ${cheaper.rate.minGroupSize} or more together brings this down to PKR ${cheaper.rate.amount.toLocaleString("en-PK")} each.`;

  if (cheaper.rate.id === "member")
    return `Association members pay PKR ${cheaper.rate.amount.toLocaleString("en-PK")}.`;

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
