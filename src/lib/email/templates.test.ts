import { describe, expect, it } from "vitest";

import { certificateEmail, registrationEmail } from "./templates";

const REGISTRATION = {
  fullName: "Ahmed Khan",
  eventName: "Blufy's AlphaBattle",
  eventDate: "Sunday 23 August 2026",
  venue: "Chai Chatt, Habitt City, Karachi",
  checkInCode: "482913",
  checkInUrl: "https://example.com/events/alphabattle-23-august/check-in?t=ABC123",
  amount: "PKR 1,250",
};

describe("registrationEmail", () => {
  it("puts the check-in code in the subject", () => {
    // A code somebody must open the email to find is a code they hunt for at the door.
    expect(registrationEmail(REGISTRATION).subject).toContain("482913");
  });

  it("carries the code in the plain text as well as the HTML", () => {
    const { html, text } = registrationEmail(REGISTRATION);

    /*
     * Some clients show the text part instead of the HTML. A participant whose code
     * exists only in a block they cannot see has received nothing.
     */
    expect(html).toContain("482913");
    expect(text).toContain("482913");
  });

  it("states the date, venue and amount in both formats", () => {
    const { html, text } = registrationEmail(REGISTRATION);

    for (const body of [html, text]) {
      expect(body).toContain("23 August 2026");
      expect(body).toContain("Chai Chatt");
      expect(body).toContain("PKR 1,250");
    }
  });

  it("links to check-in", () => {
    expect(registrationEmail(REGISTRATION).text).toContain(REGISTRATION.checkInUrl);
  });

  it("escapes a name so it cannot inject markup", () => {
    const { html } = registrationEmail({
      ...REGISTRATION,
      fullName: '<img src=x onerror="alert(1)">',
    });

    // Names come from a public form, so they are content and never markup.
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

const CERTIFICATE = {
  recipientName: "Nida Fatima",
  eventName: "Blufy's AlphaBattle",
  eventDate: "Sunday 23 August 2026",
  statement: "1st place, Advanced",
  detail: "4 wins from 5, spread +312",
  verifyUrl: "https://example.com/verify/AB-7Q2M",
  code: "AB-7Q2M",
};

describe("certificateEmail", () => {
  it("names the event and the day it was won", () => {
    const { html, text } = certificateEmail(CERTIFICATE);

    for (const body of [html, text]) {
      expect(body).toContain("Blufy");
      expect(body).toContain("23 August 2026");
    }
  });

  it("carries the verification link and code", () => {
    const { html, text } = certificateEmail(CERTIFICATE);

    // The link is what makes a forwarded certificate checkable.
    expect(html).toContain(CERTIFICATE.verifyUrl);
    expect(text).toContain(CERTIFICATE.verifyUrl);
    expect(text).toContain("AB-7Q2M");
  });

  it("states the achievement rather than inventing praise", () => {
    expect(certificateEmail(CERTIFICATE).text).toContain("1st place, Advanced");
  });

  it("omits the detail line when there is none", () => {
    const { text } = certificateEmail({ ...CERTIFICATE, detail: undefined });
    expect(text).not.toContain("undefined");
  });

  it("escapes the recipient's name", () => {
    const { html } = certificateEmail({ ...CERTIFICATE, recipientName: "<script>x</script>" });
    expect(html).not.toContain("<script>");
  });
});

describe("the name on a certificate", () => {
  /**
   * Capitals on the certificate, as engraved — and only there. The record keeps the name the
   * person wrote, so the roster, the desk and the board list still read it back to them the
   * way they typed it.
   */
  const mail = certificateEmail({
    recipientName: "Abdul wasay Narinja",
    statement: "Champion — Recreational",
    detail: "Played 5, won 4, lost 1. Spread +142.",
    code: "ABCD-1234-EFGH",
    eventName: "Blufy's AlphaBattle",
    eventDate: "23 August 2026",
    verifyUrl: "https://example.com/verify/ABCD-1234-EFGH",
  });

  it("shouts inside the certificate block", () => {
    expect(mail.html).toContain("ABDUL WASAY NARINJA");
  });

  it("greets them the way they wrote their own name", () => {
    expect(mail.html).toContain("Congratulations, Abdul wasay Narinja.");
    expect(mail.text).toContain("Congratulations, Abdul wasay Narinja.");
  });

  it("puts what they won in the subject rather than the word certificate", () => {
    expect(mail.subject).toBe("Champion — Recreational · Blufy's AlphaBattle");
  });
});
