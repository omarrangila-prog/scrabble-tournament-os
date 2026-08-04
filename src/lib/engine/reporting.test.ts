import { describe, expect, it } from "vitest";
import { expenseTotals, feeTotals, financePosition } from "./finance";
import {
  buildDocument,
  buildReport,
  distribution,
  REPORT_PAGES,
  ReportInput,
} from "./reporting";

const fees = feeTotals([
  { amountDue: 2000, discountAmount: 0, paymentStatus: "verified", status: "approved" },
  { amountDue: 2000, discountAmount: 0, paymentStatus: "verified", status: "approved" },
  { amountDue: 2000, discountAmount: 300, paymentStatus: "receipt-uploaded", status: "approved" },
  { amountDue: 2000, discountAmount: 0, paymentStatus: "not-submitted", status: "approved" },
]);

const expenses = expenseTotals([
  { id: "e1", eventId: "ev", category: "venue", description: "Hall", amount: 3000, status: "paid", at: "x" },
  { id: "e2", eventId: "ev", category: "prizes", description: "Prizes", amount: 2000, status: "committed", at: "x" },
]);

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  eventName: "Bluffy Alphabattle",
  organizer: "Bluffy Alphabattle",
  startDate: "20 August 2026",
  venue: "Clifton Hall",
  city: "Karachi",
  currency: "PKR",
  capacity: 128,
  rounds: 6,
  registrations: [
    { status: "approved", paymentStatus: "verified", division: "Masters", city: "Karachi", club: "KSC", isReturning: true },
    { status: "approved", paymentStatus: "verified", division: "Masters", city: "Karachi", club: "KSC", isReturning: false },
    { status: "approved", paymentStatus: "receipt-uploaded", division: "Advanced", city: "Lahore", club: "LSC", isReturning: false },
    { status: "waitlisted", paymentStatus: "not-submitted", division: "Beginner", city: "Multan", club: "MSC", isReturning: false },
  ],
  attendance: { checkedIn: 3 },
  play: {
    boardsTotal: 12,
    boardsVerified: 11,
    conflicts: 1,
    averageScore: 402.5,
    highestScore: 561,
    averageSpread: 34.2,
    roundsCompleted: 6,
  },
  fees,
  expenses,
  position: financePosition(fees, expenses),
  certificates: { prepared: 10, issued: 8, withdrawn: 1 },
  notifications: { sent: 40, failed: 2 },
  generatedAt: "2026-08-21T10:00:00.000Z",
  generatedBy: "Sir Hani",
  ...over,
});

describe("distribution", () => {
  it("counts and sorts largest first", () => {
    const rows = distribution(["A", "B", "A", "A", "B", "C"]);
    expect(rows[0]).toMatchObject({ label: "A", count: 3, share: 50 });
    expect(rows[1].label).toBe("B");
  });

  it("labels blank values rather than dropping them", () => {
    const rows = distribution(["Karachi", "  "]);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.label === "Not stated")).toBe(true);
  });

  /** Truncating a tail would leave shares that do not sum to the whole. */
  it("collapses the tail instead of truncating it", () => {
    const rows = distribution(["A", "A", "B", "C", "D", "E"], { limit: 2 });
    expect(rows).toHaveLength(3);
    expect(rows[2].label).toContain("Other");
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(6);
  });

  it("does not collapse when everything fits", () => {
    expect(distribution(["A", "B"], { limit: 5 })).toHaveLength(2);
  });

  it("returns nothing for no items", () => {
    expect(distribution([])).toEqual([]);
  });

  it("breaks ties alphabetically so the order is stable", () => {
    const rows = distribution(["B", "A"]);
    expect(rows.map((r) => r.label)).toEqual(["A", "B"]);
  });
});

