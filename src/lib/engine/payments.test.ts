import { describe, expect, it } from "vitest";
import {
  assessReceipt,
  checkReceipt,
  isReceived,
  needsReview,
  normaliseTransactionId,
  PAYMENT_STATUS_LABEL,
  PaymentStatus,
  paymentTotals,
  ReceiptSubmission,
  rejectPayment,
  reviewQueue,
  verifyPayment,
} from "./payments";

const NOW = "2026-08-02T00:00:00.000Z";

const sub = (over: Partial<ReceiptSubmission> = {}): ReceiptSubmission => ({
  registrationId: "reg-1",
  eventId: "ev-1",
  participantName: "Hunain Ahmed",
  amountDue: 2000,
  currency: "PKR",
  fileName: "receipt.jpg",
  status: "receipt-uploaded",
  submittedAt: "2026-08-01T10:00:00.000Z",
  extract: {
    amount: 2000,
    transactionId: "TXN-11223344",
    paidAt: "2026-08-01T09:30:00.000Z",
    receiverAccount: "PK00MEZN0001234567890",
    imageHash: "hash-a",
    confidence: 92,
  },
  ...over,
});

const ctx = (others: ReceiptSubmission[] = []) => ({
  others,
  now: NOW,
  expectedReceiver: "PK00MEZN0001234567890",
});

