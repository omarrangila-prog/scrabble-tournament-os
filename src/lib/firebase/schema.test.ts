import { describe, expect, it } from "vitest";
import {
  COLLECTIONS,
  InterestAnswer,
  isInterested,
  membershipConfirmed,
  MembershipStatus,
  MEMBERSHIP_STATUS_LABEL,
  ParticipationTrack,
  playsBoardGames,
  playsScrabble,
  touch,
  TRACK_LABEL,
  TRACK_SHORT,
  withBase,
} from "./schema";

const SCOPE = { organizationId: "org-1", eventId: "ev-game-on" };
const NOW = "2026-08-01T10:00:00.000Z";

describe("collections", () => {
  it("names every collection the data model requires", () => {
    for (const name of [
      "events",
      "registrationForms",
      "registrations",
      "participants",
      "scrabblePlayers",
      "payments",
      "membershipVerifications",
      "discounts",
      "campaignCodes",
      "checkIns",
      "rounds",
      "pairings",
      "scoreSubmissions",
      "verifiedResults",
      "standings",
      "awards",
      "certificates",
      "notifications",
      "auditLogs",
    ]) {
      expect(Object.values(COLLECTIONS)).toContain(name);
    }
  });

  it("keys match their values, so a typo is a compile error not a silent miss", () => {
    for (const [key, value] of Object.entries(COLLECTIONS)) {
      expect(key).toBe(value);
    }
  });
});

describe("withBase", () => {
  it("stamps every audit field a scoped record needs", () => {
    const r = withBase({ name: "Hunain" }, SCOPE, NOW);
    expect(r).toMatchObject({
      name: "Hunain",
      organizationId: "org-1",
      eventId: "ev-game-on",
      createdAt: NOW,
      updatedAt: NOW,
      status: "active",
    });
  });

  it("starts a record active rather than in limbo", () => {
    expect(withBase({}, SCOPE, NOW).status).toBe("active");
  });

  it("does not overwrite the caller's own fields", () => {
    const r = withBase({ name: "Ayesha", note: "keep" }, SCOPE, NOW);
    expect(r.name).toBe("Ayesha");
    expect(r.note).toBe("keep");
  });
});

describe("touch", () => {
  it("moves updatedAt forward", () => {
    const later = "2026-08-02T10:00:00.000Z";
    expect(touch({ updatedAt: NOW }, later).updatedAt).toBe(later);
  });

  /** A rewritten creation time destroys the only record of when it happened. */
  it("never rewrites createdAt", () => {
    const patched = touch({ createdAt: NOW, updatedAt: NOW }, "2026-09-01T00:00:00.000Z");
    expect(patched.createdAt).toBe(NOW);
  });
});

describe("participation tracks", () => {
  const ALL: ParticipationTrack[] = ["board_games", "speed_scrabble", "both"];

  it("labels every track in the participant's own words", () => {
    for (const t of ALL) {
      expect(TRACK_LABEL[t].length).toBeGreaterThan(0);
      expect(TRACK_SHORT[t].length).toBeGreaterThan(0);
    }
  });

  /** The rule that keeps empty chairs off Scrabble boards. */
  it("puts only Scrabble entrants into the player pool", () => {
    expect(playsScrabble("speed_scrabble")).toBe(true);
    expect(playsScrabble("both")).toBe(true);
    expect(playsScrabble("board_games")).toBe(false);
  });

  it("puts board-game attendees on the social floor", () => {
    expect(playsBoardGames("board_games")).toBe(true);
    expect(playsBoardGames("both")).toBe(true);
    expect(playsBoardGames("speed_scrabble")).toBe(false);
  });

  it("counts someone doing both in both places", () => {
    expect(playsScrabble("both") && playsBoardGames("both")).toBe(true);
  });

  it("gives every track at least one destination", () => {
    for (const t of ALL) {
      expect(playsScrabble(t) || playsBoardGames(t)).toBe(true);
    }
  });
});

describe("membership", () => {
  const ALL: MembershipStatus[] = [
    "not-claimed",
    "discount-requested",
    "review-required",
    "verified",
    "proof-rejected",
  ];

  it("labels every state in plain language", () => {
    for (const s of ALL) {
      expect(MEMBERSHIP_STATUS_LABEL[s]).not.toBe(s);
      expect(MEMBERSHIP_STATUS_LABEL[s].length).toBeGreaterThan(0);
    }
  });

  /** A claimed membership is not a verified one. */
  it("confirms only a verified membership", () => {
    expect(ALL.filter(membershipConfirmed)).toEqual(["verified"]);
  });

  it("does not confirm a discount merely because it was requested", () => {
    expect(membershipConfirmed("discount-requested")).toBe(false);
    expect(membershipConfirmed("review-required")).toBe(false);
  });
});

describe("interest capture", () => {
  const ALL: InterestAnswer[] = ["yes", "maybe", "no"];

  it("segments yes and maybe for follow-up", () => {
    expect(ALL.filter(isInterested)).toEqual(["yes", "maybe"]);
  });

  it("leaves a declined answer out of the segment", () => {
    expect(isInterested("no")).toBe(false);
  });
});
