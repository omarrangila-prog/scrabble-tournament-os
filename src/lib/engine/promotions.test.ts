import { describe, expect, it } from "vitest";
import {
  applyCampaign,
  Campaign,
  campaignPerformance,
  checkEligibility,
  findByCode,
  GameRecord,
  isAwarded,
  Reward,
  rewardSummary,
  suggestRewards,
} from "./promotions";

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: "c1",
  eventId: "ev",
  name: "Early bird",
  kind: "early-bird",
  status: "active",
  percentOff: 20,
  amountOff: 0,
  code: "EARLY20",
  cap: 0,
  redemptions: 0,
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: "2026-08-31T00:00:00.000Z",
  ...over,
});

const at = "2026-08-10T00:00:00.000Z";

describe("checkEligibility", () => {
  it("accepts an active code inside its window", () => {
    expect(checkEligibility(campaign(), { at }).eligible).toBe(true);
  });

  it("refuses a paused campaign and says so", () => {
    const r = checkEligibility(campaign({ status: "paused" }), { at });
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("paused");
  });

  it("refuses before the start date", () => {
    const r = checkEligibility(campaign(), { at: "2026-07-01T00:00:00.000Z" });
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("not active yet");
  });

  it("refuses after the end date", () => {
    const r = checkEligibility(campaign(), { at: "2026-09-15T00:00:00.000Z" });
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("expired");
  });

  it("refuses once the cap is reached", () => {
    const r = checkEligibility(campaign({ cap: 10, redemptions: 10 }), { at });
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("limit");
  });

  it("allows an uncapped campaign to keep redeeming", () => {
    expect(checkEligibility(campaign({ cap: 0, redemptions: 999 }), { at }).eligible).toBe(true);
  });

  it("enforces the minimum group size", () => {
    const c = campaign({ kind: "group", minGroupSize: 4 });
    expect(checkEligibility(c, { at, groupSize: 3 }).eligible).toBe(false);
    expect(checkEligibility(c, { at, groupSize: 4 }).eligible).toBe(true);
  });

  it("treats a missing group size as a single entry", () => {
    const r = checkEligibility(campaign({ minGroupSize: 2 }), { at });
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("at least 2");
  });

  it("refuses rather than throwing on an invalid date range", () => {
    const r = checkEligibility(campaign({ endsAt: "not-a-date" }), { at });
    expect(r.eligible).toBe(false);
  });

  it("always gives a reason, even on success", () => {
    expect(checkEligibility(campaign(), { at }).reason.length).toBeGreaterThan(0);
  });
});

describe("findByCode", () => {
  const all = [campaign({ code: "EARLY20" }), campaign({ id: "c2", code: "school-25" })];

  it("matches regardless of case and padding", () => {
    expect(findByCode(all, "  early20 ")?.id).toBe("c1");
    expect(findByCode(all, "SCHOOL-25")?.id).toBe("c2");
  });

  it("returns nothing for an empty or unknown code", () => {
    expect(findByCode(all, "   ")).toBeUndefined();
    expect(findByCode(all, "NOPE")).toBeUndefined();
  });
});

describe("applyCampaign", () => {
  it("takes the percentage then the fixed amount", () => {
    const f = applyCampaign(1000, campaign({ percentOff: 20, amountOff: 100 }));
    expect(f.discount).toBe(300);
    expect(f.payable).toBe(700);
  });

  it("never makes the payable amount negative", () => {
    const f = applyCampaign(500, campaign({ percentOff: 100, amountOff: 5000 }));
    expect(f.payable).toBe(0);
    expect(f.discount).toBe(500);
  });

  it("passes the fee through with no campaign", () => {
    const f = applyCampaign(1200, undefined);
    expect(f.payable).toBe(1200);
    expect(f.discount).toBe(0);
  });

  it("clamps a percentage above 100", () => {
    expect(applyCampaign(1000, campaign({ percentOff: 250 })).payable).toBe(0);
  });

  it("ignores a negative fixed amount rather than adding to the fee", () => {
    const f = applyCampaign(1000, campaign({ percentOff: 0, amountOff: -400 }));
    expect(f.payable).toBe(1000);
  });

  it("explains the arithmetic", () => {
    const f = applyCampaign(1000, campaign({ percentOff: 20, amountOff: 100 }));
    expect(f.explanation).toContain("20% off");
    expect(f.explanation).toContain("100 off");
  });
});

