import { describe, expect, it } from "vitest";
import {
  ATTEMPT_WINDOW_MS,
  arrivalCounts,
  attemptVerdict,
  checkInOutcome,
  CHECK_IN_CODE_LENGTH,
  findByCode,
  findByToken,
  generateCheckInCode,
  maskMobile,
  maskName,
  MAX_CODE_ATTEMPTS,
  normaliseCode,
  paymentGate,
  recordFailure,
  windowState,
} from "./checkIn";
import type { GuestPaymentStatus, GuestRegistration } from "../store/useEventStore";

const reg = (over: Partial<GuestRegistration> = {}): GuestRegistration =>
  ({
    id: "reg-1",
    token: "TOKENAAA",
    eventId: "evt-alphabattle-23-august",
    fullName: "Ahmed Khan",
    email: "ahmed@example.com",
    mobile: "03001234567",
    dateOfBirth: "",
    city: "Karachi",
    club: "Unaffiliated",
    experience: "",
    preferredDivision: "recreational",
    answers: {},
    paymentMethod: "bank-transfer",
    amountDue: 1250,
    discountAmount: 0,
    currency: "PKR",
    status: "approved",
    paymentStatus: "verified",
    submittedAt: "2026-08-01T10:00:00+05:00",
    timeline: [],
    checkInCode: "482731",
    ...over,
  }) as GuestRegistration;

describe("generateCheckInCode", () => {
  it("produces six digits", () => {
    const code = generateCheckInCode([]);
    expect(code).toHaveLength(CHECK_IN_CODE_LENGTH);
    expect(code).toMatch(/^\d{6}$/);
  });

  /**
   * Two participants sharing a code would check each other in, and the
   * collision would only surface when one was marked present twice.
   */
  it("never reissues a code already taken", () => {
    // A generator that would collide twice before finding a free code.
    const sequence = [0.482731, 0.482731, 0.193204];
    let i = 0;
    const code = generateCheckInCode(["482731"], () => sequence[i++] ?? 0.5);
    expect(code).not.toBe("482731");
  });

  it("keeps leading zeros rather than shortening the code", () => {
    expect(generateCheckInCode([], () => 0.0000042)).toMatch(/^\d{6}$/);
  });

  it("issues distinct codes across a realistic field", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i += 1) taken.add(generateCheckInCode(taken));
    expect(taken.size).toBe(200);
  });

  /** Failing loudly beats handing out a duplicate nobody notices. */
  it("throws rather than returning a duplicate when the space is exhausted", () => {
    expect(() => generateCheckInCode(["000000"], () => 0)).toThrow();
  });
});

describe("normaliseCode", () => {
  it("accepts a pasted code with spaces or hyphens", () => {
    expect(normaliseCode("482 731")).toBe("482731");
    expect(normaliseCode("482-731")).toBe("482731");
  });

  it("ignores anything beyond six digits", () => {
    expect(normaliseCode("4827319999")).toBe("482731");
  });
});

describe("findByCode", () => {
  const list = [reg(), reg({ id: "reg-2", token: "TOKENBBB", checkInCode: "193204" })];

  it("finds the participant whose code it is", () => {
    const r = findByCode(list, "193204", "evt-alphabattle-23-august");
    expect(r.found && r.registration.id).toBe("reg-2");
  });

  it("accepts a pasted code", () => {
    expect(findByCode(list, " 482 731 ", "evt-alphabattle-23-august").found).toBe(true);
  });

  it("refuses an incomplete code without searching", () => {
    expect(findByCode(list, "4827", "evt-alphabattle-23-august").found).toBe(false);
  });

  /**
   * Event-scoped deliberately. A code from another event must not admit anybody
   * here, and digits will inevitably repeat across events.
   */
  it("refuses a code belonging to another event", () => {
    const other = [reg({ eventId: "evt-other" })];
    const r = findByCode(other, "482731", "evt-alphabattle-23-august");
    expect(r.found).toBe(false);
    expect(!r.found && r.reason).toBe("wrong-event");
  });
});

