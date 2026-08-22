import { describe, expect, it } from "vitest";

import { cardRows, type ConfirmationPlayer, moneyLines, prettyMobile } from "./confirmation";

const player = (over: Partial<ConfirmationPlayer> = {}): ConfirmationPlayer => ({
  number: "101",
  name: "Ahmed Khan",
  age: "15",
  mobile: "03001234567",
  email: "a@example.com",
  area: "Karachi",
  division: "beginner",
  psa: "No",
  mediaConsent: "Yes",
  amount: 800,
  paymentStatus: "verified",
  paymentMethod: "Online",
  confirmedAt: null,
  correction: "",
  isYou: true,
  ...over,
});

describe("what the money says to a participant", () => {
  it("calls a verified payment paid", () => {
    const m = moneyLines({ amount: 800, paymentStatus: "verified" });
    expect(m.value).toBe("Paid and Verified");
    expect(m.amountLabel).toBe("Amount Paid");
    expect(m.amountValue).toBe("PKR 800");
  });

  it("never calls cash at the venue paid", () => {
    const m = moneyLines({ amount: 1250, paymentStatus: "cash-at-venue" });
    expect(m.value).toBe("Cash at Venue");
    expect(m.amountLabel).toBe("Amount Due");
    expect(m.value.toLowerCase()).not.toContain("paid");
  });

  it("never calls a payment under review paid", () => {
    const m = moneyLines({ amount: 1000, paymentStatus: "review-required" });
    expect(m.value).toBe("Under Review");
    expect(m.amountLabel).toBe("Amount Recorded");
  });

  /**
   * The one that would cost real money. Ten entrants have no amount at all, and several of
   * those sit under review — telling them the entry is free is a promise the desk then has
   * to break in front of them.
   */
  it("says an unknown amount is unknown, never free", () => {
    for (const status of ["review-required", "cash-at-venue", "not-submitted"]) {
      const m = moneyLines({ amount: null, paymentStatus: status });
      expect(m.amountValue, status).toBe("To Be Confirmed");
      expect(m.amountValue, status).not.toContain("0");
    }
  });

  it("treats a zero under review as unknown, not as a free pass", () => {
    const m = moneyLines({ amount: 0, paymentStatus: "review-required" });
    expect(m.amountValue).toBe("To Be Confirmed");
    expect(m.value).toBe("Under Review");
  });

  it("calls a complimentary entry what it is", () => {
    const m = moneyLines({ amount: 0, paymentStatus: "complimentary" });
    expect(m.value).toBe("Complimentary Pass");
    expect(m.amountValue).toBe("PKR 0");
  });
});

describe("the card", () => {
  it("leaves out a row it has no value for rather than showing it blank", () => {
    const rows = cardRows(player({ age: "", psa: "", mediaConsent: "", area: "" }));
    const labels = rows.map((r) => r.label);

    expect(labels).not.toContain("Age");
    expect(labels).not.toContain("PSA Player");
    expect(labels).not.toContain("Media Consent");
    expect(labels).not.toContain("Area");
    expect(rows.every((r) => r.value !== "")).toBe(true);
  });

  it("always carries the number, the name and the money", () => {
    const rows = cardRows(player({ age: "", psa: "" }));
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Player Number");
    expect(labels).toContain("Name");
    expect(labels).toContain("Payment Status");
    expect(labels).toContain("Amount Paid");
  });

  it("says nothing at all about certificates", () => {
    const text = cardRows(player()).map((r) => `${r.label} ${r.value}`).join(" ").toLowerCase();
    expect(text).not.toContain("certificate");
  });

  it("never prints the same label twice", () => {
    /*
     * A cash entry's money line is itself labelled "Payment Method", so the separate method
     * row would repeat it — a card that says "Payment Method" twice reads as a mistake even
     * when both lines are true.
     */
    for (const paymentStatus of ["verified", "cash-at-venue", "review-required", "complimentary"]) {
      const rows = cardRows(player({ paymentStatus, paymentMethod: "Cash at Venue" }));
      const labels = rows.map((r) => r.label);
      expect(new Set(labels).size, paymentStatus).toBe(labels.length);
    }
  });
});

describe("a mobile number as people read it", () => {
  it("groups a Pakistani mobile", () => {
    expect(prettyMobile("03001234567")).toBe("0300 1234567");
  });

  it("leaves anything unexpected alone rather than mangling it", () => {
    expect(prettyMobile("+92 300 1234567")).toBe("+92 300 1234567");
  });
});
