/**
 * Player identity, registration and category domain.
 *
 * The Player ID is the permanent spine of the platform: a player registers
 * once, receives an identity that never changes, and every later record —
 * registration, attendance, match, ranking, category decision — references it.
 * Nothing here is ever deleted; category changes append to a ledger.
 */

export type PlayerCategory = "novice" | "recreational" | "advanced" | "masters";

export const CATEGORY_ORDER: PlayerCategory[] = [
  "novice",
  "recreational",
  "advanced",
  "masters",
];

export const CATEGORY_LABEL: Record<PlayerCategory, string> = {
  novice: "Novice",
  recreational: "Recreational",
  advanced: "Advanced",
  masters: "Masters",
};

export const CATEGORY_DESCRIPTION: Record<PlayerCategory, string> = {
  novice: "For beginners still learning the game. Age 6–18.",
  recreational: "Club-level players competing regularly for enjoyment.",
  advanced: "Experienced competitors playing at a high standard.",
  masters: "The strongest field — national and international level.",
};

/** Novice is a beginners' category, restricted by age rather than by results. */
export const NOVICE_AGE_RANGE = { min: 6, max: 18 };

export type RegistrationStatus =
  | "draft"
  | "submitted"
  | "payment-pending"
  | "payment-review"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "cancelled";

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  "payment-pending": "Payment Pending",
  "payment-review": "Payment Under Review",
  approved: "Approved",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
};

export type PaymentMethod =
  | "bank-transfer"
  | "easypaisa"
  | "jazzcash"
  | "card"
  | "cash"
  | "other";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  "bank-transfer": "Bank transfer",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  card: "Credit / debit card",
  cash: "Cash at venue",
  other: "Other approved method",
};

/** Personal details captured once and reused for every later event. */
export interface PlayerIdentity {
  /** Permanent, never reused. Matches Player.playerId. */
  playerId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fatherName: string;
  gender: "male" | "female" | "prefer-not-to-say";
  dateOfBirth: string;
  nationality: string;
  city: string;
  province: string;
  country: string;
  address: string;

  mobile: string;
  whatsapp?: string;
  email: string;
  emergencyContactName: string;
  emergencyContactNumber: string;

  /** Passport-style photograph reference. */
  photo?: { uploadedAt: string; verified: boolean; fileName: string };
  identityDocument?: { kind: "cnic" | "passport" | "student-card"; verified: boolean; fileName: string };

  category: PlayerCategory;
  club: string;
  registeredAt: string;
  verified: boolean;
}

export interface Registration {
  id: string;
  tournamentId: string;
  /** Set once the player has an identity; null while a new player is pending. */
  playerId: string | null;
  isNewPlayer: boolean;

  /** Identity snapshot supplied on the form. */
  applicant: Omit<PlayerIdentity, "registeredAt" | "verified">;

  category: PlayerCategory;
  status: RegistrationStatus;

  payment: {
    method: PaymentMethod;
    amount: number;
    currency: string;
    reference: string;
    proofFileName?: string;
    receivedAt?: string;
    verifiedBy?: string;
  };

  submittedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
  /** Appended on every status change; never rewritten. */
  timeline: { at: string; by: string; entry: string }[];
}

export type CategoryDecisionKind = "promotion" | "demotion" | "initial" | "correction";

/** One immutable entry in a player's category ledger. */
export interface CategoryLedgerEntry {
  id: string;
  playerId: string;
  from: PlayerCategory | null;
  to: PlayerCategory;
  kind: CategoryDecisionKind;
  reason: string;
  decidedBy: string;
  at: string;
  /** Set when the change came from an accepted recommendation. */
  recommendationId?: string;
}

export type RecommendationStatus = "open" | "approved" | "rejected" | "postponed";

export interface CategoryRecommendation {
  id: string;
  playerId: string;
  playerName: string;
  current: PlayerCategory;
  proposed: PlayerCategory;
  kind: "promotion" | "demotion";
  /** Plain-language justification, derived from the factors below. */
  rationale: string;
  factors: { label: string; value: string; supports: boolean }[];
  confidence: number;
  status: RecommendationStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
  /** Set when a rule blocks the change even though performance suggests it. */
  blockedBy?: string;
}

/** Age in whole years on a given reference date. */
export function ageOn(dateOfBirth: string, reference = new Date()): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  let age = reference.getFullYear() - dob.getFullYear();
  const m = reference.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && reference.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  /** True when only an administrator may override the rule. */
  overridable?: boolean;
}

/**
 * Category eligibility. Novice carries an age rule because it exists for
 * beginners — it is never a demotion target for poor results or inactivity.
 */
export function categoryEligibility(
  category: PlayerCategory,
  dateOfBirth: string,
  reference = new Date(),
): EligibilityResult {
  if (category !== "novice") return { eligible: true };

  const age = ageOn(dateOfBirth, reference);
  if (age === 0) {
    return { eligible: false, reason: "A date of birth is required for the Novice category.", overridable: true };
  }
  if (age < NOVICE_AGE_RANGE.min || age > NOVICE_AGE_RANGE.max) {
    return {
      eligible: false,
      reason: `Novice is for beginners aged ${NOVICE_AGE_RANGE.min}–${NOVICE_AGE_RANGE.max}. This player is ${age}. An administrator may approve an exception.`,
      overridable: true,
    };
  }
  return { eligible: true };
}

export function categoryRank(category: PlayerCategory): number {
  return CATEGORY_ORDER.indexOf(category);
}

export function nextCategoryUp(category: PlayerCategory): PlayerCategory | null {
  const i = categoryRank(category);
  return i >= 0 && i < CATEGORY_ORDER.length - 1 ? CATEGORY_ORDER[i + 1] : null;
}

export function nextCategoryDown(category: PlayerCategory): PlayerCategory | null {
  const i = categoryRank(category);
  return i > 0 ? CATEGORY_ORDER[i - 1] : null;
}

/** Formats a permanent player identifier. Sequence never restarts or reuses. */
export function formatPlayerId(sequence: number): string {
  return `PK-${String(sequence).padStart(3, "0")}`;
}

/** Deterministic payload encoded in the player's QR code. */
export function qrPayload(playerId: string): string {
  return `TOS:PLAYER:${playerId}`;
}

export function fullNameOf(identity: Pick<PlayerIdentity, "firstName" | "middleName" | "lastName">): string {
  return [identity.firstName, identity.middleName, identity.lastName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
