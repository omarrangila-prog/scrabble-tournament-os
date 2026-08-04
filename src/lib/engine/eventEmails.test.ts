import { describe, expect, it } from "vitest";
import {
  composeEmail,
  EmailKind,
  EMAIL_KIND_LABEL,
  EventDetails,
  queueEmail,
  QueuedEmail,
  RecipientDetails,
  summariseQueue,
} from "./eventEmails";

const EVENT: EventDetails = {
  name: "GAME ON!",
  subtitle: "An Evening of Board Games & Speed Scrabble",
  date: "8 August 2026",
  time: "5:00 PM onwards",
  venue: "Alliance Française de Karachi",
  city: "Clifton, Karachi",
  currency: "PKR",
  collaborators: ["Boardgame Baithak", "Blufy's AlphaBattle", "Alliance Française"],
};

const recipient = (over: Partial<RecipientDetails> = {}): RecipientDetails => ({
  fullName: "Hunain Ahmed",
  email: "hunain@example.com",
  track: "both",
  amountDue: 1080,
  token: "ABCD-EFGH",
  ...over,
});

const ALL: EmailKind[] = [
  "registration-received",
  "payment-verified",
  "payment-correction",
  "registration-approved",
  "event-reminder",
];

describe("composeEmail", () => {
  /**
   * Someone who kept only one of these should still be able to turn up at the
   * right place, so nothing is left to "as previously advised".
   */
  it("states the date, time and venue in every message", () => {
    for (const kind of ALL) {
      const mail = composeEmail(kind, EVENT, recipient(), { reason: "x" });
      if (kind === "payment-correction") continue; // Corrections lead with the problem.
      expect(mail.body).toContain("8 August 2026");
      expect(mail.body).toContain("5:00 PM onwards");
      expect(mail.body).toContain("Alliance Française de Karachi");
    }
  });

  it("names the event in every subject", () => {
    for (const kind of ALL) {
      const mail = composeEmail(kind, EVENT, recipient(), { reason: "x" });
      expect(mail.subject).toContain("GAME ON!");
    }
  });

  it("addresses the recipient by first name", () => {
    expect(composeEmail("registration-received", EVENT, recipient()).body).toContain("Hi Hunain,");
  });

  it("states what the participant is joining", () => {
    const mail = composeEmail("registration-received", EVENT, recipient({ track: "board_games" }));
    expect(mail.body).toContain("Social Board Games");
  });

  it("quotes the amount due", () => {
    expect(composeEmail("registration-received", EVENT, recipient()).body).toContain("PKR 1,080");
  });

  /** A claimed discount is not a settled one, and the email must not imply it is. */
  it("warns that an unverified member discount may not hold", () => {
    const mail = composeEmail(
      "registration-received",
      EVENT,
      recipient({ membershipClaimed: true, membershipVerified: false }),
    );
    expect(mail.body).toContain("will be confirmed");
    expect(mail.body).toContain("standard fee applies");
  });

  it("does not caveat a discount that was verified", () => {
    const mail = composeEmail(
      "registration-received",
      EVENT,
      recipient({ membershipClaimed: true, membershipVerified: true }),
    );
    expect(mail.body).not.toContain("standard fee applies");
  });

  it("says nothing about membership when none was claimed", () => {
    const mail = composeEmail("registration-received", EVENT, recipient());
    expect(mail.body).not.toContain("Alliance Française member discount");
  });

  /** The instruction differs by track, because the evening does. */
  it("tells a Scrabble entrant to arrive early", () => {
    const mail = composeEmail("registration-approved", EVENT, recipient({ track: "speed_scrabble" }));
    expect(mail.body).toContain("early");
    expect(mail.body).toContain("pairing");
  });

  it("tells a board-game attendee to come when it suits them", () => {
    const mail = composeEmail("registration-approved", EVENT, recipient({ track: "board_games" }));
    expect(mail.body).toContain("whenever suits you");
    expect(mail.body).not.toContain("pairing");
  });

  it("carries the reason on a correction so the participant can act", () => {
    const mail = composeEmail("payment-correction", EVENT, recipient(), {
      reason: "The amount shown was PKR 800, not PKR 1,080.",
    });
    expect(mail.body).toContain("PKR 800");
  });

  /** Nobody should think their entry was cancelled over a receipt problem. */
  it("reassures that a correction has not cancelled the registration", () => {
    const mail = composeEmail("payment-correction", EVENT, recipient(), { reason: "x" });
    expect(mail.body).toContain("nothing has been cancelled");
  });

  it("includes the personal link when one is given", () => {
    const mail = composeEmail("registration-received", EVENT, recipient(), {
      link: "https://example.com/r/ABCD-EFGH",
    });
    expect(mail.body).toContain("https://example.com/r/ABCD-EFGH");
  });

  it("reads correctly without a link", () => {
    const mail = composeEmail("registration-received", EVENT, recipient());
    expect(mail.body).not.toContain("undefined");
    expect(mail.body).not.toContain("null");
  });

  it("tells a reminder recipient no app is needed", () => {
    expect(composeEmail("event-reminder", EVENT, recipient()).body).toContain(
      "do not need an app",
    );
  });

  it("labels every kind in plain language", () => {
    for (const kind of ALL) {
      expect(EMAIL_KIND_LABEL[kind]).not.toBe(kind);
      expect(EMAIL_KIND_LABEL[kind].length).toBeGreaterThan(0);
    }
  });
});