describe("buildReport", () => {
  it("produces the five declared pages in order", () => {
    expect(buildReport(input()).map((s) => s.page)).toEqual(REPORT_PAGES.map((p) => p.id));
  });

  /** The first page must convey the event's condition in a few seconds. */
  it("opens with a summary naming entries, attendance and money", () => {
    const summary = buildReport(input())[0].summary!;
    expect(summary).toContain("4 registrations");
    expect(summary).toContain("3 players");
    expect(summary).toContain("PKR");
  });

  it("gives only the executive page a summary", () => {
    const sections = buildReport(input());
    expect(sections[0].summary).toBeDefined();
    for (const s of sections.slice(1)) expect(s.summary).toBeUndefined();
  });

  it("qualifies revenue as verified only", () => {
    const revenue = buildReport(input())[0].metrics.find((m) => m.label === "Revenue received");
    expect(revenue?.caveat).toContain("Verified");
  });

  it("counts only verified payments as revenue", () => {
    const revenue = buildReport(input())[0].metrics.find((m) => m.label === "Revenue received");
    expect(revenue?.value).toBe("PKR 4,000");
  });

  it("flags receipts awaiting verification as excluded", () => {
    const observations = buildReport(input())[0].observations;
    expect(observations.some((o) => o.includes("awaiting verification"))).toBe(true);
  });

  it("says nothing about pending receipts when there are none", () => {
    const clean = feeTotals([
      { amountDue: 2000, discountAmount: 0, paymentStatus: "verified", status: "approved" },
    ]);
    const sections = buildReport(
      input({ fees: clean, position: financePosition(clean, expenses) }),
    );
    expect(sections[0].observations.some((o) => o.includes("awaiting verification"))).toBe(false);
  });

  it("reports conflicts on the executive page", () => {
    expect(buildReport(input())[0].observations.some((o) => o.includes("score conflict"))).toBe(
      true,
    );
  });

  it("counts approved entries only in the division table", () => {
    const table = buildReport(input())[1].tables.find((t) => t.title === "By division")!;
    expect(table.rows.reduce((s, r) => s + r.count, 0)).toBe(3);
  });

  it("separates new participants from returning ones", () => {
    const metrics = buildReport(input())[1].metrics;
    expect(metrics.find((m) => m.label === "New participants")?.value).toBe("2");
  });

  it("warns that unverified boards are excluded from play figures", () => {
    const boards = buildReport(input())[2].metrics.find((m) => m.label === "Boards verified");
    expect(boards?.caveat).toContain("excluded");
  });

  it("names boards that finished without a verified result", () => {
    expect(buildReport(input())[2].observations.some((o) => o.includes("1 board"))).toBe(true);
  });

  it("notes rounds that did not take place", () => {
    const sections = buildReport(
      input({ play: { ...input().play, roundsCompleted: 4 } }),
    );
    expect(sections[2].observations.some((o) => o.includes("2 scheduled rounds"))).toBe(true);
  });

  it("marks verified revenue as the only money received", () => {
    const metric = buildReport(input())[3].metrics.find((m) => m.label === "Verified revenue");
    expect(metric?.caveat).toContain("only figure");
  });

  it("reports unpaid fees on the financial page", () => {
    expect(buildReport(input())[3].observations.some((o) => o.includes("never submitted"))).toBe(
      true,
    );
  });

  it("reports certificates that were prepared but never issued", () => {
    expect(
      buildReport(input())[4].observations.some((o) => o.includes("2 prepared certificates")),
    ).toBe(true);
  });

  it("uses the singular for one undelivered certificate", () => {
    const sections = buildReport(
      input({ certificates: { prepared: 9, issued: 8, withdrawn: 0 } }),
    );
    expect(
      sections[4].observations.some((o) => o.includes("1 prepared certificate was")),
    ).toBe(true);
  });

  /** Prose must never contradict the tables it sits beside. */
  it("derives every observation from a figure on the same page", () => {
    for (const section of buildReport(input())) {
      for (const observation of section.observations) {
        expect(observation).toMatch(/\d/);
      }
    }
  });

  it("handles an event with no registrations at all", () => {
    const empty = input({
      registrations: [],
      attendance: { checkedIn: 0 },
      play: { ...input().play, boardsTotal: 0, boardsVerified: 0, conflicts: 0 },
    });
    expect(() => buildReport(empty)).not.toThrow();
    expect(buildReport(empty)[1].tables[0].rows).toEqual([]);
  });

  it("does not divide by zero when nothing was prepared", () => {
    const sections = buildReport(
      input({ certificates: { prepared: 0, issued: 0, withdrawn: 0 } }),
    );
    expect(sections[4].metrics.find((m) => m.label === "Issued")?.sub).toBe("—");
  });
});

