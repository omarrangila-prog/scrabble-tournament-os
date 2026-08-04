/**
 * Deterministic demo-data generator.
 *
 * Everything here is derived from a fixed seed so the demo looks identical on
 * every machine and after every "Reset Demo Data". Rounds 1–4 are played and
 * verified; round 5 is live with the exact operational picture the spec calls
 * for (61 live, 1 complete, 3 pending).
 */

import {
  ActivityEntry,
  Announcement,
  AuditEntry,
  Dispute,
  Division,
  MessageCampaign,
  Organization,
  Pairing,
  Player,
  ResultSubmission,
  Round,
  Tournament,
  User,
  Venue,
} from "./types";

/** Mulberry32 — small, fast, deterministic PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_DATE = "2026-07-31";
export const ORGANIZATION: Organization = {
  id: "org-federation",
  name: "Bluffy Alphabattle",
  country: "Pakistan",
  contactEmail: "info@tournamentos.demo",
};

export const VENUE: Venue = {
  id: "venue-nseh",
  name: "National Sports & Events Hall",
  city: "Karachi",
  halls: ["Hall A — Masters & Open", "Hall B — Youth & Junior", "Hall C — Overflow"],
  // Ground-floor boards; used by the accessibility pairing constraint.
  accessibleBoards: Array.from({ length: 20 }, (_, i) => i + 1),
  totalBoards: 72,
};

export const DIVISIONS: Division[] = [
  { id: "masters", name: "Masters", shortName: "MST", ratingFloor: 1750, ratingCeiling: 2200, accent: "primary" },
  { id: "advanced", name: "Advanced", shortName: "ADV", ratingFloor: 1300, ratingCeiling: 1800, accent: "secondary" },
  { id: "recreational", name: "Recreational", shortName: "REC", ratingFloor: 1100, ratingCeiling: 1650, maxAge: 18, accent: "success" },
  { id: "beginner", name: "Beginner", shortName: "NOV", ratingFloor: 800, ratingCeiling: 1350, maxAge: 14, accent: "warning" },
];

/**
 * Sign-in accounts, one per role.
 *
 * Named by the job rather than by invented people. The four staff accounts
 * that used to carry fabricated names read as real colleagues in the staff
 * list, which is misleading in a product where the staff list is also the
 * permission list. The director is the real one.
 */
export const USERS: User[] = [
  { id: "u-dir", name: "Sir Hani", email: "director@tournamentos.demo", role: "director", organizationId: "org-federation", initials: "SH" },
  { id: "u-score", name: "Scorekeeper", email: "scorekeeper@tournamentos.demo", role: "scorekeeper", organizationId: "org-federation", initials: "SK" },
  { id: "u-check", name: "Check-in Desk", email: "checkin@tournamentos.demo", role: "checkin", organizationId: "org-federation", initials: "CD" },
  { id: "u-arb", name: "Arbiter", email: "arbiter@tournamentos.demo", role: "arbiter", organizationId: "org-federation", initials: "AR" },
  { id: "u-disp", name: "Venue Display", email: "display@tournamentos.demo", role: "display", organizationId: "org-federation", initials: "VD" },
];

export const TOURNAMENT: Tournament = {
  id: "t-pnsc-2026",
  name: "Bluffy Alphabattle Championship 2026 — Demo",
  organizer: "Bluffy Alphabattle",
  organizationId: "org-federation",
  venueId: "venue-nseh",
  city: "Karachi",
  startDate: "2026-07-29",
  endDate: "2026-08-02",
  timeZone: "Asia/Karachi (PKT, UTC+5)",
  status: "live",
  system: "swiss",
  totalRounds: 9,
  currentRound: 5,
  divisions: ["masters", "advanced", "recreational", "beginner"],
  rankingRules: ["wins", "spread", "head-to-head"],
  constraints: {
    avoidRepeatOpponents: true,
    balanceStarts: true,
    avoidSameClub: true,
    respectAccessibility: true,
    maxRatingGap: 400,
    maxByesPerPlayer: 1,
    rankProximityWindow: 4,
  },
  gameMinutes: 50,
  breakMinutes: 15,
  visibility: "public",
  registrationOpen: false,
  registrationFee: 2500,
  currency: "PKR",
  capacity: 160,
  sponsors: ["Gulf Stationers", "Karachi Book Depot", "PakTel", "Indus Bank"],
};

/**
 * The three specific players the guided demo drives. They are pinned to fixed
 */
export const DEMO_PLAYER_A = "PK-003";
export const DEMO_PLAYER_B = "PK-018";

/**
 * The platform's starting data.
 *
 * Reference data only: the organization, the venue, the four divisions and the
 * staff roles. No players, no games, no results.
 *
 * Everything here used to be fabricated — 128 invented people with names,
 * ratings and played games, a tournament mid-way through round five, disputes
 * and audit entries. That data reached the participant list, the payment queue,
 * the standings and ultimately certificates asserting results nobody achieved.
 * A platform that ships with fake players cannot be told apart from one holding
 * real entries until someone looks closely, which is exactly the wrong moment
 * to find out.
 *
 * So the platform starts empty and fills with what people actually do.
 */
export function buildSeed() {
  return {
    organization: ORGANIZATION,
    venue: VENUE,
    divisions: DIVISIONS,
    users: USERS,
    tournament: TOURNAMENT,
    players: [] as Player[],
    pairings: [] as Pairing[],
    rounds: [] as Round[],
    submissions: [] as ResultSubmission[],
    disputes: [] as Dispute[],
    announcements: [] as Announcement[],
    campaigns: [] as MessageCampaign[],
    audit: [] as AuditEntry[],
    activity: [] as ActivityEntry[],
  };
}

export type SeedData = ReturnType<typeof buildSeed>;