describe("queueEmail", () => {
  it("queues a well-formed message", () => {
    const r = queueEmail("registration-received", EVENT, recipient());
    expect(r.ok).toBe(true);
    expect(r.email?.status).toBe("queued");
    expect(r.email?.to).toBe("hunain@example.com");
  });

  it("refuses when there is no address to send to", () => {
    const r = queueEmail("registration-received", EVENT, recipient({ email: "  " }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no email address");
  });

  /**
   * "Your payment failed" with no cause gives a participant nothing to act on.
   * Sending nothing and following up by hand is better.
   */
  it("refuses a correction with no reason", () => {
    const r = queueEmail("payment-correction", EVENT, recipient());
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("reason");
  });

  it("accepts a correction once a reason is given", () => {
    const r = queueEmail("payment-correction", EVENT, recipient(), {
      reason: "Amount short by PKR 280.",
    });
    expect(r.ok).toBe(true);
  });

  it("stamps when it was queued", () => {
    const at = "2026-08-01T09:00:00.000Z";
    expect(queueEmail("event-reminder", EVENT, recipient(), { at }).email?.queuedAt).toBe(at);
  });

  it("gives each message its own id", () => {
    const a = queueEmail("event-reminder", EVENT, recipient()).email!;
    const b = queueEmail("event-reminder", EVENT, recipient()).email!;
    expect(a.id).not.toBe(b.id);
  });
});

describe("summariseQueue", () => {
  const mail = (over: Partial<QueuedEmail>): QueuedEmail => ({
    id: "m1",
    kind: "registration-received",
    to: "a@example.com",
    subject: "s",
    body: "b",
    status: "queued",
    queuedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  });

  it("counts each delivery state", () => {
    const s = summariseQueue([
      mail({ id: "a", status: "queued" }),
      mail({ id: "b", status: "sent" }),
      mail({ id: "c", status: "failed" }),
    ]);
    expect(s).toMatchObject({ queued: 1, sent: 1, failed: 1 });
  });

  it("groups by kind, largest first", () => {
    const s = summariseQueue([
      mail({ id: "a", kind: "event-reminder" }),
      mail({ id: "b", kind: "event-reminder" }),
      mail({ id: "c", kind: "payment-verified" }),
    ]);
    expect(s.byKind[0]).toEqual({ kind: "event-reminder", count: 2 });
  });

  it("handles an empty queue", () => {
    expect(summariseQueue([])).toMatchObject({ queued: 0, sent: 0, failed: 0, byKind: [] });
  });
});
