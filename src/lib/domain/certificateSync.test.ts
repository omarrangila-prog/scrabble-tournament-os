import { describe, expect, it } from "vitest";

import { normaliseCode, unverifiableCertificates } from "./certificateSync";

const cert = (code: string, status = "issued") => ({ code, status });

describe("unverifiableCertificates", () => {
  it("reports an issued certificate the database has never seen", () => {
    const local = [cert("AAAA-BBBB-CCCC")];
    // The precondition: the database confirms nothing at all.
    expect(unverifiableCertificates(local, new Set()).map((c) => c.code)).toEqual([
      "AAAA-BBBB-CCCC",
    ]);
  });

  it("reports nothing once the database confirms the code", () => {
    const local = [cert("AAAA-BBBB-CCCC")];
    expect(unverifiableCertificates(local, new Set(["AAAA-BBBB-CCCC"]))).toEqual([]);
  });

  it("ignores drafts and withdrawals, which make no claim to be verifiable", () => {
    const local = [cert("D-1", "draft"), cert("R-1", "revoked")];
    // Both are absent from the database, so a status-blind check would flag them.
    expect(unverifiableCertificates(local, new Set())).toEqual([]);
  });

  it("does not call a working certificate broken over case or spacing", () => {
    const local = [cert(" aaaa-bbbb-cccc ")];
    /*
     * The verification lookup trims and upper-cases before matching, so this code does
     * resolve. Reporting it as broken would send the director to re-issue a certificate
     * that was never wrong, rewriting a record somebody already holds.
     */
    expect(unverifiableCertificates(local, new Set(["AAAA-BBBB-CCCC"]))).toEqual([]);
  });

  it("separates the broken from the sound in a mixed set", () => {
    const local = [
      cert("GOOD-0001-AAAA"),
      cert("BAD-0002-BBBB"),
      cert("GOOD-0003-CCCC"),
      cert("DRAFT-0004", "draft"),
    ];
    const confirmed = new Set(["GOOD-0001-AAAA", "GOOD-0003-CCCC"]);
    expect(unverifiableCertificates(local, confirmed).map((c) => c.code)).toEqual([
      "BAD-0002-BBBB",
    ]);
  });
});

describe("normaliseCode", () => {
  it("matches how a typed or scanned code is compared", () => {
    expect(normaliseCode("  ab12-cd34-ef56 ")).toBe("AB12-CD34-EF56");
  });
});
