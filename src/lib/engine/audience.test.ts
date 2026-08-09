import { describe, expect, it } from "vitest";
import {
  canSend,
  checkMessage,
  Contact,
  describeAudience,
  exclusionFor,
  matchesFilter,
  MessageDraft,
  personalise,
  resolveAudience,
} from "./audience";

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: "c1",
  fullName: "Hunain Ahmed",
  email: "hunain@example.com",
  mobile: "03001234567",
  eventIds: ["ev-champs"],
  divisions: ["Advanced"],
  city: "Karachi",
  club: "Karachi Scrabble Club",
  marketingConsent: true,
  ...over,
});

const draft = (over: Partial<MessageDraft> = {}): MessageDraft => ({
  subject: "New tournament announced",
  body: "Blufy's AlphaBattle registration is open. Reply STOP to unsubscribe.",
  kind: "promotional",
  channel: "email",
  ...over,
});

describe("matchesFilter", () => {
  it("matches everyone when no rules are set", () => {
    expect(matchesFilter(contact(), {})).toBe(true);
  });

  it("filters by previous event", () => {
    expect(matchesFilter(contact(), { eventIds: ["ev-champs"] })).toBe(true);
    expect(matchesFilter(contact(), { eventIds: ["ev-other"] })).toBe(false);
  });

  it("filters by division", () => {
    expect(matchesFilter(contact(), { divisions: ["Advanced"] })).toBe(true);
    expect(matchesFilter(contact(), { divisions: ["Masters"] })).toBe(false);
  });

  it("filters by city and club", () => {
    expect(matchesFilter(contact(), { cities: ["Karachi"] })).toBe(true);
    expect(matchesFilter(contact(), { cities: ["Lahore"] })).toBe(false);
    expect(matchesFilter(contact(), { clubs: ["Karachi Scrabble Club"] })).toBe(true);
  });

  it("filters to returning participants only", () => {
    expect(matchesFilter(contact({ eventIds: ["a"] }), { returningOnly: true })).toBe(false);
    expect(matchesFilter(contact({ eventIds: ["a", "b"] }), { returningOnly: true })).toBe(true);
  });

  it("combines rules with AND", () => {
    const c = contact();
    expect(matchesFilter(c, { cities: ["Karachi"], divisions: ["Masters"] })).toBe(false);
    expect(matchesFilter(c, { cities: ["Karachi"], divisions: ["Advanced"] })).toBe(true);
  });

  it("takes an explicit contact list over every other rule", () => {
    expect(matchesFilter(contact(), { contactIds: ["c1"], cities: ["Lahore"] })).toBe(true);
    expect(matchesFilter(contact(), { contactIds: ["other"] })).toBe(false);
  });
});

describe("exclusionFor", () => {
  /** The rule that matters most: unsubscribe always wins. */
  it("excludes an unsubscribed person from everything", () => {
    const c = contact({ unsubscribedAt: "2026-01-01", marketingConsent: true });
    expect(exclusionFor(c, "promotional", "email")).toBe("unsubscribed");
    expect(exclusionFor(c, "transactional", "email")).toBe("unsubscribed");
  });

  it("requires opt-in for a promotional message", () => {
    const c = contact({ marketingConsent: false });
    expect(exclusionFor(c, "promotional", "email")).toBe("no-consent");
  });

  /** Withholding someone's own pairing would be worse than useless. */
  it("does not require opt-in for a transactional message", () => {
    const c = contact({ marketingConsent: false });
    expect(exclusionFor(c, "transactional", "email")).toBeNull();
  });

  it("excludes a contact with no address for the channel", () => {
    expect(exclusionFor(contact({ mobile: undefined }), "transactional", "sms")).toBe(
      "no-address",
    );
    expect(exclusionFor(contact({ email: "" }), "transactional", "email")).toBe("no-address");
  });

  it("does not retry a channel that hard-bounced", () => {
    const c = contact({ bouncedChannels: ["email"] });
    expect(exclusionFor(c, "transactional", "email")).toBe("bounced");
    expect(exclusionFor(c, "transactional", "sms")).toBeNull();
  });

  it("allows a consenting contact with a valid address", () => {
    expect(exclusionFor(contact(), "promotional", "email")).toBeNull();
  });
});

describe("resolveAudience", () => {
  const people = [
    contact({ id: "a", marketingConsent: true }),
    contact({ id: "b", marketingConsent: false }),
    contact({ id: "c", unsubscribedAt: "2026-01-01" }),
    contact({ id: "d", email: "", mobile: undefined }),
  ];

  it("reaches only those who may be reached", () => {
    const r = resolveAudience(people, {}, "promotional", "email");
    expect(r.recipients.map((c) => c.id)).toEqual(["a"]);
    expect(r.matched).toBe(4);
  });

  /** The gap between selected and reached must be explainable. */
  it("reports why each person was excluded", () => {
    const r = resolveAudience(people, {}, "promotional", "email");
    expect(r.excludedCounts["no-consent"]).toBe(1);
    expect(r.excludedCounts.unsubscribed).toBe(1);
    expect(r.excludedCounts["no-address"]).toBe(1);
    expect(r.excluded).toHaveLength(3);
  });

  it("reaches more people with a transactional message", () => {
    const r = resolveAudience(people, {}, "transactional", "email");
    expect(r.recipients.map((c) => c.id)).toEqual(["a", "b"]);
  });

  /** Consent is applied after the rules, so no filter can bypass it. */
  it("still excludes an unsubscribed person named explicitly", () => {
    const r = resolveAudience(people, { contactIds: ["c"] }, "transactional", "email");
    expect(r.recipients).toEqual([]);
    expect(r.excludedCounts.unsubscribed).toBe(1);
  });

  it("returns nothing when the filter matches nobody", () => {
    const r = resolveAudience(people, { cities: ["Quetta"] }, "promotional", "email");
    expect(r.matched).toBe(0);
    expect(r.recipients).toEqual([]);
  });
});

