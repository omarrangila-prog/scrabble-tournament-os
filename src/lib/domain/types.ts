/**
 * Tournament OS — domain model.
 *
 * These entity shapes mirror the intended relational schema (organizations,
 * users, tournaments, divisions, players, rounds, pairings, results, disputes,
 * audit_logs …) so the demo's local store can be swapped for a real backend
 * without reshaping the UI layer.
 */

export type DivisionId = "masters" | "advanced" | "recreational" | "beginner";

export type Role =
  | "director"
  | "scorekeeper"
  | "checkin"
  | "arbiter"
  | "display"
  | "volunteer";

export type CheckInStatus =
  | "checked-in"
  | "not-arrived"
  | "late"
  | "absent"
  | "withdrawn";

export type PaymentStatus = "paid" | "pending" | "waived" | "refunded";

export type RatingStatus = "rated" | "provisional" | "unrated";

export type PairingStatus =
  | "scheduled"
  | "live"
  | "awaiting-verification"
  | "verified"
  | "disputed"
  | "bye";

export type RoundStatus = "draft" | "published" | "in-progress" | "complete";

/** Organisation — the tenancy root in a future multi-org backend. */
export interface Organization {
  id: string;
  name: string;
  country: string;
  contactEmail: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  initials: string;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  halls: string[];
  /** Boards reachable without stairs — drives accessibility pairing checks. */
  accessibleBoards: number[];
  totalBoards: number;
}

export interface Division {
  id: DivisionId;
  name: string;
  shortName: string;
  /** Inclusive rating band used for seeding-balance warnings. */
  ratingFloor: number;
  ratingCeiling: number;
  maxAge?: number;
  accent: "primary" | "secondary" | "success" | "warning";
}

/** A ranking criterion the director can reorder in tournament settings. */
export type RankingCriterion =
  | "wins"
  | "draws"
  | "spread"
  | "head-to-head"
  | "buchholz"
  | "median-buchholz"
  | "sonneborn-berger"
  | "cumulative"
  | "performance";

export type PairingSystem =
  | "swiss"
  | "round-robin"
  | "knockout"
  | "king-of-the-hill"
  | "manual";

export interface PairingConstraints {
  avoidRepeatOpponents: boolean;
  balanceStarts: boolean;
  avoidSameClub: boolean;
  respectAccessibility: boolean;
  maxRatingGap: number;
  /** A player may not receive more than this many byes. */
  maxByesPerPlayer: number;
  rankProximityWindow: number;
}