describe("findByToken", () => {
  it("finds the participant by their personal token", () => {
    expect(findByToken([reg()], "TOKENAAA", "evt-alphabattle-23-august").found).toBe(true);
  });

  it("refuses a token from another event", () => {
    const r = findByToken([reg({ eventId: "evt-other" })], "TOKENAAA", "evt-alphabattle-23-august");
    expect(!r.found && r.reason).toBe("wrong-event");
  });

  it("refuses an empty token", () => {
    expect(findByToken([reg()], "  ", "evt-alphabattle-23-august").found).toBe(false);
  });
});

describe("paymentGate", () => {
  it("admits a verified payment", () => {
    expect(paymentGate("verified").allowed).toBe(true);
  });

  /** Arriving and paying are separate: a cash payer has still arrived. */
  it("admits a cash payer and flags the desk to collect", () => {
    const gate = paymentGate("cash-at-venue");
    expect(gate.allowed).toBe(true);
    expect(gate.allowed && gate.collectCash).toBe(true);
  });

  it("holds back a rejected payment", () => {
    expect(paymentGate("invalid-receipt").allowed).toBe(false);
  });

  /** A participant must never be shown an internal state name. */
  it("explains a pending payment in plain words", () => {
    const gate = paymentGate("receipt-uploaded");
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toMatch(/being checked/i);
      expect(gate.reason).not.toMatch(/receipt-uploaded|firebase|status/i);
    }
  });

  it("can be configured to refuse cash", () => {
    const gate = paymentGate("cash-at-venue", { allow: ["verified"], provisionalForCash: false });
    expect(gate.allowed).toBe(false);
  });
});

describe("checkInOutcome", () => {
  const now = "2026-08-23T12:14:00+05:00";

  it("checks in a verified participant", () => {
    const out = checkInOutcome(reg(), "venue_qr", now);
    expect(out).toMatchObject({ result: "checked-in", method: "venue_qr", at: now });
  });

  /**
   * The rule the arrivals figure depends on. Somebody who taps twice, or scans
   * and then opens their link, must not be counted twice — and their arrival
   * time must stay the moment they actually arrived.
   */
  it("does not check in twice or move the arrival time", () => {
    const first = "2026-08-23T12:14:00+05:00";
    const out = checkInOutcome(reg({ checkedInAt: first }), "personal_link", now);
    expect(out).toEqual({ result: "already-checked-in", at: first });
  });

  it("blocks a payment the policy refuses, with a readable reason", () => {
    const out = checkInOutcome(reg({ paymentStatus: "invalid-receipt" }), "venue_qr", now);
    expect(out.result).toBe("blocked");
  });

  /** Already checked in wins over a payment problem raised afterwards. */
  it("still reports an existing check-in even if payment later fails review", () => {
    const out = checkInOutcome(
      reg({ checkedInAt: "2026-08-23T12:00:00+05:00", paymentStatus: "invalid-receipt" }),
      "venue_qr",
      now,
    );
    expect(out.result).toBe("already-checked-in");
  });
});

describe("arrivalCounts", () => {
  it("counts nobody as arrived before the event", () => {
    const counts = arrivalCounts([reg(), reg({ id: "r2" })]);
    expect(counts).toMatchObject({ expected: 2, checkedIn: 0, notArrived: 2, percent: 0 });
  });

  it("counts arrivals and the percentage", () => {
    const counts = arrivalCounts([
      reg({ checkedInAt: "2026-08-23T12:00:00+05:00" }),
      reg({ id: "r2" }),
      reg({ id: "r3", checkedInAt: "2026-08-23T12:05:00+05:00" }),
      reg({ id: "r4" }),
    ]);
    expect(counts.checkedIn).toBe(2);
    expect(counts.percent).toBe(50);
  });

  /** Counting somebody who is not coming makes the room look emptier than it is. */
  it("excludes a rejected registration from the expected figure", () => {
    const counts = arrivalCounts([reg(), reg({ id: "r2", status: "rejected" })]);
    expect(counts.expected).toBe(1);
    expect(counts.cancelled).toBe(1);
  });

  /** A waitlisted entrant admitted at the desk must not exceed the expected count. */
  it("keeps a waitlisted entrant in the expected figure", () => {
    const counts = arrivalCounts([
      reg({ status: "waitlisted", checkedInAt: "2026-08-23T12:00:00+05:00" }),
    ]);
    expect(counts.expected).toBe(1);
    expect(counts.checkedIn).toBe(1);
    expect(counts.percent).toBe(100);
  });

  it("reports a payment issue only for those not yet arrived", () => {
    const counts = arrivalCounts([
      reg({ id: "r1", paymentStatus: "invalid-receipt" }),
      reg({ id: "r2", paymentStatus: "invalid-receipt", checkedInAt: "2026-08-23T12:00:00+05:00" }),
    ]);
    expect(counts.paymentIssue).toBe(1);
  });

  /** Never show NaN on a venue display. */
  it("reports zero percent for an empty event", () => {
    expect(arrivalCounts([])).toMatchObject({ expected: 0, checkedIn: 0, percent: 0 });
  });
});