describe("describeAudience", () => {
  it("says how many are reached out of how many matched", () => {
    const r = resolveAudience(
      [contact({ id: "a" }), contact({ id: "b", marketingConsent: false })],
      {},
      "promotional",
      "email",
    );
    expect(describeAudience(r)).toContain("1 of 2");
  });

  it("names the reasons people were left out", () => {
    const r = resolveAudience(
      [contact({ id: "b", marketingConsent: false })],
      {},
      "promotional",
      "email",
    );
    expect(describeAudience(r)).toContain("opted in");
  });

  it("says plainly when nobody matches", () => {
    const r = resolveAudience([], {}, "promotional", "email");
    expect(describeAudience(r)).toBe("Nobody matches these filters.");
  });
});

describe("checkMessage", () => {
  it("passes a complete promotional message", () => {
    expect(checkMessage(draft())).toEqual([]);
  });

  it("blocks an empty message", () => {
    expect(checkMessage(draft({ body: "  " }))[0].severity).toBe("blocker");
  });

  it("blocks an email with no subject", () => {
    const problems = checkMessage(draft({ subject: "" }));
    expect(problems.some((p) => p.message.includes("subject"))).toBe(true);
  });

  /** Consent without a way out is not consent. */
  it("blocks a promotional message with no way to opt out", () => {
    const problems = checkMessage(draft({ body: "Register now for the new event." }));
    expect(problems[0].severity).toBe("blocker");
    expect(problems[0].message).toContain("unsubscribe");
  });

  it("does not demand an opt-out line on a transactional message", () => {
    const problems = checkMessage(
      draft({ kind: "transactional", body: "You are on board 4 in round 2." }),
    );
    expect(problems).toEqual([]);
  });

  /**
   * A loose keyword match would pass a message that merely mentions opting
   * out — including one stating there is no way to. The check must require an
   * actual instruction.
   */
  it("does not accept a message that only mentions opting out", () => {
    for (const body of [
      "No opt-out here.",
      "This message has no unsubscribe option available.",
    ]) {
      const problems = checkMessage(draft({ body }));
      expect(problems.some((p) => p.message.includes("unsubscribe"))).toBe(true);
    }
  });

  it("accepts several phrasings of an opt-out", () => {
    for (const phrase of ["Reply STOP to unsubscribe", "To opt out, reply", "stop receiving these"]) {
      expect(checkMessage(draft({ body: `Announcement. ${phrase}.` }))).toEqual([]);
    }
  });

  it("warns when an SMS will split into several messages", () => {
    const long = `${"A".repeat(200)} Reply STOP to unsubscribe.`;
    const problems = checkMessage(draft({ channel: "sms", body: long }));
    expect(problems.some((p) => p.severity === "warning" && p.message.includes("billed"))).toBe(
      true,
    );
  });

  it("blocks a message with an unfilled placeholder", () => {
    const problems = checkMessage(
      draft({ body: "Hello {{name}}, register now. Reply STOP to unsubscribe." }),
    );
    expect(problems.some((p) => p.message.includes("placeholder"))).toBe(true);
  });
});

describe("canSend", () => {
  const audience = (kind: "promotional" | "transactional" = "promotional") =>
    resolveAudience([contact()], {}, kind, "email");

  it("allows a valid message to a real audience", () => {
    const r = canSend(draft(), audience());
    expect(r.ok).toBe(true);
    expect(r.reason).toContain("1 recipient");
  });

  it("refuses when the message has a blocker", () => {
    expect(canSend(draft({ body: "No opt-out here." }), audience()).ok).toBe(false);
  });

  it("refuses when nobody can be messaged", () => {
    const empty = resolveAudience([], {}, "promotional", "email");
    const r = canSend(draft(), empty);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Nobody");
  });
});

describe("personalise", () => {
  it("fills the recipient's own details", () => {
    const body = personalise("Hello [first name] from [city].", contact());
    expect(body).toBe("Hello Hunain from Karachi.");
  });

  it("is case-insensitive about placeholders", () => {
    expect(personalise("Dear [NAME]", contact())).toBe("Dear Hunain Ahmed");
  });

  it("leaves unknown placeholders alone rather than guessing", () => {
    expect(personalise("Your rating is [rating].", contact())).toContain("[rating]");
  });
});