export interface Tournament {
  id: string;
  name: string;
  organizer: string;
  organizationId: string;
  venueId: string;
  city: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  status: "draft" | "live" | "complete";
  system: PairingSystem;
  totalRounds: number;
  currentRound: number;
  divisions: DivisionId[];
  rankingRules: RankingCriterion[];
  constraints: PairingConstraints;
  gameMinutes: number;
  breakMinutes: number;
  visibility: "public" | "private";
  registrationOpen: boolean;
  registrationFee: number;
  currency: string;
  capacity: number;
  sponsors: string[];
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface Player {
  id: string;
  /** Human-facing identifier printed on badges, e.g. "PK-042". */
  playerId: string;
  fullName: string;
  initials: string;
  /** Deterministic hue for the initials avatar. */
  avatarHue: number;
  city: string;
  club: string;
  division: DivisionId;
  rating: number;
  ratingStatus: RatingStatus;
  seed: number;
  wins: number;
  losses: number;
  draws: number;
  spread: number;
  rank: number;
  previousRank: number;
  checkIn: CheckInStatus;
  checkInAt?: string;
  expectedArrival?: string;
  /** Round number → attended. */
  attendance: Record<number, boolean>;
  /** Player ids already faced, in round order. */
  opponentHistory: string[];
  boardHistory: number[];
  byeRounds: number[];
  tournamentHistory: { year: number; event: string; place: string }[];
  emergencyContact: EmergencyContact;
  accommodation?: string;
  payment: PaymentStatus;
  registeredAt: string;
  photoUrl?: string;
}

export interface Pairing {
  id: string;
  tournamentId: string;
  round: number;
  division: DivisionId;
  board: number;
  playerAId: string;
  /** null represents a bye. */
  playerBId: string | null;
  /**
   * Whether the player in the `playerAId` slot plays first. Refers to the slot, not a
   * specific player — a swap that moves who occupies `playerAId` does not need to touch this
   * separately, since "whoever is in A goes first" stays true. `undefined`/`null` means no
   * decision was made (start balancing off, or a manually-built board), not "B goes first".
   */
  aPlaysFirst?: boolean | null;
  scoreA?: number;
  scoreB?: number;
  status: PairingStatus;
  /** Locked pairings survive regeneration untouched. */
  locked: boolean;
  /** Human-readable justification shown on the pairing card. */
  reason: string;
  confidence: number;
  conflicts: PairingConflict[];
  startedAt?: string;
  completedAt?: string;
  manualOverride?: { by: string; reason: string; at: string };
}

export type ConflictKind =
  | "repeat-opponent"
  | "duplicate-assignment"
  | "already-had-bye"
  | "withdrawn-player"
  | "accessibility"
  | "same-club"
  | "rating-gap";

export interface PairingConflict {
  kind: ConflictKind;
  severity: "critical" | "warning";
  message: string;
  /** Set when the director consciously accepted the conflict. */
  acknowledgedReason?: string;
}

export interface Round {
  id: string;
  tournamentId: string;
  number: number;
  status: RoundStatus;
  publishedAt?: string;
  startsAt: string;
  /** Snapshot taken at publication, used by the audit trail. */
  pairingCount: number;
}

/** A score reported by one side; two of these can disagree. */
export interface ResultSubmission {
  id: string;
  pairingId: string;
  submittedBy: string;
  submittedByRole: Role | "player";
  scoreA: number;
  scoreB: number;
  at: string;
  device: string;
  confirmedByA: boolean;
  confirmedByB: boolean;
  note?: string;
}

export type DisputeCategory =
  | "score"
  | "challenge"
  | "time"
  | "conduct"
  | "equipment"
  | "pairing"
  | "late-arrival"
  | "correction"
  | "appeal"
  | "other";

export type DisputeStatus =
  | "open"
  | "reviewing"
  | "decision"
  | "notified"
  | "appeal"
  | "closed";

export interface Dispute {
  id: string;
  caseNumber: string;
  tournamentId: string;
  round: number;
  board: number;
  category: DisputeCategory;
  playerIds: string[];
  submittedBy: string;
  description: string;
  evidence: string[];
  ruleReference?: string;
  assignedArbiter: string;
  priority: "low" | "normal" | "high";
  status: DisputeStatus;
  decision?: string;
  penalty?: string;
  appealAllowed: boolean;
  timeline: { at: string; by: string; entry: string }[];
  createdAt: string;
}

export interface Announcement {
  id: string;
  tournamentId: string;
  title: string;
  body: string;
  audience: string;
  channels: string[];
  publishedAt: string;
  author: string;
  pinned: boolean;
}

export interface MessageCampaign {
  id: string;
  template: string;
  channel: "push" | "whatsapp" | "sms" | "email" | "in-app" | "public-screen";
  audience: string;
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  sentAt: string;
  status: "sent" | "sending" | "scheduled" | "failed";
}

export interface AuditEntry {
  id: string;
  tournamentId: string;
  at: string;
  user: string;
  role: Role;
  action: string;
  target: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  device: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  user: string;
  message: string;
  kind: "result" | "pairing" | "checkin" | "board" | "correction" | "sync";
}

/** Computed standings row — never persisted, always derived from results. */
export interface StandingsRow {
  playerId: string;
  rank: number;
  previousRank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  spread: number;
  points: number;
  buchholz: number;
  performance: number;
  currentBoard?: number;
  status: CheckInStatus;
}
