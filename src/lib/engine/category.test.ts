import { describe, expect, it } from "vitest";
import { CATEGORY_RULES, CategoryEvidence, evaluatePlayer } from "./category";
import {
  ageOn,
  categoryEligibility,
  formatPlayerId,
  nextCategoryDown,
  nextCategoryUp,
  qrPayload,
} from "../domain/identity";

const NOW = new Date("2026-08-01T00:00:00Z");

function evidence(over: Partial<CategoryEvidence> = {}): CategoryEvidence {
  return {
    playerId: "PK-500",
    playerName: "Test Player",
    category: "recreational",
    dateOfBirth: "1996-04-10",
    eventsPlayed: 6,
    eventsInactive: 0,
    gamesPlayed: 40,
    winRate: 50,
    averageSpread: 0,
    averageScore: 400,
    rating: 1500,
    opponentStrength: 1480,
    topQuarterFinishes: 1,
    consistency: 8,
    ...over,
  };
}

describe("category ordering", () => {
  it("moves up and down through the four official categories", () => {
    expect(nextCategoryUp("novice")).toBe("recreational");
    expect(nextCategoryUp("recreational")).toBe("advanced");
    expect(nextCategoryUp("advanced")).toBe("masters");
    expect(nextCategoryUp("masters")).toBeNull();

    expect(nextCategoryDown("masters")).toBe("advanced");
    expect(nextCategoryDown("advanced")).toBe("recreational");
    expect(nextCategoryDown("recreational")).toBe("novice");
    expect(nextCategoryDown("novice")).toBeNull();
  });
});

describe("novice eligibility", () => {
  it("accepts a beginner inside the age range", () => {
    expect(categoryEligibility("novice", "2012-05-01", NOW).eligible).toBe(true);
  });

  it("rejects an adult but allows an administrator override", () => {
    const result = categoryEligibility("novice", "1990-01-01", NOW);
    expect(result.eligible).toBe(false);
    expect(result.overridable).toBe(true);
    expect(result.reason).toContain("beginners");
  });

  it("rejects a child below the minimum age", () => {
    expect(categoryEligibility("novice", "2023-01-01", NOW).eligible).toBe(false);
  });

  it("places no age restriction on the other categories", () => {
    for (const c of ["recreational", "advanced", "masters"] as const) {
      expect(categoryEligibility(c, "1980-01-01", NOW).eligible).toBe(true);
    }
  });

  it("computes age correctly either side of a birthday", () => {
    expect(ageOn("2000-08-01", NOW)).toBe(26);
    expect(ageOn("2000-08-02", NOW)).toBe(25);
  });
});

describe("promotion recommendations", () => {
  it("recommends promotion for sustained strong performance", () => {
    const rec = evaluatePlayer(
      evidence({ winRate: 78, averageSpread: 62, eventsPlayed: 6, topQuarterFinishes: 3 }),
      NOW,
    );
    expect(rec).not.toBeNull();
    expect(rec!.kind).toBe("promotion");
    expect(rec!.current).toBe("recreational");
    expect(rec!.proposed).toBe("advanced");
    expect(rec!.rationale).toContain("78%");
    expect(rec!.confidence).toBeGreaterThan(60);
  });

  it("does not promote on a short record, however strong", () => {
    const rec = evaluatePlayer(
      evidence({ winRate: 90, averageSpread: 120, eventsPlayed: CATEGORY_RULES.promotion.minEvents - 1 }),
      NOW,
    );
    expect(rec).toBeNull();
  });

  it("never promotes beyond Masters", () => {
    const rec = evaluatePlayer(
      evidence({ category: "masters", winRate: 92, averageSpread: 140, eventsPlayed: 9 }),
      NOW,
    );
    expect(rec).toBeNull();
  });
});

describe("demotion recommendations", () => {
  it("recommends demotion after sustained poor results", () => {
    const rec = evaluatePlayer(
      evidence({ category: "advanced", winRate: 22, averageSpread: -85, eventsPlayed: 6 }),
      NOW,
    );
    expect(rec).not.toBeNull();
    expect(rec!.kind).toBe("demotion");
    expect(rec!.proposed).toBe("recreational");
  });

  it("blocks demotion into Novice for an adult and explains why", () => {
    const rec = evaluatePlayer(
      evidence({
        category: "recreational",
        dateOfBirth: "1988-03-02",
        winRate: 18,
        averageSpread: -95,
        eventsPlayed: 7,
      }),
      NOW,
    );
    expect(rec).not.toBeNull();
    expect(rec!.blockedBy).toBeDefined();
    expect(rec!.rationale).toContain("reserved for beginners");
    expect(rec!.confidence).toBeLessThan(50);
  });

  it("allows demotion into Novice when the age rule is met", () => {
    const rec = evaluatePlayer(
      evidence({
        category: "recreational",
        dateOfBirth: "2013-06-15",
        winRate: 15,
        averageSpread: -90,
        eventsPlayed: 6,
      }),
      NOW,
    );
    expect(rec).not.toBeNull();
    expect(rec!.proposed).toBe("novice");
    expect(rec!.blockedBy).toBeUndefined();
  });

  it("leaves a mid-table player alone", () => {
    expect(evaluatePlayer(evidence({ winRate: 52, averageSpread: 5 }), NOW)).toBeNull();
  });
});

describe("inactivity recommendations", () => {
  it("recommends demoting an inactive Masters player", () => {
    const rec = evaluatePlayer(
      evidence({ category: "masters", eventsInactive: CATEGORY_RULES.inactivity.masters, winRate: 55 }),
      NOW,
    );
    expect(rec).not.toBeNull();
    expect(rec!.kind).toBe("demotion");
    expect(rec!.proposed).toBe("advanced");
    expect(rec!.rationale).toContain("inactive");
  });

  it("recommends demoting an inactive Advanced player", () => {
    const rec = evaluatePlayer(
      evidence({ category: "advanced", eventsInactive: CATEGORY_RULES.inactivity.advanced, winRate: 55 }),
      NOW,
    );
    expect(rec!.proposed).toBe("recreational");
  });

  it("never demotes a Recreational player into Novice for inactivity alone", () => {
    const rec = evaluatePlayer(
      evidence({ category: "recreational", eventsInactive: 40, winRate: 52, averageSpread: 4 }),
      NOW,
    );
    // Inactivity rules do not apply below Advanced, and results are unremarkable.
    expect(rec).toBeNull();
  });

  it("does not fire below the inactivity threshold", () => {
    const rec = evaluatePlayer(
      evidence({ category: "masters", eventsInactive: CATEGORY_RULES.inactivity.masters - 1, winRate: 52 }),
      NOW,
    );
    expect(rec).toBeNull();
  });
});

describe("identity helpers", () => {
  it("formats a permanent player id", () => {
    expect(formatPlayerId(3)).toBe("PK-003");
    expect(formatPlayerId(129)).toBe("PK-129");
    expect(formatPlayerId(1400)).toBe("PK-1400");
  });

  it("encodes a stable QR payload", () => {
    expect(qrPayload("PK-003")).toBe("TOS:PLAYER:PK-003");
  });
});
