import { describe, expect, it } from "vitest";
import { ParticipationTrack } from "../firebase/schema";
import {
  AFK_DISCOUNT_PERCENT,
  AUTO_VERIFY_ON_UPLOAD,
  BundleEvent,
  BUNDLE_DISCOUNT_PERCENT,
  describeBundle,
  paymentInstructions,
  quoteBundle,
  statusAfterUpload,
  canOpenRegistration,
  setupChecklist,
  SetupInput,
  arrivalInstruction,
  countTracks,
  GAME_ON_FEE,
  GameOnRegistration,
  memberFee,
  modulesFor,
  quoteFee,
  validateRegistration,
} from "./gameOn";

describe("fee", () => {
  it("matches the poster", () => {
    expect(GAME_ON_FEE).toBe(1200);
    expect(AFK_DISCOUNT_PERCENT).toBe(10);
  });

  it("computes the verified member fee the poster implies", () => {
    expect(memberFee()).toBe(1080);
  });

  it("charges the full fee to a non-member", () => {
    const q = quoteFee("not-claimed");
    expect(q.payable).toBe(1200);
    expect(q.totalOff).toBe(0);
    expect(q.lines).toHaveLength(1);
  });

  /**
   * The participant must see the price they will pay while deciding, so the
   * discount shows immediately — but marked provisional, because a claimed
   * membership is not a verified one.
   */
  it("shows a claimed discount immediately but marks it provisional", () => {
    const q = quoteFee("discount-requested");
    expect(q.payable).toBe(1080);
    expect(q.awaitingVerification).toBe(true);
    expect(q.lines.find((l) => l.kind === "member")?.provisional).toBe(true);
  });

  it("settles the discount once membership is verified", () => {
    const q = quoteFee("verified");
    expect(q.payable).toBe(1080);
    expect(q.awaitingVerification).toBe(false);
    expect(q.lines.find((l) => l.kind === "member")?.provisional).toBe(false);
  });

  it("charges full price when membership proof is rejected", () => {
    const q = quoteFee("proof-rejected");
    expect(q.payable).toBe(1200);
    expect(q.lines.some((l) => l.kind === "member")).toBe(false);
  });

  it("still needs review while a membership sits in the queue", () => {
    expect(quoteFee("review-required").awaitingVerification).toBe(true);
  });

  it("applies a campaign code alongside the member discount", () => {
    const q = quoteFee("verified", {
      code: "BAITHAK200",
      label: "Baithak regulars",
      percentOff: 0,
      amountOff: 200,
    });
    expect(q.totalOff).toBe(320);
    expect(q.payable).toBe(880);
  });

  /** Compounding would give away less than the organizer intended to offer. */
  it("takes both reductions from the base fee rather than compounding", () => {
    const q = quoteFee("verified", {
      code: "HALF",
      label: "Half price",
      percentOff: 50,
      amountOff: 0,
    });
    expect(q.totalOff).toBe(120 + 600);
    expect(q.payable).toBe(480);
  });

  it("never makes the payable amount negative", () => {
    const q = quoteFee("verified", {
      code: "BIG",
      label: "Oversized",
      percentOff: 0,
      amountOff: 99_999,
    });
    expect(q.payable).toBe(0);
    expect(q.totalOff).toBe(GAME_ON_FEE);
  });

  it("always opens with the registration fee", () => {
    expect(quoteFee("verified").lines[0]).toMatchObject({ kind: "fee", amount: 1200 });
  });
});

describe("modulesFor", () => {
  /** An empty chair at a board stalls a round. */
  it("keeps a board-game attendee out of Scrabble operations", () => {
    const m = modulesFor("board_games");
    expect(m.scrabbleOperations).toBe(false);
    expect(m.boardGameFloor).toBe(true);
  });

  it("keeps a Scrabble entrant out of the board-game floor count", () => {
    const m = modulesFor("speed_scrabble");
    expect(m.scrabbleOperations).toBe(true);
    expect(m.boardGameFloor).toBe(false);
  });

  it("puts someone doing both into both", () => {
    const m = modulesFor("both");
    expect(m.scrabbleOperations).toBe(true);
    expect(m.boardGameFloor).toBe(true);
  });

  it("counts everyone for attendance", () => {
    for (const t of ["board_games", "speed_scrabble", "both"] as ParticipationTrack[]) {
      expect(modulesFor(t).attendance).toBe(true);
    }
  });
});