describe("attemptVerdict", () => {
  const now = 1_000_000;

  it("allows the first attempts", () => {
    expect(attemptVerdict({ failures: [] }, now).allowed).toBe(true);
  });

  /**
   * Six digits is nothing against a script. Without a limit somebody could walk
   * the space and read back every participant's name and level.
   */
  it("stops further attempts after the limit", () => {
    const failures = Array.from({ length: MAX_CODE_ATTEMPTS }, (_, i) => now - i * 100);
    expect(attemptVerdict({ failures }, now).allowed).toBe(false);
  });

  it("forgets failures once the window has passed", () => {
    const stale = Array.from({ length: MAX_CODE_ATTEMPTS }, () => now - ATTEMPT_WINDOW_MS - 1);
    expect(attemptVerdict({ failures: stale }, now).allowed).toBe(true);
  });

  /** Saying how many attempts remain is a hint for whoever is guessing. */
  it("never reveals how many attempts are left", () => {
    const failures = Array.from({ length: MAX_CODE_ATTEMPTS }, () => now);
    const verdict = attemptVerdict({ failures }, now);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.message).not.toMatch(/\d/);
  });

  it("records failures and drops aged ones", () => {
    const log = recordFailure({ failures: [now - ATTEMPT_WINDOW_MS - 5] }, now);
    expect(log.failures).toEqual([now]);
  });
});

describe("windowState", () => {
  it("allows check-in only when open", () => {
    expect(windowState("open").canCheckIn).toBe(true);
    for (const s of ["not-open", "paused", "closed"] as const) {
      expect(windowState(s).canCheckIn).toBe(false);
    }
  });

  it("names the opening time when there is one", () => {
    expect(windowState("not-open", "11:45 AM").message).toContain("11:45 AM");
  });

  it("sends people to the desk once online check-in closes", () => {
    expect(windowState("closed").message).toMatch(/desk/i);
  });
});

describe("masking", () => {
  /** Enough to recognise yourself, not enough to learn who is attending. */
  it("masks a name to initials", () => {
    expect(maskName("Ahmed Khan")).toBe("A**** K***");
  });

  it("handles a single name and extra spaces", () => {
    expect(maskName("  Ahmed  ")).toBe("A****");
  });

  it("masks a mobile to its last three digits", () => {
    expect(maskMobile("0300 8278594")).toBe("•••• ••• 594");
  });

  it("never echoes a full number back", () => {
    expect(maskMobile("03008278594")).not.toContain("0300827");
  });
});

/** Nothing a participant can see may carry an internal record id. */
describe("privacy", () => {
  it("keeps the record id out of everything the participant is given", () => {
    const r = reg();
    const exposed = [r.token, r.checkInCode ?? "", maskName(r.fullName), maskMobile(r.mobile)];
    for (const value of exposed) expect(value).not.toContain(r.id);
  });

  const gateReasons: GuestPaymentStatus[] = [
    "not-submitted",
    "receipt-uploaded",
    "processing",
    "review-required",
    "amount-mismatch",
    "duplicate-transaction",
    "invalid-receipt",
  ];

  it("never shows a raw payment state in a refusal", () => {
    for (const status of gateReasons) {
      const gate = paymentGate(status);
      if (!gate.allowed) expect(gate.reason).not.toContain(status);
    }
  });
});
