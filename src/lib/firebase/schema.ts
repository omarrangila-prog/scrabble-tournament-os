/**
 * The Firestore data model.
 *
 * Every event-owned record carries `organizationId`, `eventId`, `createdAt`,
 * `updatedAt` and `status`. That is not bookkeeping for its own sake: scoping
 * every query by organization and event is what stops one tournament's data
 * appearing under another's name, and the timestamps are what make an audit
 * trail possible after the fact.
 *
 * Collection names live here as constants rather than string literals at call
 * sites, so a rename is one edit and a typo is a compile error.
 */

export const COLLECTIONS = {
  organizations: "organizations",
  events: "events",
  registrationForms: "registrationForms",
  registrations: "registrations",
  participants: "participants",
  scrabblePlayers: "scrabblePlayers",
  payments: "payments",
  membershipVerifications: "membershipVerifications",
  discounts: "discounts",
  campaignCodes: "campaignCodes",
  checkIns: "checkIns",
  rounds: "rounds",
  pairings: "pairings",
  scoreSubmissions: "scoreSubmissions",
  verifiedResults: "verifiedResults",
  standings: "standings",
  awards: "awards",
  certificates: "certificates",
  notifications: "notifications",
  interestRegistrations: "interestRegistrations",
  auditLogs: "auditLogs",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** Fields every event-owned document carries. */
export interface DocumentBase {
  organizationId: string;
  eventId: string;
  /** ISO 8601. Stored as a string so records survive a JSON round-trip. */
  createdAt: string;
  updatedAt: string;
  /** Lifecycle of this record, distinct from any domain status it also has. */
  status: RecordStatus;
}

/**
 * Record lifecycle.
 *
 * `archived` exists so nothing is ever destroyed to get it off a screen —
 * hiding and deleting are different operations with very different
 * consequences for a tournament's history.
 */
export type RecordStatus = "active" | "archived" | "deleted";

/** Adds the audit fields to a new record. */
export function withBase<T extends object>(
  data: T,
  scope: { organizationId: string; eventId: string },
  now = new Date().toISOString(),
): T & DocumentBase {
  return {
    ...data,
    organizationId: scope.organizationId,
    eventId: scope.eventId,
    createdAt: now,
    updatedAt: now,
    status: "active",
  };
}

/** Stamps an update. `createdAt` is never rewritten. */
export function touch<T extends Partial<DocumentBase>>(
  data: T,
  now = new Date().toISOString(),
): T & { updatedAt: string } {
  return { ...data, updatedAt: now };
}

/* -------------------------------------------------------------------------- */
/* Participation tracks                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What a participant came for.
 *
 * The distinction drives which operational modules apply. Someone here for
 * board games should never appear in a Scrabble pairing, and pretending
 * otherwise would put an empty chair at a board on the day.
 */
export type ParticipationTrack = "board_games" | "speed_scrabble" | "both";

export const TRACK_LABEL: Record<ParticipationTrack, string> = {
  board_games: "Social Board Games",
  speed_scrabble: "Speed Scrabble",
  both: "Both Board Games and Speed Scrabble",
};

/** Short form, for tables and badges where the full label will not fit. */
export const TRACK_SHORT: Record<ParticipationTrack, string> = {
  board_games: "Board Games",
  speed_scrabble: "Speed Scrabble",
  both: "Both",
};

/** Whether this participant enters the Scrabble player pool. */
export function playsScrabble(track: ParticipationTrack): boolean {
  return track === "speed_scrabble" || track === "both";
}

/** Whether this participant joins the social board-game floor. */
export function playsBoardGames(track: ParticipationTrack): boolean {
  return track === "board_games" || track === "both";
}

/* -------------------------------------------------------------------------- */
/* Membership                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where an Alliance Française membership discount stands.
 *
 * A claimed membership is not a verified one. The discount is shown from the
 * moment it is requested — so the participant sees the fee they expect — but it
 * is not treated as settled revenue until someone has checked the number.
 */
export type MembershipStatus =
  | "not-claimed"
  | "discount-requested"
  | "review-required"
  | "verified"
  | "proof-rejected";

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  "not-claimed": "Not an AFK member",
  "discount-requested": "Discount requested",
  "review-required": "Membership review required",
  verified: "Membership verified",
  "proof-rejected": "Membership proof rejected",
};

/** Whether the discount may be counted as confirmed. */
export function membershipConfirmed(status: MembershipStatus): boolean {
  return status === "verified";
}

/* -------------------------------------------------------------------------- */
/* Future-interest capture                                                     */
/* -------------------------------------------------------------------------- */

/** Interest in the Jamming Session, captured during registration. */
export type InterestAnswer = "yes" | "maybe" | "no";

export const INTEREST_LABEL: Record<InterestAnswer, string> = {
  yes: "Yes — I would love to join",
  maybe: "Maybe — send me the details",
  no: "Not this time",
};

/**
 * A recorded interest in a future event.
 *
 * Deliberately its own record rather than a flag on the registration: this is
 * a separate consent for a separate event, and it must be revocable without
 * touching the registration it came from.
 */
export interface InterestRegistration extends DocumentBase {
  id: string;
  /** What they were asked about. */
  subject: string;
  answer: InterestAnswer;
  participantEmail: string;
  participantPhone: string;
  /** Whether they agreed to be contacted about it. */
  communicationConsent: boolean;
  /** The event where the interest was captured. */
  sourceEventId: string;
  submittedAt: string;
}

/** Whether this answer places someone in the follow-up segment. */
export function isInterested(answer: InterestAnswer): boolean {
  return answer === "yes" || answer === "maybe";
}