describe("arrivalInstruction", () => {
  it("sends a board-game attendee to the welcome desk", () => {
    expect(arrivalInstruction("board_games")).toContain("welcome desk");
  });

  it("tells a Scrabble entrant to wait for pairings", () => {
    expect(arrivalInstruction("speed_scrabble")).toContain("pairing");
  });

  /** Pairings are time-bound; the board-game floor is not. */
  it("leads with the instruction that has a deadline for someone doing both", () => {
    expect(arrivalInstruction("both")).toContain("pairing");
  });
});

describe("countTracks", () => {
  const field: ParticipationTrack[] = [
    "board_games",
    "board_games",
    "board_games",
    "speed_scrabble",
    "speed_scrabble",
    "both",
    "both",
  ];

  it("reports the exclusive splits", () => {
    const c = countTracks(field);
    expect(c.boardGamesOnly).toBe(3);
    expect(c.scrabbleOnly).toBe(2);
    expect(c.both).toBe(2);
    expect(c.total).toBe(7);
  });

  /**
   * The operational totals are what a director sets tables out from. Reporting
   * only the exclusive counts would understate the floor by everyone doing both.
   */
  it("counts people doing both into each operational total", () => {
    const c = countTracks(field);
    expect(c.boardGameFloor).toBe(5);
    expect(c.scrabblePool).toBe(4);
  });

  it("handles an event with no registrations", () => {
    expect(countTracks([])).toMatchObject({
      total: 0,
      boardGameFloor: 0,
      scrabblePool: 0,
    });
  });
});

describe("validateRegistration", () => {
  const base: Partial<GameOnRegistration> = {
    track: "board_games",
    fullName: "Hunain Ahmed",
    email: "hunain@example.com",
    mobile: "03001234567",
    city: "Karachi",
    membershipStatus: "not-claimed",
    communicationConsent: true,
  };

  it("accepts a complete board-game registration", () => {
    expect(validateRegistration(base)).toEqual([]);
  });

  it("requires the essentials", () => {
    const problems = validateRegistration({});
    const fields = problems.map((p) => p.field);
    expect(fields).toContain("track");
    expect(fields).toContain("fullName");
    expect(fields).toContain("email");
  });

  /** Nobody should be blocked by a question they were never shown. */
  it("does not demand a Scrabble level from a board-game attendee", () => {
    expect(validateRegistration(base).some((p) => p.field === "requestedLevel")).toBe(false);
  });

  it("requires a Scrabble level from a Scrabble entrant", () => {
    const problems = validateRegistration({ ...base, track: "speed_scrabble" });
    expect(problems.some((p) => p.field === "requestedLevel")).toBe(true);
  });

  /*
   * The payment screenshot. A registration with no receipt carries no evidence
   * of payment at all, leaving the organizer to chase each person individually.
   */
  describe("payment screenshot", () => {
    const hasReceipt = { requireReceipt: true };

    it("blocks a registration with no screenshot", () => {
      const problems = validateRegistration(base, hasReceipt);
      expect(problems.some((p) => p.field === "receiptFileName")).toBe(true);
    });

    it("accepts one once the screenshot is attached", () => {
      const problems = validateRegistration(
        { ...base, receiptFileName: "transfer.jpg" },
        hasReceipt,
      );
      expect(problems).toEqual([]);
    });

    it("treats a blank filename as no screenshot", () => {
      const problems = validateRegistration({ ...base, receiptFileName: "   " }, hasReceipt);
      expect(problems.some((p) => p.field === "receiptFileName")).toBe(true);
    });

    /**
     * The trap this guards against: an event with no receiving account shows no
     * upload field. Demanding a screenshot there would block registration with
     * an error the participant has no way to clear.
     */
    it("does not demand a screenshot when the event cannot take payment", () => {
      expect(validateRegistration(base, { requireReceipt: false })).toEqual([]);
      expect(validateRegistration(base)).toEqual([]);
    });

    it("names the field so the form can scroll to it", () => {
      const problem = validateRegistration(base, hasReceipt).find(
        (p) => p.field === "receiptFileName",
      );
      expect(problem?.message).toMatch(/screenshot/i);
    });
  });

  it("requires a level from someone doing both", () => {
    const problems = validateRegistration({ ...base, track: "both" });
    expect(problems.some((p) => p.field === "requestedLevel")).toBe(true);
  });

  it("requires a membership number when a discount is claimed", () => {
    const problems = validateRegistration({
      ...base,
      membershipStatus: "discount-requested",
    });
    expect(problems.some((p) => p.field === "membershipNumber")).toBe(true);
  });

  it("does not ask for a membership number from a non-member", () => {
    expect(validateRegistration(base).some((p) => p.field === "membershipNumber")).toBe(false);
  });

  it("explains every problem in the participant's terms", () => {
    for (const p of validateRegistration({})) {
      expect(p.message.length).toBeGreaterThan(0);
      expect(p.message).toMatch(/[.!]$/);
    }
  });
});


