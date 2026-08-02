import { describe, expect, it } from "vitest";
import {
  canIssue,
  Certificate,
  certificateSummary,
  generateCertificateCode,
  normaliseCode,
  planBulkIssue,
  verificationUrl,
  verifyCertificate,
} from "./certificates";

const cert = (over: Partial<Certificate> = {}): Certificate => ({
  id: "c1",
  eventId: "ev",
  code: "ABCD-EFGH-JKMN",
  kind: "champion",
  recipientId: "p1",
  recipientName: "Ahmad Raza",
  statement: "1st place, Masters division",
  status: "issued",
  issuedAt: "2026-08-20T00:00:00.000Z",
  issuedBy: "Sir Hani",
  ...over,
});

const final = { resultsFinal: true, outstandingDisputes: 0 };

describe("generateCertificateCode", () => {
  it("produces the requested shape", () => {
    const code = generateCertificateCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("excludes characters that are misread on paper", () => {
    const codes = Array.from({ length: 200 }, () => generateCertificateCode()).join("");
    expect(codes).not.toMatch(/[01OIL]/);
  });

  it("does not repeat across many draws", () => {
    const set = new Set(Array.from({ length: 500 }, () => generateCertificateCode()));
    expect(set.size).toBe(500);
  });

  it("honours a custom grouping", () => {
    expect(generateCertificateCode(2, 5)).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });
});

describe("normaliseCode", () => {
  it("accepts lowercase, spaces and missing dashes", () => {
    expect(normaliseCode("abcd efgh jkmn")).toBe("ABCD-EFGH-JKMN");
    expect(normaliseCode("abcdefghjkmn")).toBe("ABCD-EFGH-JKMN");
  });

  it("returns empty for punctuation only", () => {
    expect(normaliseCode("--- ---")).toBe("");
  });
});

describe("verifyCertificate", () => {
  const all = [cert()];

  it("verifies a correct code however it was typed", () => {
    const r = verifyCertificate(all, " abcd efgh jkmn ");
    expect(r.outcome).toBe("valid");
    expect(r.message).toContain("Ahmad Raza");
  });

  it("reports an unknown code without saying why", () => {
    const r = verifyCertificate(all, "ZZZZ-ZZZZ-ZZZZ");
    expect(r.outcome).toBe("unknown");
    expect(r.certificate).toBeUndefined();
  });

  it("asks for input rather than failing on an empty code", () => {
    expect(verifyCertificate(all, "  ").outcome).toBe("unknown");
  });

  it("reports a withdrawn certificate with its reason", () => {
    const r = verifyCertificate(
      [cert({ status: "revoked", revokedReason: "Result corrected after review" })],
      "ABCD-EFGH-JKMN",
    );
    expect(r.outcome).toBe("revoked");
    expect(r.message).toContain("Result corrected");
  });

  it("does not present a draft as valid", () => {
    const r = verifyCertificate([cert({ status: "draft" })], "ABCD-EFGH-JKMN");
    expect(r.outcome).toBe("not-issued");
  });
});

describe("canIssue", () => {
  it("issues a placement certificate once results are final", () => {
    expect(canIssue(cert({ status: "draft" }), final).ready).toBe(true);
  });

  it("refuses a placement certificate while results are provisional", () => {
    const r = canIssue(cert({ status: "draft" }), { resultsFinal: false, outstandingDisputes: 0 });
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("not final");
  });

  it("refuses while a dispute could change the placings", () => {
    const r = canIssue(cert({ status: "draft" }), { resultsFinal: true, outstandingDisputes: 2 });
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("2 unresolved disputes");
  });

  it("allows participation certificates before results are final", () => {
    const r = canIssue(cert({ status: "draft", kind: "participation" }), {
      resultsFinal: false,
      outstandingDisputes: 3,
    });
    expect(r.ready).toBe(true);
  });

  it("never reissues a withdrawn certificate", () => {
    const r = canIssue(cert({ status: "revoked" }), final);
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("withdrawn");
  });

  it("does not issue twice", () => {
    expect(canIssue(cert({ status: "issued" }), final).ready).toBe(false);
  });

  it("refuses a certificate with no recipient", () => {
    expect(canIssue(cert({ status: "draft", recipientName: " " }), final).ready).toBe(false);
  });

  it("refuses a certificate that states nothing", () => {
    expect(canIssue(cert({ status: "draft", statement: "" }), final).ready).toBe(false);
  });
});

describe("planBulkIssue", () => {
  it("separates what will issue from what will not, with reasons", () => {
    const plan = planBulkIssue(
      [
        cert({ id: "a", status: "draft", kind: "participation" }),
        cert({ id: "b", status: "draft", kind: "champion" }),
        cert({ id: "c", status: "issued" }),
      ],
      { resultsFinal: false, outstandingDisputes: 0 },
    );
    expect(plan.issuable.map((c) => c.id)).toEqual(["a"]);
    expect(plan.blocked).toHaveLength(2);
    for (const b of plan.blocked) expect(b.reason.length).toBeGreaterThan(0);
  });

  it("issues nothing from an empty list", () => {
    const plan = planBulkIssue([], final);
    expect(plan.issuable).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
});

describe("certificateSummary", () => {
  it("counts each status", () => {
    const s = certificateSummary([
      cert({ id: "a", status: "issued" }),
      cert({ id: "b", status: "draft" }),
      cert({ id: "c", status: "revoked" }),
    ]);
    expect(s).toMatchObject({ total: 3, issued: 1, draft: 1, revoked: 1 });
  });

  it("groups by kind, largest first", () => {
    const s = certificateSummary([
      cert({ id: "a", kind: "participation" }),
      cert({ id: "b", kind: "participation" }),
      cert({ id: "c", kind: "champion" }),
    ]);
    expect(s.byKind[0]).toEqual({ kind: "participation", count: 2 });
  });
});

describe("verificationUrl", () => {
  it("builds a public URL from a normalised code", () => {
    expect(verificationUrl("https://example.com", "abcd efgh jkmn")).toBe(
      "https://example.com/verify/ABCD-EFGH-JKMN",
    );
  });

  it("does not double the slash", () => {
    expect(verificationUrl("https://example.com/", "ABCDEFGHJKMN")).toBe(
      "https://example.com/verify/ABCD-EFGH-JKMN",
    );
  });
});
