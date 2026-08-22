import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CertificateSheet } from "@/components/certificates/CertificateSheet";

/**
 * The name as it is engraved.
 *
 * Capitals on the certificate only. The record keeps the name the person wrote, so the
 * roster, the desk and the board list still read it back the way they typed it — this asserts
 * both halves, because uppercasing at the source would have been the easy wrong fix.
 *
 * Built with `createElement` rather than JSX because the suite collects `*.test.ts`.
 */
const sheet = (recipientName: string) =>
  renderToStaticMarkup(
    createElement(CertificateSheet, {
      recipientName,
      dateLabel: "23 August 2026",
      code: "ABCD-1234-EFGH",
      verifyUrl: "https://example.com/verify/ABCD-1234-EFGH",
      qrDataUri: "",
      placement: "Champion — Recreational",
    }),
  );

describe("the name printed on a certificate", () => {
  it("is set in capitals", () => {
    const html = sheet("Abdul wasay Narinja");
    expect(html).toContain("ABDUL WASAY NARINJA");
    expect(html).not.toContain("Abdul wasay Narinja");
  });

  it("does the same for a name already mostly lower case", () => {
    expect(sheet("sharimkizoja123°")).toContain("SHARIMKIZOJA123°");
  });

  it("steps the size down for a long name, which capitals make wider", () => {
    /*
     * The precondition that makes this mean something: "Rayyan hussain khan lodhi" is over
     * the threshold and "Hania" is well under it, so the two must not come out the same size.
     */
    const long = sheet("Rayyan hussain khan lodhi");
    const short = sheet("Hania");
    expect(long).toContain("4.4cqw");
    expect(short).toContain("5.6cqw");
    expect(long).not.toContain("5.6cqw");
  });
});