describe("setupChecklist", () => {
  const input = (over: Partial<SetupInput> = {}): SetupInput => ({
    hasPaymentMethod: true,
    hasReceivingAccount: true,
    capacity: 0,
    rounds: 0,
    roundMinutes: 0,
    scrabbleEntrants: 0,
    ...over,
  });

  it("passes once payment is configured", () => {
    expect(canOpenRegistration(setupChecklist(input())).ready).toBe(true);
  });

  /** An event nobody can pay for is not open. */
  it("blocks registration without a payment method", () => {
    const r = canOpenRegistration(setupChecklist(input({ hasPaymentMethod: false })));
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("Payment method");
  });

  it("blocks registration without a receiving account", () => {
    expect(canOpenRegistration(setupChecklist(input({ hasReceivingAccount: false }))).ready).toBe(
      false,
    );
  });

  it("counts several blockers rather than naming only the first", () => {
    const r = canOpenRegistration(
      setupChecklist(input({ hasPaymentMethod: false, hasReceivingAccount: false })),
    );
    expect(r.reason).toContain("2 details");
  });

  /** Worth flagging, not worth stopping people registering over. */
  it("does not block on a missing capacity or deadline", () => {
    const items = setupChecklist(input());
    const capacity = items.find((i) => i.id === "capacity")!;
    expect(capacity.done).toBe(false);
    expect(capacity.blocking).toBe(false);
    expect(canOpenRegistration(items).ready).toBe(true);
  });

  /** Asking for a round count before anyone has entered is noise. */
  it("stays quiet about format until someone enters Speed Scrabble", () => {
    const none = setupChecklist(input({ scrabbleEntrants: 0 }));
    expect(none.some((i) => i.id === "rounds")).toBe(false);

    const some = setupChecklist(input({ scrabbleEntrants: 4 }));
    expect(some.some((i) => i.id === "rounds")).toBe(true);
    expect(some.find((i) => i.id === "rounds")!.hint).toContain("4 people");
  });

  it("marks format complete once configured", () => {
    const items = setupChecklist(input({ scrabbleEntrants: 4, rounds: 6, roundMinutes: 20 }));
    expect(items.find((i) => i.id === "rounds")!.done).toBe(true);
    expect(items.find((i) => i.id === "round-length")!.done).toBe(true);
  });

  it("gives every outstanding item a reason", () => {
    for (const item of setupChecklist(input({ hasPaymentMethod: false }))) {
      if (!item.done) expect(item.hint).toBeDefined();
    }
  });
});