describe("campaignPerformance", () => {
  it("separates revenue given up from revenue kept", () => {
    const p = campaignPerformance(campaign({ cap: 10 }), [
      { discountAmount: 200, amountPaid: 800 },
      { discountAmount: 200, amountPaid: 800 },
    ]);
    expect(p.revenueForgone).toBe(400);
    expect(p.revenueKept).toBe(1600);
    expect(p.averageDiscount).toBe(200);
    expect(p.capUsed).toBe(20);
  });

  it("reports zero cap usage when uncapped", () => {
    const p = campaignPerformance(campaign({ cap: 0 }), [{ discountAmount: 1, amountPaid: 1 }]);
    expect(p.capUsed).toBe(0);
  });

  it("handles a campaign nobody used", () => {
    const p = campaignPerformance(campaign(), []);
    expect(p.averageDiscount).toBe(0);
    expect(p.redemptions).toBe(0);
  });
});

describe("rewards", () => {
  const reward = (over: Partial<Reward> = {}): Reward => ({
    id: "r1",
    eventId: "ev",
    kind: "highest-word",
    title: "Highest word",
    citation: "QUIXOTRY, 365 points",
    recipientId: "p1",
    recipientName: "Player One",
    prizeValue: 5000,
    awardedBy: "Sir Hani",
    awardedAt: at,
    ...over,
  });

  it("is not awarded without a recipient", () => {
    expect(isAwarded(reward({ recipientId: undefined }))).toBe(false);
  });

  it("is not awarded without a citation", () => {
    expect(isAwarded(reward({ citation: "  " }))).toBe(false);
  });

  it("is not awarded without an author", () => {
    expect(isAwarded(reward({ awardedBy: undefined }))).toBe(false);
  });

  it("counts prize value only for completed awards", () => {
    const s = rewardSummary([reward(), reward({ id: "r2", recipientId: undefined })]);
    expect(s.awarded).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.prizeValue).toBe(5000);
  });

  it("flags judged awards still needing a decision", () => {
    const s = rewardSummary([
      reward({ id: "r3", kind: "sporting-conduct", recipientId: undefined }),
      reward({ id: "r4", kind: "most-improved", recipientId: undefined }),
    ]);
    expect(s.needingDecision).toBe(1);
  });
});

describe("suggestRewards", () => {
  const game = (over: Partial<GameRecord> = {}): GameRecord => ({
    playerId: "p1",
    playerName: "Player One",
    round: 1,
    board: 1,
    score: 400,
    opponentScore: 380,
    ...over,
  });

  it("picks the highest recorded word", () => {
    const s = suggestRewards([
      game({ bestWord: { word: "quartz", points: 90 } }),
      game({ playerId: "p2", playerName: "Player Two", bestWord: { word: "jukebox", points: 140 } }),
    ]);
    const word = s.find((x) => x.kind === "highest-word");
    expect(word?.recipientId).toBe("p2");
    expect(word?.citation).toContain("JUKEBOX");
  });

  it("suggests nothing for highest word when no words were recorded", () => {
    const s = suggestRewards([game(), game()]);
    expect(s.find((x) => x.kind === "highest-word")).toBeUndefined();
  });

  it("picks the largest rating gap overcome", () => {
    const s = suggestRewards([
      game({ playerId: "p1", rating: 1400, opponentRating: 1500, score: 400, opponentScore: 300 }),
      game({
        playerId: "p2",
        playerName: "Player Two",
        rating: 1200,
        opponentRating: 1700,
        score: 420,
        opponentScore: 410,
      }),
    ]);
    const upset = s.find((x) => x.kind === "biggest-upset");
    expect(upset?.recipientId).toBe("p2");
    expect(upset?.citation).toContain("500");
  });

  it("does not call a loss an upset", () => {
    const s = suggestRewards([
      game({ rating: 1200, opponentRating: 1900, score: 300, opponentScore: 500 }),
    ]);
    expect(s.find((x) => x.kind === "biggest-upset")).toBeUndefined();
  });

  it("does not treat beating a lower-rated player as an upset", () => {
    const s = suggestRewards([
      game({ rating: 1900, opponentRating: 1200, score: 500, opponentScore: 300 }),
    ]);
    expect(s.find((x) => x.kind === "biggest-upset")).toBeUndefined();
  });

  it("skips games with no ratings rather than guessing", () => {
    const s = suggestRewards([game({ score: 500, opponentScore: 100 })]);
    expect(s.find((x) => x.kind === "biggest-upset")).toBeUndefined();
  });

  it("returns nothing for no games", () => {
    expect(suggestRewards([])).toEqual([]);
  });

  it("always states the basis so the director can override", () => {
    const s = suggestRewards([
      game({ rating: 1200, opponentRating: 1500, bestWord: { word: "zephyr", points: 80 } }),
    ]);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) expect(x.basis.length).toBeGreaterThan(0);
  });
});
