import { describe, expect, it } from "vitest";

import { summarizeAuditDetail } from "./useAuditLog";

describe("summarizeAuditDetail", () => {
  it("diffs a before/after pair of objects down to only the keys that changed", () => {
    const summary = summarizeAuditDetail({
      before: { qrEnabled: false, emailEnabled: true, updatedAt: "2026-08-24T00:00:00Z" },
      after: { qrEnabled: true, emailEnabled: true, updatedAt: "2026-08-25T00:00:00Z" },
    });

    expect(summary).toContain("qrEnabled: false → true");
    expect(summary).toContain("updatedAt:");
    expect(summary).not.toContain("emailEnabled");
  });

  it("shows a simple before/after pair as an arrow", () => {
    expect(summarizeAuditDetail({ before: "check-in-closed", after: "round-published" })).toBe(
      "check-in-closed → round-published",
    );
  });

  it("prints every other key as key: value", () => {
    expect(summarizeAuditDetail({ round: 2, boards: 12 })).toBe("round: 2, boards: 12");
  });

  it("shows an em dash for a null or missing value rather than the word null", () => {
    expect(summarizeAuditDetail({ before: null, after: "round-active" })).toBe("— → round-active");
  });

  it("shows an em dash for a detail with nothing in it", () => {
    expect(summarizeAuditDetail({})).toBe("—");
  });

  it("combines a before/after diff with plain fields on the same entry", () => {
    const summary = summarizeAuditDetail({
      round: 3,
      before: { status: "scheduled" },
      after: { status: "verified" },
    });
    expect(summary).toBe("status: scheduled → verified, round: 3");
  });
});
