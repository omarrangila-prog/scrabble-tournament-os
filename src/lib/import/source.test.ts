import { describe, expect, it } from "vitest";

import { fingerprint, normalizeSourceUrl, untilNext } from "./source";

describe("normalizeSourceUrl", () => {
  it("turns a Google Sheets editor link into its CSV export", () => {
    expect(normalizeSourceUrl("https://docs.google.com/spreadsheets/d/AbC_123-x/edit#gid=0")).toBe(
      "https://docs.google.com/spreadsheets/d/AbC_123-x/export?format=csv&gid=0",
    );
  });

  it("keeps the tab the link points at", () => {
    expect(normalizeSourceUrl("https://docs.google.com/spreadsheets/d/AbC/edit?gid=987654&usp=sharing")).toBe(
      "https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=987654",
    );
  });

  it("leaves any other address alone", () => {
    expect(normalizeSourceUrl("  https://example.org/r2.html ")).toBe("https://example.org/r2.html");
  });
});

describe("fingerprint", () => {
  it("is the same for the same text and different for different text", () => {
    expect(fingerprint("round 1")).toBe(fingerprint("round 1"));
    expect(fingerprint("round 1")).not.toBe(fingerprint("round 2"));
    expect(fingerprint("")).toBe(fingerprint(""));
  });
});

describe("untilNext", () => {
  it("says nothing for a manual source", () => {
    expect(untilNext(1000, 0, 5000)).toBeNull();
  });

  it("is now when it has never run or is overdue", () => {
    expect(untilNext(null, 30, 0)).toBe("now");
    expect(untilNext(0, 30, 31_000)).toBe("now");
  });

  it("counts down", () => {
    expect(untilNext(0, 30, 10_000)).toBe("in 20s");
    expect(untilNext(0, 300, 0)).toBe("in 5m");
  });
});
