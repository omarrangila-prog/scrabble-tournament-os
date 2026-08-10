/**
 * The roster, built from registrations.
 *
 * The organizer app was written against a `players` array in browser storage. The
 * demo data that filled it is gone, and the real entrants live in Postgres, so
 * every roster screen showed an empty table no matter how many people had signed
 * up. This is the bridge: one pure function from what the database holds to what
 * the tournament engine expects.
 *
 * Deriving the roster rather than storing a second copy of it means a check-in or
 * a verified payment shows up on the roster without anything having to be kept in
 * step. It follows the rule the standings already follow: if a fact can be
 * computed from the source of truth, computing it is safer than copying it.
 */

import type {
  CheckInStatus,
  DivisionId,
  PaymentStatus,
  Player,
} from "./types";

/** The registration fields the roster is built from. */
export interface RosterSource {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  area: string | null;
  playingLevel: string;
  registrationStatus: string;
  paymentStatus: string;
  checkedInAt: string | null;
  submittedAt: string;
}

/**
 * Which division a stated playing level belongs to.
 *
 * The public form offers three levels in plain language; the engine works in
 * division ids. "Masters" is deliberately absent — the user removed it, on the
 * grounds that those players enter as advanced.
 *
 * An unrecognised value maps to `recreational` rather than being dropped. A
 * person who registered and paid must appear on the roster; putting them in the
 * middle division is a judgement the director can correct, whereas losing them
 * is a person turned away at the door.
 */
export function divisionFor(playingLevel: string): DivisionId {
  const level = playingLevel.trim().toLowerCase();

  if (level.includes("beginner") || level.includes("new")) return "beginner";
  if (level.includes("advanced") || level.includes("regular")) return "advanced";
  return "recreational";
}

/** Arrival state. A recorded arrival time is the only thing that proves arrival. */
export function checkInFor(source: RosterSource): CheckInStatus {
  if (source.checkedInAt) return "checked-in";
  if (source.registrationStatus === "withdrawn") return "withdrawn";
  return "not-arrived";
}

/**
 * Payment state, narrowed to what the roster needs.
 *
 * Only a payment a human has verified counts as paid. An uploaded receipt is a
 * claim, not a confirmation — the user was explicit that a screenshot cannot
 * prove a transfer happened, so `receipt-uploaded` stays pending here.
 */
export function paymentFor(paymentStatus: string): PaymentStatus {
  if (paymentStatus === "verified") return "paid";
  if (paymentStatus === "waived") return "waived";
  if (paymentStatus === "refunded") return "refunded";
  return "pending";
}

/** Up to two initials, for the avatar. */
export function initialsFor(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

/**
 * A stable hue for the avatar, derived from the name.
 *
 * Deterministic so a player keeps the same colour between reloads and between
 * devices. A random hue would make the same person look like two people.
 */
export function hueFor(fullName: string): number {
  let hash = 0;
  for (const char of fullName) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360_000;
  }
  return hash % 360;
}

/**
 * Entry numbers, assigned in the order people registered.
 *
 * The check-in code is deliberately not reused here. It is what a participant
 * types to mark themselves present, so printing it on a badge or a wall chart
 * would let anyone standing nearby check somebody else in.
 */
function entryNumber(index: number): string {
  return `AB-${String(index + 1).padStart(3, "0")}`;
}

/**
 * Builds the roster.
 *
 * Rejected registrations are left out: they are not entrants. Waitlisted ones are
 * kept, because a waitlisted player who turns up to a seat that opened up is a
 * real participant and the director needs to see them.
 *
 * Win, loss, spread and rank are all zero. They are not stored anywhere — they
 * are computed from verified games — and a roster that invented them would be
 * showing standings for a tournament that has not started.
 */
export function rosterFromRegistrations(sources: RosterSource[]): Player[] {
  const entrants = sources
    .filter((s) => s.registrationStatus !== "rejected")
    .slice()
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  const seedByDivision = new Map<DivisionId, number>();

  return entrants.map((source, index) => {
    const division = divisionFor(source.playingLevel);
    const seed = (seedByDivision.get(division) ?? 0) + 1;
    seedByDivision.set(division, seed);

    return {
      id: source.id,
      playerId: entryNumber(index),
      fullName: source.fullName || "Name not given",
      initials: initialsFor(source.fullName),
      avatarHue: hueFor(source.fullName),
      city: source.area ?? "Karachi",
      club: "—",
      division,
      /*
       * Nobody has a rating. This is a first event with no rated history, and a
       * made-up number would be used for seeding and look authoritative.
       */
      rating: 0,
      ratingStatus: "unrated",
      seed,
      wins: 0,
      losses: 0,
      draws: 0,
      spread: 0,
      rank: 0,
      previousRank: 0,
      checkIn: checkInFor(source),
      checkInAt: source.checkedInAt ?? undefined,
      attendance: {},
      opponentHistory: [],
      boardHistory: [],
      byeRounds: [],
      tournamentHistory: [],
      emergencyContact: { name: "", relationship: "", phone: source.mobile },
      payment: paymentFor(source.paymentStatus),
      registeredAt: source.submittedAt,
    } satisfies Player;
  });
}

/** Headline roster counts, for the stat tiles. */
export interface RosterCounts {
  total: number;
  checkedIn: number;
  paid: number;
  awaitingPayment: number;
}

export function rosterCounts(players: Player[]): RosterCounts {
  return {
    total: players.length,
    checkedIn: players.filter((p) => p.checkIn === "checked-in").length,
    paid: players.filter((p) => p.payment === "paid").length,
    awaitingPayment: players.filter((p) => p.payment === "pending").length,
  };
}
