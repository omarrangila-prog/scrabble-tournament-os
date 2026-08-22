import { describe, expect, it } from "vitest";

import type { ConfirmationPlayer } from "./confirmation";
import {
  confirmationEmail,
  groupByContact,
  whatsappMessage,
} from "./confirmationMessages";

const p = (over: Partial<ConfirmationPlayer>): ConfirmationPlayer => ({
  number: "101", name: "Ahmed Khan", age: "15", mobile: "03001234567",
  email: "a@example.com", area: "", division: "beginner", psa: "No", mediaConsent: "",
  amount: 800, paymentStatus: "verified", paymentMethod: "", confirmedAt: null,
  correction: "", isYou: true, ...over,
});

const url = () => "https://example.com/confirm/TOKEN";
const group = (players: ConfirmationPlayer[]) => ({ lead: players[0], players, confirmUrl: url() });

describe("one message per contact, never per person", () => {
  it("puts a family sharing an email into one group", () => {
    const family = [
      p({ number: "161", name: "Omema Shoaib", email: "o@example.com", mobile: "03232402169" }),
      p({ number: "162", name: "Manahil Fatima", email: "o@example.com", mobile: "03232402169" }),
      p({ number: "163", name: "Wania Fatima", email: "o@example.com", mobile: "03232402169" }),
    ];
    const groups = groupByContact(family, url);
    expect(groups).toHaveLength(1);
    expect(groups[0].players).toHaveLength(3);
  });

  it("keeps different families apart", () => {
    const groups = groupByContact(
      [p({ number: "1", email: "a@x.com" }), p({ number: "2", email: "b@x.com" })],
      url,
    );
    expect(groups).toHaveLength(2);
  });

  it("groups on the mobile when there is no email", () => {
    const groups = groupByContact(
      [
        p({ number: "1", email: "", mobile: "03001112222" }),
        p({ number: "2", email: "", mobile: "03001112222" }),
      ],
      url,
    );
    expect(groups).toHaveLength(1);
  });

  it("still gives somebody with no contact details their own group", () => {
    const groups = groupByContact(
      [p({ number: "1", email: "", mobile: "" }), p({ number: "2", email: "", mobile: "" })],
      url,
    );
    expect(groups).toHaveLength(2);
  });
});

describe("what the messages say", () => {
  const family = group([
    p({ number: "161", name: "Omema Shoaib", division: "recreational", amount: 850 }),
    p({ number: "162", name: "Manahil Fatima", amount: 850 }),
    p({ number: "163", name: "Wania Fatima", amount: 850 }),
  ]);

  it("names every player in a family message", () => {
    const text = whatsappMessage(family);
    for (const name of ["Omema Shoaib", "Manahil Fatima", "Wania Fatima"]) {
      expect(text).toContain(name);
    }
    for (const number of ["161", "162", "163"]) expect(text).toContain(number);
  });

  it("never mentions certificates", () => {
    const one = group([p({})]);
    expect(whatsappMessage(one).toLowerCase()).not.toContain("certificate");
    expect(whatsappMessage(family).toLowerCase()).not.toContain("certificate");
    const mail = confirmationEmail(family);
    expect(mail.html.toLowerCase()).not.toContain("certificate");
    expect(mail.text.toLowerCase()).not.toContain("certificate");
    expect(mail.subject.toLowerCase()).not.toContain("certificate");
  });

  it("never tells somebody paying cash that they have paid", () => {
    const owing = group([p({ paymentStatus: "cash-at-venue", amount: 1250 })]);
    const text = whatsappMessage(owing);
    expect(text).toContain("Cash at Venue");
    expect(text).toContain("Amount Due");
    expect(text).not.toMatch(/Paid and Verified/);
  });

  it("says an unknown amount is unconfirmed rather than free", () => {
    const unknown = group([p({ paymentStatus: "review-required", amount: null })]);
    expect(whatsappMessage(unknown)).toContain("To Be Confirmed");
    expect(confirmationEmail(unknown).text).toContain("To Be Confirmed");
  });

  it("carries the confirmation link and the event details", () => {
    const mail = confirmationEmail(family);
    expect(mail.html).toContain("https://example.com/confirm/TOKEN");
    expect(mail.text).toContain("Sunday, 23 August 2026");
    expect(mail.text).toContain("Chai Chatt, Karachi");
  });

  it("names the person in the subject when there is only one", () => {
    expect(confirmationEmail(group([p({ name: "Ahmed Khan" })])).subject)
      .toContain("Ahmed Khan");
  });

  it("escapes a name that would otherwise break the page", () => {
    const nasty = group([p({ name: '<script>alert("x")</script>' })]);
    const mail = confirmationEmail(nasty);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
