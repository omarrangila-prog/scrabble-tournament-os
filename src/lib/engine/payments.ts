/**
 * Payment receipt review.
 *
 * The principle running through this module: **a receipt image is not proof
 * that money arrived.** It is a claim by the participant, and only a human
 * comparing it against the expected amount and the receiving account — or a
 * payment provider confirming the transaction directly — can settle it.
 *
 * So nothing here ever marks a payment verified. It extracts, it flags, it
 * ranks what a reviewer should look at first. `verify` is a decision a named
 * person takes, and it is recorded against their name.
 *
 * The checks below catch the failures that actually happen at Pakistani
 * tournaments: the same screenshot forwarded between friends, a transaction id
 * reused across entries, an amount short of the fee, and a receipt from last
 * season's event.
 */

export type PaymentStatus =
  | "not-submitted"
  | "receipt-uploaded"
  | "processing"
  | "review-required"
  | "verified"
  | "amount-mismatch"
  | "duplicate-transaction"
  | "invalid-receipt"
  | "rejected"
  | "partially-paid"
  | "complimentary"
  | "refunded";

/** Plain language, because these strings are shown to participants too. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  "not-submitted": "Waiting for payment",
  "receipt-uploaded": "Receipt under review",
  processing: "Being processed",
  "review-required": "Needs a closer look",
  verified: "Payment verified",
  "amount-mismatch": "Amount does not match",
  "duplicate-transaction": "Duplicate transaction",
  "invalid-receipt": "Receipt not readable",
  rejected: "Receipt rejected",
  "partially-paid": "Partially paid",
  complimentary: "Complimentary entry",
  refunded: "Refunded",
};

/** Statuses that count as money actually received. */
export const RECEIVED_STATUSES: PaymentStatus[] = ["verified"];

/** Statuses a reviewer still has to act on. */
export const OPEN_STATUSES: PaymentStatus[] = [
  "receipt-uploaded",
  "processing",
  "review-required",
  "amount-mismatch",
  "duplicate-transaction",
  "invalid-receipt",
  "partially-paid",
];

export function isReceived(status: PaymentStatus): boolean {
  return RECEIVED_STATUSES.includes(status);
}