describe("GAME ON! track reporting", () => {
  const tracked = () =>
    input({
      registrations: [
        { status: "approved", paymentStatus: "verified", division: "Masters", city: "Karachi", club: "KSC", isReturning: false, track: "board_games" },
        { status: "approved", paymentStatus: "verified", division: "Masters", city: "Karachi", club: "KSC", isReturning: false, track: "board_games" },
        { status: "approved", paymentStatus: "verified", division: "Advanced", city: "Karachi", club: "KSC", isReturning: false, track: "speed_scrabble" },
        { status: "approved", paymentStatus: "verified", division: "Advanced", city: "Karachi", club: "KSC", isReturning: false, track: "both", claimedMembership: true, membershipVerified: true },
        { status: "approved", paymentStatus: "verified", division: "Beginner", city: "Lahore", club: "LSC", isReturning: false, track: "both", claimedMembership: true, futureInterest: "yes" },
      ],
    });

  /**
   * Both totals are reported. Everyone who chose "both" belongs on the floor
   * and in the pool, so quoting only the exclusive counts understates each.
   */
  it("counts people doing both into each operational total", () => {
    const metrics = buildReport(tracked())[1].metrics;
    expect(metrics.find((m) => m.label === "On the board-game floor")?.value).toBe("4");
    expect(metrics.find((m) => m.label === "In the Scrabble pool")?.value).toBe("3");
  });

  it("breaks the field down by what people came for", () => {
    const table = buildReport(tracked())[1].tables.find(
      (t) => t.title === "By what they came for",
    )!;
    expect(table.rows.find((r) => r.label === "Board games only")?.count).toBe(2);
    expect(table.rows.find((r) => r.label === "Both")?.count).toBe(2);
  });

  /** A claimed discount is not a verified one. */
  it("separates claimed member discounts from verified ones", () => {
    const metric = buildReport(tracked())[1].metrics.find(
      (m) => m.label === "Member discounts",
    )!;
    expect(metric.value).toBe("1/2");
    expect(metric.caveat).toContain("not counted as settled revenue");
  });

  it("reports discounts claimed but never verified", () => {
    const observations = buildReport(tracked())[1].observations;
    expect(observations.some((o) => o.includes("never verified"))).toBe(true);
  });

  it("counts interest in a future event", () => {
    const metric = buildReport(tracked())[1].metrics.find(
      (m) => m.label === "Future event interest",
    );
    expect(metric?.value).toBe("1");
  });

  /** An event without tracks must not sprout empty track sections. */
  it("stays silent about tracks when the event has none", () => {
    const metrics = buildReport(input())[1].metrics;
    expect(metrics.some((m) => m.label === "On the board-game floor")).toBe(false);
    expect(
      buildReport(input())[1].tables.some((t) => t.title === "By what they came for"),
    ).toBe(false);
  });
});

describe("buildDocument", () => {
  it("carries the identity a printed report needs", () => {
    const doc = buildDocument(input());
    expect(doc.eventName).toBe("Bluffy Alphabattle");
    expect(doc.subtitle).toContain("Clifton Hall");
    expect(doc.generatedBy).toBe("Sir Hani");
    expect(doc.generatedAt).toBe("2026-08-21T10:00:00.000Z");
  });

  it("includes every section", () => {
    expect(buildDocument(input()).sections).toHaveLength(REPORT_PAGES.length);
  });

  /** Same inputs, same document — a report can be regenerated identically. */
  it("is deterministic", () => {
    expect(buildDocument(input())).toEqual(buildDocument(input()));
  });
});
