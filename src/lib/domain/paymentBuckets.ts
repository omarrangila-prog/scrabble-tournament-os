/**
 * Where each registration's money actually stands.
 *
 * One total was never enough. The 23 August entry list mixes people who have paid online,
 * people who will hand over cash at the door, people whose payment the organizer has not yet
 * checked, two on a promotion, and one whose amount nobody has established. Adding those into
 * a single "revenue" figure would report PKR 14,600 as money in hand when barely half of it
 * has arrived.
 *
 * So the amounts are separated, and the separation is derived from what is stored rather than
 * kept as its own field that could drift:
 *
 *   paid       — verified. The only bucket that is revenue.
 *   cash       — promised at the venue. Real, expected, and not collected.
 *   review     — an amount is recorded but nobody has confirmed it.
 *   promo      — complimentary, worth nothing and correctly so.
 *   unknown    — no amount at all. Not zero: unestablished.
 *
 * `unknown` is separate from `review` for the reason the whole import exists: "PKR 0" and "we
 * do not know yet" are different facts and only one of them is true.
 */

export type PaymentBucket = "paid" | "cash" | "review" | "promo" | "unknown";

export interface BucketSource {
  /** The application's own payment state. */
  paymentStatus: string;
  /** The amount recorded, or null when nobody has established one. */
  amountDue: number | null;
}

export const BUCKET_LABEL: Record<PaymentBucket, string> = {
  paid: "Paid online",
  cash: "Cash at venue",
  review: "Needs review",
  promo: "Complimentary",
  unknown: "Unpaid / unknown",
};

/** The order the organizer reads them in: money in, money coming, money in question. */
export const BUCKET_ORDER: PaymentBucket[] = ["paid", "cash", "review", "promo", "unknown"];

export function bucketFor(source: BucketSource): PaymentBucket {
  if (source.paymentStatus === "verified") return "paid";
  if (source.paymentStatus === "complimentary") return "promo";
  if (source.paymentStatus === "cash-at-venue") return "cash";

  /*
   * Checked after the explicit states, not before. A complimentary registration has no
   * amount either, and testing for a missing amount first would file it as unknown — turning
   * a decision somebody made into a question nobody has answered.
   */
  if (source.amountDue === null || source.amountDue === undefined) return "unknown";

  return "review";
}

export interface BucketTotals {
  bucket: PaymentBucket;
  label: string;
  people: number;
  /** Sum of recorded amounts. Zero where nothing is recorded, never a guess. */
  amount: number;
}

/**
 * Every bucket, in reading order, including the empty ones.
 *
 * Empty buckets are kept deliberately. A missing "Cash at venue" tile reads as "no cash to
 * collect" only if you already knew the tile existed; showing it at zero says so.
 */
export function bucketTotals(sources: BucketSource[]): BucketTotals[] {
  const counts = new Map<PaymentBucket, { people: number; amount: number }>();
  for (const bucket of BUCKET_ORDER) counts.set(bucket, { people: 0, amount: 0 });

  for (const source of sources) {
    const entry = counts.get(bucketFor(source))!;
    entry.people += 1;
    entry.amount += source.amountDue ?? 0;
  }

  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    label: BUCKET_LABEL[bucket],
    ...counts.get(bucket)!,
  }));
}

/** What has actually arrived. The only figure that may be called revenue. */
export function collectedRevenue(sources: BucketSource[]): number {
  return sources
    .filter((s) => bucketFor(s) === "paid")
    .reduce((total, s) => total + (s.amountDue ?? 0), 0);
}