export function needsReview(status: PaymentStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/* -------------------------------------------------------------------------- */
/* Extracted receipt data                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What reading a receipt image produces.
 *
 * Every field is optional and every field is a *claim*. The type carries no
 * notion of confidence being sufficient, because no confidence level makes an
 * image into proof of a bank transfer.
 */
export interface ReceiptExtract {
  amount?: number;
  transactionId?: string;
  /** ISO date, if one could be read. */
  paidAt?: string;
  senderName?: string;
  receiverAccount?: string;
  method?: string;
  /** Content hash of the uploaded file, for duplicate detection. */
  imageHash?: string;
  /** 0–100. Low confidence means "look harder", never "reject". */
  confidence?: number;
}

/** A submitted receipt awaiting a decision. */
export interface ReceiptSubmission {
  registrationId: string;
  eventId: string;
  participantName: string;
  /** What this participant owes after discounts. */
  amountDue: number;
  currency: string;
  fileName?: string;
  extract?: ReceiptExtract;
  status: PaymentStatus;
  submittedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

export type FlagCode =
  | "amount-short"
  | "amount-over"
  | "duplicate-image"
  | "duplicate-transaction"
  | "wrong-receiver"
  | "stale-date"
  | "future-date"
  | "unreadable"
  | "no-amount"
  | "no-transaction-id";

export interface Flag {
  code: FlagCode;
  severity: "blocker" | "warning" | "note";
  /** Written for the reviewer, naming the specific discrepancy. */
  message: string;
}

export interface CheckContext {
  /** The account the organizer expects money to arrive in. */
  expectedReceiver?: string;
  /** Every other submission, for cross-entry duplicate detection. */
  others: ReceiptSubmission[];
  /** Receipts older than this many days predate the event's registration. */
  maxAgeDays?: number;
  /** Evaluation time, injected so results are reproducible. */
  now?: string;
  /** Below this, extraction is treated as unreliable. */
  minConfidence?: number;
}

const DEFAULT_MAX_AGE_DAYS = 90;
const DEFAULT_MIN_CONFIDENCE = 55;

/** Normalises a transaction id for comparison: case and separators vary. */
export function normaliseTransactionId(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Everything questionable about one receipt.
 *
 * Returns an empty list when nothing is wrong — which still does not mean the
 * payment is real, only that nothing detectable is wrong with the claim.
 */
export function checkReceipt(
  submission: ReceiptSubmission,
  context: CheckContext,
): Flag[] {
  const flags: Flag[] = [];
  const extract = submission.extract;
  const currency = submission.currency;

  if (!submission.fileName && !extract) {
    return [
      {
        code: "unreadable",
        severity: "blocker",
        message: "No receipt has been uploaded.",
      },
    ];
  }

  if (!extract || Object.keys(extract).length === 0) {
    return [
      {
        code: "unreadable",
        severity: "warning",
        message: "Nothing could be read from this image. Check it by eye.",
      },
    ];
  }

  const minConfidence = context.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (extract.confidence !== undefined && extract.confidence < minConfidence) {
    flags.push({
      code: "unreadable",
      severity: "warning",
      message: `Only ${extract.confidence}% of this receipt could be read reliably. Verify every field by eye.`,
    });
  }

  /* ---- Amount ------------------------------------------------------- */

  if (extract.amount === undefined) {
    flags.push({
      code: "no-amount",
      severity: "warning",
      message: "No amount could be read. Confirm it against the receipt.",
    });
  } else if (extract.amount < submission.amountDue) {
    const short = submission.amountDue - extract.amount;
    flags.push({
      code: "amount-short",
      severity: "blocker",
      message: `Receipt shows ${currency} ${extract.amount.toLocaleString("en-PK")}, which is ${currency} ${short.toLocaleString("en-PK")} short of the ${currency} ${submission.amountDue.toLocaleString("en-PK")} due.`,
    });
  } else if (extract.amount > submission.amountDue) {
    const over = extract.amount - submission.amountDue;
    flags.push({
      code: "amount-over",
      severity: "note",
      message: `Receipt shows ${currency} ${over.toLocaleString("en-PK")} more than the amount due. Confirm whether a refund is owed.`,
    });
  }

  /* ---- Transaction id ------------------------------------------------ */

  if (!extract.transactionId) {
    flags.push({
      code: "no-transaction-id",
      severity: "warning",
      message: "No transaction reference could be read.",
    });
  } else {
    const mine = normaliseTransactionId(extract.transactionId);
    const clash = context.others.find(
      (o) =>
        o.registrationId !== submission.registrationId &&
        o.extract?.transactionId &&
        normaliseTransactionId(o.extract.transactionId) === mine,
    );
    if (clash) {
      flags.push({
        code: "duplicate-transaction",
        severity: "blocker",
        message: `Transaction ${extract.transactionId} was already submitted by ${clash.participantName}. One transfer cannot pay two entries.`,
      });
    }
  }

  /* ---- Duplicate image ------------------------------------------------ */

  if (extract.imageHash) {
    const sameImage = context.others.find(
      (o) =>
        o.registrationId !== submission.registrationId &&
        o.extract?.imageHash === extract.imageHash,
    );
    if (sameImage) {
      flags.push({
        code: "duplicate-image",
        severity: "blocker",
        message: `This exact image was previously submitted by ${sameImage.participantName}.`,
      });
    }
  }

  /* ---- Receiving account ---------------------------------------------- */

  if (context.expectedReceiver && extract.receiverAccount) {
    const expected = normaliseTransactionId(context.expectedReceiver);
    const actual = normaliseTransactionId(extract.receiverAccount);
    // Account numbers are often partly masked, so match on the visible tail.
    const matches =
      expected.endsWith(actual) || actual.endsWith(expected) || expected === actual;
    if (!matches) {
      flags.push({
        code: "wrong-receiver",
        severity: "blocker",
        message: `Money went to ${extract.receiverAccount}, not the tournament account. This payment is not for this event.`,
      });
    }
  }

  /* ---- Date ------------------------------------------------------------ */

  if (extract.paidAt) {
    const paid = new Date(extract.paidAt).getTime();
    const now = new Date(context.now ?? new Date().toISOString()).getTime();

    if (!Number.isNaN(paid)) {
      const days = Math.floor((now - paid) / 86_400_000);
      const maxAge = context.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;

      if (days > maxAge) {
        flags.push({
          code: "stale-date",
          severity: "warning",
          message: `This transfer is ${days} days old, which predates registration. It may belong to a previous event.`,
        });
      } else if (days < -1) {
        flags.push({
          code: "future-date",
          severity: "blocker",
          message: "This receipt is dated in the future, which is not possible.",
        });
      }
    }
  }

  return flags;
}

/* -------------------------------------------------------------------------- */
/* Review decisions                                                            */
/* -------------------------------------------------------------------------- */

export interface ReviewAssessment {
  flags: Flag[];
  blockers: Flag[];
  /** Status to move to while awaiting a human decision. */
  suggestedStatus: PaymentStatus;
  /**
   * Whether a reviewer may mark this verified without overriding something.
   * Never means "verify automatically" — a human still decides.
   */
  canVerifyCleanly: boolean;
  /** Highest first, so a queue can be ordered by what needs attention. */
  priority: number;
}

/**
 * Assesses a receipt and suggests where it belongs in the queue.
 *
 * The suggested status is always one that keeps the payment *open*. Nothing in
 * this module can produce `verified` — that transition exists only in
 * `verifyPayment`, which requires a reviewer's name.
 */
export function assessReceipt(
  submission: ReceiptSubmission,
  context: CheckContext,
): ReviewAssessment {
  const flags = checkReceipt(submission, context);
  const blockers = flags.filter((f) => f.severity === "blocker");

  let suggestedStatus: PaymentStatus = "review-required";
  if (blockers.some((f) => f.code === "duplicate-transaction" || f.code === "duplicate-image"))
    suggestedStatus = "duplicate-transaction";
  else if (blockers.some((f) => f.code === "amount-short")) suggestedStatus = "amount-mismatch";
  else if (blockers.some((f) => f.code === "wrong-receiver")) suggestedStatus = "invalid-receipt";
  else if (flags.some((f) => f.code === "unreadable")) suggestedStatus = "review-required";
  else if (flags.length === 0) suggestedStatus = "receipt-uploaded";

  const priority =
    blockers.length * 100 +
    flags.filter((f) => f.severity === "warning").length * 10 +
    flags.length;

  return {
    flags,
    blockers,
    suggestedStatus,
    canVerifyCleanly: blockers.length === 0,
    priority,
  };
}

export interface ReviewDecision {
  status: PaymentStatus;
  by: string;
  at: string;
  note: string;
  /** Set when the reviewer verified despite blockers. */
  overrodeFlags?: FlagCode[];
}

export interface DecisionResult {
  ok: boolean;
  decision?: ReviewDecision;
  /** Why the decision was refused. */
  reason?: string;
}

/**
 * Records a verification decision.
 *
 * Requires a named reviewer, and requires an explicit override when blockers
 * are present — a short payment or a reused transaction id can be accepted,
 * but only deliberately and on the record.
 */
export function verifyPayment(
  assessment: ReviewAssessment,
  by: string,
  note: string,
  options: { override?: boolean; at?: string } = {},
): DecisionResult {
  if (!by.trim())
    return { ok: false, reason: "A payment can only be verified by a named reviewer." };

  if (assessment.blockers.length > 0 && !options.override) {
    const first = assessment.blockers[0];
    return {
      ok: false,
      reason: `${first.message} Verify anyway only if you have confirmed the payment another way.`,
    };
  }

  const overrodeFlags = assessment.blockers.map((f) => f.code);

  return {
    ok: true,
    decision: {
      status: "verified",
      by: by.trim(),
      at: options.at ?? new Date().toISOString(),
      note: note.trim(),
      overrodeFlags: overrodeFlags.length ? overrodeFlags : undefined,
    },
  };
}

/** Records a rejection. A reason is required — the participant is told it. */
export function rejectPayment(
  by: string,
  reason: string,
  options: { at?: string } = {},
): DecisionResult {
  if (!by.trim())
    return { ok: false, reason: "A receipt can only be rejected by a named reviewer." };
  if (!reason.trim())
    return { ok: false, reason: "Give a reason. The participant is shown it and must act on it." };

  return {
    ok: true,
    decision: {
      status: "rejected",
      by: by.trim(),
      at: options.at ?? new Date().toISOString(),
      note: reason.trim(),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Queue                                                                       */
/* -------------------------------------------------------------------------- */

export interface QueueEntry {
  submission: ReceiptSubmission;
  assessment: ReviewAssessment;
}

/**
 * Orders receipts by how much they need a human, worst first.
 *
 * Ties break on submission time so the queue is stable and someone who
 * uploaded first is not overtaken by an identical later entry.
 */
export function reviewQueue(
  submissions: ReceiptSubmission[],
  context: Omit<CheckContext, "others">,
): QueueEntry[] {
  const open = submissions.filter((s) => needsReview(s.status));

  return open
    .map((submission) => ({
      submission,
      assessment: assessReceipt(submission, { ...context, others: submissions }),
    }))
    .sort((a, b) => {
      if (b.assessment.priority !== a.assessment.priority)
        return b.assessment.priority - a.assessment.priority;
      return a.submission.submittedAt.localeCompare(b.submission.submittedAt);
    });
}

export interface PaymentTotals {
  /** Verified only. What the organizer can actually spend. */
  received: number;
  /** Claimed but unverified. Explicitly not money. */
  claimed: number;
  /** Nothing submitted yet. */
  outstanding: number;
  awaitingReview: number;
  blocked: number;
}

/** Headline figures for the payments tab. */
export function paymentTotals(submissions: ReceiptSubmission[]): PaymentTotals {
  let received = 0;
  let claimed = 0;
  let outstanding = 0;
  let awaitingReview = 0;
  let blocked = 0;

  for (const s of submissions) {
    if (s.status === "complimentary" || s.status === "refunded") continue;

    if (isReceived(s.status)) {
      received += s.amountDue;
      continue;
    }

    if (s.status === "not-submitted") {
      outstanding += s.amountDue;
      continue;
    }

    if (s.status === "rejected") continue;

    claimed += s.amountDue;
    awaitingReview += 1;
    if (
      s.status === "amount-mismatch" ||
      s.status === "duplicate-transaction" ||
      s.status === "invalid-receipt"
    )
      blocked += 1;
  }

  return { received, claimed, outstanding, awaitingReview, blocked };
}