describe("status vocabulary", () => {
  it("counts only verified as money received", () => {
    const all: PaymentStatus[] = [
      "not-submitted",
      "receipt-uploaded",
      "processing",
      "review-required",
      "verified",
      "amount-mismatch",
      "duplicate-transaction",
      "invalid-receipt",
      "rejected",
      "partially-paid",
      "complimentary",
      "refunded",
    ];
    expect(all.filter(isReceived)).toEqual(["verified"]);
  });

  /** The core rule: an uploaded image is a claim, not cash. */
  it("does not treat an uploaded receipt as received", () => {
    expect(isReceived("receipt-uploaded")).toBe(false);
    expect(needsReview("receipt-uploaded")).toBe(true);
  });

  it("labels every status in plain language", () => {
    for (const [status, label] of Object.entries(PAYMENT_STATUS_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(status);
    }
  });
});

describe("checkReceipt", () => {
  it("passes a clean receipt with nothing flagged", () => {
    expect(checkReceipt(sub(), ctx())).toEqual([]);
  });

  it("blocks a receipt short of the amount due", () => {
    const flags = checkReceipt(sub({ extract: { amount: 1500, transactionId: "T1" } }), ctx());
    const short = flags.find((f) => f.code === "amount-short");
    expect(short?.severity).toBe("blocker");
    expect(short?.message).toContain("500");
  });

  it("notes an overpayment without blocking it", () => {
    const flags = checkReceipt(sub({ extract: { amount: 2500, transactionId: "T1" } }), ctx());
    const over = flags.find((f) => f.code === "amount-over");
    expect(over?.severity).toBe("note");
  });

  /** The forwarded-screenshot case. */
  it("blocks an image already submitted by someone else", () => {
    const other = sub({
      registrationId: "reg-2",
      participantName: "Ayesha Khan",
      extract: { imageHash: "hash-a", amount: 2000, transactionId: "TXN-OTHER" },
    });
    const flags = checkReceipt(sub(), ctx([other]));
    const dup = flags.find((f) => f.code === "duplicate-image");
    expect(dup?.severity).toBe("blocker");
    expect(dup?.message).toContain("Ayesha Khan");
  });

  it("blocks a transaction id already used on another entry", () => {
    const other = sub({
      registrationId: "reg-2",
      participantName: "Bilal Iqbal",
      extract: { transactionId: "txn 1122 3344", amount: 2000, imageHash: "hash-z" },
    });
    const flags = checkReceipt(sub(), ctx([other]));
    const dup = flags.find((f) => f.code === "duplicate-transaction");
    expect(dup?.severity).toBe("blocker");
    expect(dup?.message).toContain("Bilal Iqbal");
  });

  it("does not flag a receipt against itself", () => {
    expect(checkReceipt(sub(), ctx([sub()]))).toEqual([]);
  });

  it("blocks money sent to the wrong account", () => {
    const flags = checkReceipt(
      sub({ extract: { amount: 2000, transactionId: "T1", receiverAccount: "PK99OTHER000999" } }),
      ctx(),
    );
    expect(flags.find((f) => f.code === "wrong-receiver")?.severity).toBe("blocker");
  });

  it("accepts a partly masked account number", () => {
    const flags = checkReceipt(
      sub({ extract: { amount: 2000, transactionId: "T1", receiverAccount: "1234567890" } }),
      ctx(),
    );
    expect(flags.find((f) => f.code === "wrong-receiver")).toBeUndefined();
  });

  it("warns about a transfer that predates registration", () => {
    const flags = checkReceipt(
      sub({ extract: { amount: 2000, transactionId: "T1", paidAt: "2025-01-01T00:00:00.000Z" } }),
      ctx(),
    );
    const stale = flags.find((f) => f.code === "stale-date");
    expect(stale?.severity).toBe("warning");
  });

  it("blocks a receipt dated in the future", () => {
    const flags = checkReceipt(
      sub({ extract: { amount: 2000, transactionId: "T1", paidAt: "2026-12-01T00:00:00.000Z" } }),
      ctx(),
    );
    expect(flags.find((f) => f.code === "future-date")?.severity).toBe("blocker");
  });

  it("blocks when no receipt was uploaded at all", () => {
    const flags = checkReceipt(sub({ fileName: undefined, extract: undefined }), ctx());
    expect(flags[0].code).toBe("unreadable");
    expect(flags[0].severity).toBe("blocker");
  });

  /** A random JPG reads as nothing, and must not sail through. */
  it("warns rather than passes when nothing could be read", () => {
    const flags = checkReceipt(sub({ extract: {} }), ctx());
    expect(flags[0].code).toBe("unreadable");
    expect(flags[0].severity).toBe("warning");
  });

  it("warns on low extraction confidence", () => {
    const flags = checkReceipt(
      sub({ extract: { amount: 2000, transactionId: "T1", confidence: 20 } }),
      ctx(),
    );
    expect(flags.some((f) => f.code === "unreadable")).toBe(true);
  });

  it("warns when the amount could not be read", () => {
    const flags = checkReceipt(sub({ extract: { transactionId: "T1" } }), ctx());
    expect(flags.some((f) => f.code === "no-amount")).toBe(true);
  });
});

describe("normaliseTransactionId", () => {
  it("ignores case and separators", () => {
    expect(normaliseTransactionId("txn-1122 3344")).toBe(normaliseTransactionId("TXN11223344"));
  });
});

describe("assessReceipt", () => {
  it("lets a clean receipt be verified without an override", () => {
    const a = assessReceipt(sub(), ctx());
    expect(a.canVerifyCleanly).toBe(true);
    expect(a.blockers).toEqual([]);
  });

  it("never suggests verified as a status", () => {
    const cases = [
      sub(),
      sub({ extract: { amount: 100, transactionId: "T1" } }),
      sub({ extract: {} }),
      sub({ fileName: undefined, extract: undefined }),
    ];
    for (const c of cases) {
      expect(assessReceipt(c, ctx()).suggestedStatus).not.toBe("verified");
    }
  });

  it("routes a short payment to amount-mismatch", () => {
    const a = assessReceipt(sub({ extract: { amount: 500, transactionId: "T1" } }), ctx());
    expect(a.suggestedStatus).toBe("amount-mismatch");
    expect(a.canVerifyCleanly).toBe(false);
  });

  it("routes a reused image to duplicate-transaction", () => {
    const other = sub({
      registrationId: "reg-2",
      participantName: "Other",
      extract: { imageHash: "hash-a" },
    });
    expect(assessReceipt(sub(), ctx([other])).suggestedStatus).toBe("duplicate-transaction");
  });

  it("ranks a blocked receipt above a merely unreadable one", () => {
    const blocked = assessReceipt(sub({ extract: { amount: 10, transactionId: "T1" } }), ctx());
    const unclear = assessReceipt(sub({ extract: {} }), ctx());
    expect(blocked.priority).toBeGreaterThan(unclear.priority);
  });
});

describe("verifyPayment", () => {
  const clean = () => assessReceipt(sub(), ctx());
  const blocked = () => assessReceipt(sub({ extract: { amount: 100, transactionId: "T1" } }), ctx());

  it("verifies a clean receipt and records the reviewer", () => {
    const r = verifyPayment(clean(), "Sir Hani", "Checked against the bank statement.", {
      at: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.decision?.status).toBe("verified");
    expect(r.decision?.by).toBe("Sir Hani");
  });

  it("refuses verification without a named reviewer", () => {
    expect(verifyPayment(clean(), "   ", "note").ok).toBe(false);
  });

  it("refuses to verify over a blocker unless overridden", () => {
    const r = verifyPayment(blocked(), "Sir Hani", "Looks fine");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("short of the");
  });

  it("allows a deliberate override and records what was overridden", () => {
    const r = verifyPayment(blocked(), "Sir Hani", "Paid the balance in cash at the venue.", {
      override: true,
      at: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.decision?.overrodeFlags).toContain("amount-short");
  });

  it("records no override list for a clean verification", () => {
    const r = verifyPayment(clean(), "Sir Hani", "ok", { at: NOW });
    expect(r.decision?.overrodeFlags).toBeUndefined();
  });
});

describe("rejectPayment", () => {
  it("requires a reason the participant can act on", () => {
    expect(rejectPayment("Sir Hani", "  ").ok).toBe(false);
  });

  it("records the rejection with its reason", () => {
    const r = rejectPayment("Sir Hani", "Receipt is for another event.", { at: NOW });
    expect(r.ok).toBe(true);
    expect(r.decision?.status).toBe("rejected");
    expect(r.decision?.note).toBe("Receipt is for another event.");
  });

  it("requires a named reviewer", () => {
    expect(rejectPayment("", "reason").ok).toBe(false);
  });
});

describe("reviewQueue", () => {
  it("excludes settled payments", () => {
    const q = reviewQueue(
      [
        sub({ registrationId: "a", status: "verified" }),
        sub({ registrationId: "b", status: "rejected" }),
        sub({ registrationId: "c", status: "complimentary" }),
        sub({ registrationId: "d", status: "receipt-uploaded" }),
      ],
      { now: NOW },
    );
    expect(q.map((e) => e.submission.registrationId)).toEqual(["d"]);
  });

  it("puts the most problematic receipt first", () => {
    const q = reviewQueue(
      [
        sub({ registrationId: "clean" }),
        sub({
          registrationId: "short",
          extract: { amount: 200, transactionId: "T-SHORT", imageHash: "h2" },
        }),
      ],
      { now: NOW, expectedReceiver: "PK00MEZN0001234567890" },
    );
    expect(q[0].submission.registrationId).toBe("short");
  });

  it("breaks ties on submission time, oldest first", () => {
    const q = reviewQueue(
      [
        sub({ registrationId: "later", submittedAt: "2026-08-01T12:00:00.000Z", extract: { amount: 2000, transactionId: "T-B", imageHash: "hb" } }),
        sub({ registrationId: "earlier", submittedAt: "2026-08-01T08:00:00.000Z", extract: { amount: 2000, transactionId: "T-A", imageHash: "ha" } }),
      ],
      { now: NOW },
    );
    expect(q[0].submission.registrationId).toBe("earlier");
  });

  it("detects duplicates across the whole queue", () => {
    const q = reviewQueue(
      [
        sub({ registrationId: "a", participantName: "A", extract: { imageHash: "same", amount: 2000, transactionId: "T-A" } }),
        sub({ registrationId: "b", participantName: "B", extract: { imageHash: "same", amount: 2000, transactionId: "T-B" } }),
      ],
      { now: NOW },
    );
    expect(q.every((e) => e.assessment.blockers.some((f) => f.code === "duplicate-image"))).toBe(
      true,
    );
  });
});

describe("paymentTotals", () => {
  it("counts verified as received and everything else as claimed", () => {
    const t = paymentTotals([
      sub({ registrationId: "a", status: "verified" }),
      sub({ registrationId: "b", status: "receipt-uploaded" }),
      sub({ registrationId: "c", status: "not-submitted" }),
    ]);
    expect(t.received).toBe(2000);
    expect(t.claimed).toBe(2000);
    expect(t.outstanding).toBe(2000);
  });

  /** The safety property, stated directly. */
  it("never counts an unverified receipt as received", () => {
    const t = paymentTotals([
      sub({ status: "receipt-uploaded" }),
      sub({ registrationId: "b", status: "review-required" }),
      sub({ registrationId: "c", status: "amount-mismatch" }),
    ]);
    expect(t.received).toBe(0);
  });

  it("excludes complimentary and refunded entries from every figure", () => {
    const t = paymentTotals([
      sub({ status: "complimentary" }),
      sub({ registrationId: "b", status: "refunded" }),
    ]);
    expect(t).toMatchObject({ received: 0, claimed: 0, outstanding: 0, awaitingReview: 0 });
  });

  it("does not count a rejected receipt as owed or claimed", () => {
    const t = paymentTotals([sub({ status: "rejected" })]);
    expect(t.claimed).toBe(0);
    expect(t.awaitingReview).toBe(0);
  });

  it("counts blocked receipts separately", () => {
    const t = paymentTotals([
      sub({ registrationId: "a", status: "amount-mismatch" }),
      sub({ registrationId: "b", status: "duplicate-transaction" }),
      sub({ registrationId: "c", status: "receipt-uploaded" }),
    ]);
    expect(t.awaitingReview).toBe(3);
    expect(t.blocked).toBe(2);
  });
});
