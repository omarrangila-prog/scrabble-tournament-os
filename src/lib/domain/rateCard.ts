/**
 * What one entrant pays.
 *
 * An organiser advertises a handful of rates — a regular one, a lower one for association
 * members, a lower one again for a group, and an early-bird rate that closes on a date. A
 * person can qualify for more than one, and the only answer that is defensible when they do
 * is the cheapest: nobody advertises four prices meaning to charge somebody the highest one
 * they happen to match.
 *
 * Pure, and separate from the form, because this is money. Every rate is a number an
 * organiser typed into their own event, and every reduction has to be traceable to a rule
 * they wrote down rather than to something a screen inferred.
 */

export interface RateCard {
  /** What somebody pays if no other rate applies. Always present. */
  regular: number;
  /** Lower rate for association members, when the organiser offers one. */
  psaMember?: number;
  /** Lower rate for a group booking. */
  group?: number;
  /** Smallest group that qualifies. Defaults to 3, which is what the rate card usually says. */
  groupMinimum?: number;
  /** Lower rate before a closing date. */
  earlyBird?: number;
  /** The day the early-bird rate closes, inclusive, as `YYYY-MM-DD`. */
  earlyBirdUntil?: string;
  currency?: string;
}

export interface RateAnswers {
  /** Whether they claim the association rate. */
  psaMember: boolean;
  /** How many people are being entered together, if they said. */
  groupSize?: number;
}

export interface RateResult {
  /** What they pay. */
  amount: number;
  /** Which rule produced it, in the organiser's own words, for the desk and the receipt. */
  label: string;
  /** Every rate they qualified for, cheapest first — so a director can see the workings. */
  applicable: { label: string; amount: number }[];
  currency: string;
}

/**
 * The cheapest rate this person qualifies for.
 *
 * `today` is passed in rather than read from the clock so the same registration always
 * prices the same way when it is recomputed — a fee that changes depending on when somebody
 * looks at it is not a fee.
 */
export function rateFor(card: RateCard, answers: RateAnswers, today: string): RateResult {
  const currency = card.currency ?? "PKR";
  const applicable: { label: string; amount: number }[] = [
    { label: "Regular", amount: Math.max(0, card.regular) },
  ];

  if (typeof card.psaMember === "number" && answers.psaMember) {
    applicable.push({ label: "PSA member", amount: Math.max(0, card.psaMember) });
  }

  const minimum = card.groupMinimum ?? 3;
  if (typeof card.group === "number" && (answers.groupSize ?? 0) >= minimum) {
    applicable.push({ label: `Group of ${minimum} or more`, amount: Math.max(0, card.group) });
  }

  /*
   * Compared as dates, not as times. An early bird closing "on the 7th" means the whole of
   * the 7th, and a deadline that expires at midnight local time catches out everybody who
   * registers that evening.
   */
  if (
    typeof card.earlyBird === "number" &&
    card.earlyBirdUntil &&
    today <= card.earlyBirdUntil
  ) {
    applicable.push({ label: "Early bird", amount: Math.max(0, card.earlyBird) });
  }

  const sorted = [...applicable].sort((a, b) => a.amount - b.amount);
  const best = sorted[0];

  return { amount: best.amount, label: best.label, applicable: sorted, currency };
}

/** Reads a rate card off an event's stored details, ignoring anything malformed. */
export function rateCardFrom(details: Record<string, unknown> | undefined, fallbackFee: number): RateCard {
  const raw = (details?.rates ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  return {
    regular: num(raw.regular) ?? fallbackFee,
    psaMember: num(raw.psaMember),
    group: num(raw.group),
    groupMinimum: num(raw.groupMinimum) ?? 3,
    earlyBird: num(raw.earlyBird),
    earlyBirdUntil:
      typeof raw.earlyBirdUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.earlyBirdUntil)
        ? raw.earlyBirdUntil
        : undefined,
    currency: typeof details?.currency === "string" ? details.currency : "PKR",
  };
}