/**
 * The publish path, end to end.
 *
 * GAME ON! ships as a draft because the poster states no payment account. This
 * is the sequence that takes it live, and it is worth pinning: the event was
 * unpublishable by design, and a regression here would either strand the
 * organizer or let money be collected with nowhere to send it.
 */
describe("opening registration for GAME ON!", () => {
  const asShipped: SetupInput = {
    hasPaymentMethod: false,
    hasReceivingAccount: false,
    capacity: 0,
    rounds: 0,
    roundMinutes: 0,
    scrabbleEntrants: 0,
  };

  it("starts blocked, exactly as the poster leaves it", () => {
    const r = canOpenRegistration(setupChecklist(asShipped));
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("2 details");
  });

  it("is still blocked with a method but no account", () => {
    expect(
      canOpenRegistration(setupChecklist({ ...asShipped, hasPaymentMethod: true })).ready,
    ).toBe(false);
  });

  it("opens once a method and an account are both set", () => {
    const r = canOpenRegistration(
      setupChecklist({ ...asShipped, hasPaymentMethod: true, hasReceivingAccount: true }),
    );
    expect(r.ready).toBe(true);
  });

  /** Cash needs no account, so a cash-only event is ready without one. */
  it("opens for a cash-only event without any account details", () => {
    const r = canOpenRegistration(
      setupChecklist({
        ...asShipped,
        hasPaymentMethod: true,
        // The settings screen passes true here when cash is the only method.
        hasReceivingAccount: true,
      }),
    );
    expect(r.ready).toBe(true);
  });

  it("does not require capacity, rounds or a deadline to open", () => {
    const items = setupChecklist({
      ...asShipped,
      hasPaymentMethod: true,
      hasReceivingAccount: true,
    });
    const outstanding = items.filter((i) => !i.done).map((i) => i.id);
    expect(outstanding).toContain("capacity");
    expect(canOpenRegistration(items).ready).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */

describe("multi-event bundles", () => {
  const events: BundleEvent[] = [
    { id: "a", name: "GAME ON!", date: "8 August", fee: 1200 },
    { id: "b", name: "Second event", date: "15 August", fee: 1200 },
    { id: "c", name: "Third event", date: "23 August", fee: 1000 },
  ];

  it("charges full price for a single event", () => {
    const q = quoteBundle([events[0]], events);
    expect(q.subtotal).toBe(1200);
    expect(q.bundleOff).toBe(0);
    expect(q.qualifies).toBe(false);
  });

  it("applies the discount from two events", () => {
    const q = quoteBundle([events[0], events[1]], events);
    expect(q.subtotal).toBe(2400);
    expect(q.bundleOff).toBe(360);
    expect(q.qualifies).toBe(true);
  });

  it("scales with a third event", () => {
    const q = quoteBundle(events, events);
    expect(q.subtotal).toBe(3400);
    expect(q.bundleOff).toBe(510);
  });

  /** An offer that punishes taking it is worse than no offer. */
  it("never makes the total rise when another event is added", () => {
    const one = quoteBundle([events[0]], events);
    const two = quoteBundle([events[0], events[2]], events);
    expect(two.subtotal - two.bundleOff).toBeGreaterThanOrEqual(one.subtotal - one.bundleOff);
  });

  it("tells a single-event registrant what one more would save", () => {
    const q = quoteBundle([events[0]], events);
    expect(q.nextTierSaving).toBeGreaterThan(0);
  });

  it("stops nudging once every event is selected", () => {
    expect(quoteBundle(events, events).nextTierSaving).toBe(0);
  });

  /** The nudge must not overstate what the next event is actually worth. */
  it("quotes only the additional saving once the discount is already earned", () => {
    const q = quoteBundle([events[0], events[1]], events);
    const withThird = quoteBundle(events, events);
    expect(q.nextTierSaving).toBe(withThird.bundleOff - q.bundleOff);
  });

  it("handles an empty selection", () => {
    const q = quoteBundle([], events);
    expect(q.subtotal).toBe(0);
    expect(q.bundleOff).toBe(0);
    expect(describeBundle(q)).toContain("at least one");
  });

  it("uses the configured percentage", () => {
    expect(BUNDLE_DISCOUNT_PERCENT).toBe(15);
    expect(quoteBundle([events[0], events[1]], events, 50).bundleOff).toBe(1200);
  });

  it("describes the position in the participant's terms", () => {
    expect(describeBundle(quoteBundle([events[0]], events))).toContain("Add one more");
    expect(describeBundle(quoteBundle([events[0], events[1]], events))).toContain("applied");
  });
});

describe("paymentInstructions", () => {
  /** An empty account number invites someone to send money anywhere. */
  it("returns nothing when no details are configured", () => {
    expect(paymentInstructions(["bank-transfer"], "", "")).toEqual([]);
  });

  it("reads a bank line into title and number", () => {
    const [i] = paymentInstructions(
      ["bank-transfer"],
      "Meezan Bank · GAME ON! · PK00 MEZN 0000 0012 3456 78",
      "",
    );
    expect(i.accountTitle).toBe("GAME ON!");
    expect(i.accountNumber).toContain("PK00 MEZN");
  });

  /**
   * The real account line, verbatim. The bank name used to be discarded, which
   * left the form showing an account number with nothing to say where to send
   * it — not enough to complete a transfer.
   */
  it("keeps the bank and branch off the real account line", () => {
    const [i] = paymentInstructions(
      ["bank-transfer"],
      "Habib Metropolitan Bank · Huda Garib · 6-01-70-20311-714-140261 · IBAN PK66MPBL0170027140140261 · Khayaban-e-Shahbaz Branch",
      "",
    );

    expect(i.bank).toContain("Habib Metropolitan Bank");
    expect(i.bank).toContain("Khayaban-e-Shahbaz Branch");
    expect(i.accountTitle).toBe("Huda Garib");
    expect(i.accountNumber).toContain("6-01-70-20311-714-140261");
    expect(i.accountNumber).toContain("PK66MPBL0170027140140261");
    // The branch belongs with the bank, not in the number someone copies.
    expect(i.accountNumber).not.toMatch(/Branch/i);
  });

  it("reads a wallet number written with the title in brackets", () => {
    const [i] = paymentInstructions(["easypaisa"], "", "0300 1234567 (Sir Hani)");
    expect(i.method).toBe("EasyPaisa");
    expect(i.accountTitle).toBe("Sir Hani");
    expect(i.accountNumber).toBe("0300 1234567");
  });

  it("offers only the methods the organizer enabled", () => {
    const out = paymentInstructions(["easypaisa"], "", "0300 1234567 (Sir Hani)");
    expect(out.map((i) => i.method)).toEqual(["EasyPaisa"]);
  });

  it("needs no account for cash at the venue", () => {
    const [i] = paymentInstructions(["cash"], "", "");
    expect(i.method).toContain("Cash");
    expect(i.note).toContain("No upload needed");
  });
});

describe("statusAfterUpload", () => {
  it("marks nothing submitted without a receipt", () => {
    expect(statusAfterUpload(false, false)).toBe("not-submitted");
  });

  it("marks cash payers as paying at the venue", () => {
    expect(statusAfterUpload(false, true)).toBe("cash-at-venue");
  });

  /**
   * The organizer chose auto-verification deliberately, against a
   * recommendation. This test documents the consequence rather than endorsing
   * it: any uploaded file marks the payment received, so paid and unpaid
   * entrants are indistinguishable in the records. Flip AUTO_VERIFY_ON_UPLOAD
   * to restore review-before-verified.
   */
  it("verifies on upload, as configured", () => {
    expect(AUTO_VERIFY_ON_UPLOAD).toBe(true);
    expect(statusAfterUpload(true, false)).toBe("verified");
  });

  it("would hold a receipt for review if auto-verification were off", () => {
    // Guards the other branch so turning the flag off cannot silently break.
    const held = AUTO_VERIFY_ON_UPLOAD ? "receipt-uploaded" : statusAfterUpload(true, false);
    expect(held).toBe("receipt-uploaded");
  });
});
