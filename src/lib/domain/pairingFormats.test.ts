import { describe, expect, it } from "vitest";
import {
  COMMON_FORMATS,
  formatInfo,
  formatWarnings,
  OTHER_FORMATS,
  PAIRING_FORMATS,
  recommendFormat,
  roundsForRoundRobin,
} from "./pairingFormats";
import { PairingSystem } from "./types";

const ALL: PairingSystem[] = ["swiss", "round-robin", "knockout", "king-of-the-hill", "manual"];

describe("format catalogue", () => {
  it("describes every pairing system", () => {
    for (const system of ALL) {
      const info = formatInfo(system);
      expect(info.id).toBe(system);
      expect(info.summary.length).toBeGreaterThan(0);
      expect(info.detail.length).toBeGreaterThan(0);
    }
  });

  it("leads with Swiss, the format most events want", () => {
    expect(COMMON_FORMATS[0].id).toBe("swiss");
  });

  it("keeps the common list short enough to scan", () => {
    expect(COMMON_FORMATS.length).toBeLessThanOrEqual(4);
  });

  it("hides knockout behind the secondary list", () => {
    expect(OTHER_FORMATS.map((f) => f.id)).toContain("knockout");
  });

  it("splits every format into exactly one of the two lists", () => {
    expect(COMMON_FORMATS.length + OTHER_FORMATS.length).toBe(PAIRING_FORMATS.length);
  });

  it("falls back to Swiss rather than crashing on an unknown system", () => {
    expect(formatInfo("nonsense" as PairingSystem).id).toBe("swiss");
  });
});

describe("roundsForRoundRobin", () => {
  it("needs one round fewer than players when the count is even", () => {
    expect(roundsForRoundRobin(8)).toBe(7);
    expect(roundsForRoundRobin(2)).toBe(1);
  });

  /** With an odd field someone sits out each round, so it takes a round more. */
  it("needs a full round per player when the count is odd", () => {
    expect(roundsForRoundRobin(7)).toBe(7);
    expect(roundsForRoundRobin(9)).toBe(9);
  });

  it("needs no rounds for fewer than two players", () => {
    expect(roundsForRoundRobin(1)).toBe(0);
    expect(roundsForRoundRobin(0)).toBe(0);
  });
});

describe("recommendFormat", () => {
  it("recommends Swiss for a large field", () => {
    const r = recommendFormat(128, 9);
    expect(r.system).toBe("swiss");
    expect(r.reason).toContain("128");
  });

  it("recommends a round robin for a small field with enough rounds", () => {
    const r = recommendFormat(8, 7);
    expect(r.system).toBe("round-robin");
    expect(r.reason).toContain("everyone");
  });

  /** A round robin that cannot finish is worse than no round robin. */
  it("falls back to Swiss when a small field lacks the rounds", () => {
    const r = recommendFormat(8, 4);
    expect(r.system).toBe("swiss");
    expect(r.reason).toContain("7 rounds");
  });

  it("always recommends something, even before entries are known", () => {
    const r = recommendFormat(0, 6);
    expect(r.system).toBe("swiss");
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("explains the recommendation with the event's own numbers", () => {
    expect(recommendFormat(64, 6).reason).toContain("6-round");
  });
});

describe("formatWarnings", () => {
  it("says nothing about Swiss at a sensible length", () => {
    expect(formatWarnings("swiss", 64, 6)).toEqual([]);
  });

  it("notes when Swiss has too few rounds to separate the field", () => {
    const w = formatWarnings("swiss", 128, 3);
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe("note");
    expect(w[0].message).toContain("7");
  });

  it("warns that a round robin cannot fit a large field", () => {
    const w = formatWarnings("round-robin", 60, 9);
    expect(w[0].severity).toBe("warning");
    expect(w[0].message).toContain("Swiss");
  });

  it("warns when a round robin has too few rounds to complete", () => {
    const w = formatWarnings("round-robin", 8, 4);
    expect(w[0].severity).toBe("warning");
    expect(w[0].message).toContain("7");
  });

  it("notes when rounds exceed what a round robin needs", () => {
    const w = formatWarnings("round-robin", 8, 9);
    expect(w[0].severity).toBe("note");
    expect(w[0].message).toContain("repeat");
  });

  it("stays silent on an exactly-sized round robin", () => {
    expect(formatWarnings("round-robin", 8, 7)).toEqual([]);
  });

  /** The consequence a director must see before the day, not during it. */
  it("warns that knockout eliminates most of the field", () => {
    const w = formatWarnings("knockout", 64, 3);
    expect(w[0].severity).toBe("warning");
    expect(w[0].message).toContain("eliminated");
  });

  it("notes that King of the Hill suits a decider more than a tournament", () => {
    expect(formatWarnings("king-of-the-hill", 32, 6)[0].severity).toBe("note");
  });

  it("does not complain about King of the Hill as a short decider", () => {
    expect(formatWarnings("king-of-the-hill", 32, 1)).toEqual([]);
  });

  it("reminds a director that manual pairing takes time", () => {
    const w = formatWarnings("manual", 32, 6);
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("by hand");
  });

  it("never blocks a choice, only warns about it", () => {
    for (const system of ALL) {
      for (const w of formatWarnings(system, 60, 3)) {
        expect(["warning", "note"]).toContain(w.severity);
      }
    }
  });

  it("handles an event with no entries yet", () => {
    for (const system of ALL) {
      expect(() => formatWarnings(system, 0, 6)).not.toThrow();
    }
  });
});
