/**
 * Event reporting.
 *
 * A report is a document, not a screen. It gets printed, emailed to a sponsor,
 * and filed — so it carries no buttons, no filters and no navigation, and
 * every figure on it is fixed at the moment it was generated.
 *
 * That separation is the point of this module. Controls live in the
 * application; this produces the *content*, and the content is a plain data
 * structure that a page can render without needing the stores. It follows that
 * a report can be regenerated identically later from the same inputs.
 *
 * Figures follow the same rule as everywhere else: only verified money counts
 * as received, only verified games count as played.
 */

import { ExpenseTotals, FeeTotals, FinancePosition } from "./finance";
import {
  InterestAnswer,
  isInterested,
  ParticipationTrack,
  playsBoardGames,
  playsScrabble,
} from "../firebase/schema";

export type ReportPage =
  | "executive"
  | "participants"
  | "performance"
  | "financial"
  | "communication";

export const REPORT_PAGES: { id: ReportPage; title: string; blurb: string }[] = [
  {
    id: "executive",
    title: "Executive Overview",
    blurb: "The condition of the event at a glance.",
  },
  { id: "participants", title: "Participant Analysis", blurb: "Who entered, and from where." },
  { id: "performance", title: "Tournament Performance", blurb: "How play actually went." },
  { id: "financial", title: "Financial Performance", blurb: "Money in, money out, what remains." },
  {
    id: "communication",
    title: "Certificates and Communication",
    blurb: "What was issued and sent.",
  },
];

/* -------------------------------------------------------------------------- */
/* Metrics                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One headline figure.
 *
 * `caveat` exists because a number without its qualification misleads. A
 * revenue figure that silently excludes unverified receipts is not wrong, but
 * a reader who does not know that will draw the wrong conclusion.
 */
export interface Metric {
  label: string;
  value: string;
  /** Supporting detail, e.g. "of 128 places". */
  sub?: string;
  /** What this figure deliberately excludes. */
  caveat?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}

export interface DistributionRow {
  label: string;
  count: number;
  /** Percentage of the total, rounded. */
  share: number;
}

/** Builds a distribution, largest first, with shares that reflect the whole. */
export function distribution(
  items: string[],
  options: { limit?: number; otherLabel?: string } = {},
): DistributionRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.trim() || "Not stated";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = items.length;
  const rows = [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      share: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const limit = options.limit ?? 0;
  if (limit <= 0 || rows.length <= limit) return rows;

  // Collapse the tail rather than truncating it, so shares still sum to 100.
  const kept = rows.slice(0, limit);
  const tail = rows.slice(limit);
  const tailCount = tail.reduce((s, r) => s + r.count, 0);

  return [
    ...kept,
    {
      label: options.otherLabel ?? `Other (${tail.length})`,
      count: tailCount,
      share: total > 0 ? Math.round((tailCount / total) * 100) : 0,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReportInput {
  eventName: string;
  organizer: string;
  startDate: string;
  venue: string;
  city: string;
  currency: string;
  capacity: number;
  rounds: number;

  registrations: {
    status: string;
    paymentStatus: string;
    division: string;
    city: string;
    club: string;
    isReturning: boolean;
    /** Which parts of the event this person came for. */
    track?: ParticipationTrack;
    /** True when a member discount was claimed, whether or not it was verified. */
    claimedMembership?: boolean;
    /** True once the membership number has actually been checked. */
    membershipVerified?: boolean;
    /** Interest in a future event, captured at registration. */
    futureInterest?: InterestAnswer;
  }[];

  attendance: { checkedIn: number };

  play: {
    boardsTotal: number;
    boardsVerified: number;
    conflicts: number;
    averageScore: number;
    highestScore: number;
    averageSpread: number;
    roundsCompleted: number;
  };

  fees: FeeTotals;
  expenses: ExpenseTotals;
  position: FinancePosition;

  certificates: { prepared: number; issued: number; withdrawn: number };
  notifications: { sent: number; failed: number };

  /** When this report was produced. Printed on every page. */
  generatedAt: string;
  generatedBy: string;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReportSection {
  page: ReportPage;
  title: string;
  /** Read in about five seconds. Only the executive page carries one. */
  summary?: string;
  metrics: Metric[];
  tables: { title: string; rows: DistributionRow[] }[];
  /** Statements the figures support, for a reader in a hurry. */
  observations: string[];
}

const money = (amount: number, currency: string) =>
  `${currency} ${Math.round(amount).toLocaleString("en-PK")}`;

const pct = (value: number, of: number) =>
  of > 0 ? `${Math.round((value / of) * 100)}%` : "—";

/**
 * Builds every page of the report.
 *
 * Observations are derived, never editorial: each one restates a figure that
 * appears on the same page, so nothing in the prose can contradict the tables.
 */
export function buildReport(input: ReportInput): ReportSection[] {
  const regs = input.registrations;
  const approved = regs.filter((r) => r.status === "approved");
  const returning = approved.filter((r) => r.isReturning).length;

  const pctOf = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

  /*
   * Track figures. The exclusive splits and the two operational totals are
   * both reported: everyone who chose "both" belongs on the floor and in the
   * Scrabble pool, so quoting only the exclusive counts understates each.
   */
  const hasTracks = approved.some((r) => r.track);
  const boardOnly = approved.filter((r) => r.track === "board_games").length;
  const scrabbleOnly = approved.filter((r) => r.track === "speed_scrabble").length;
  const bothCount = approved.filter((r) => r.track === "both").length;
  const onFloor = approved.filter((r) => r.track && playsBoardGames(r.track)).length;
  const inPool = approved.filter((r) => r.track && playsScrabble(r.track)).length;

  const membershipClaimed = approved.filter((r) => r.claimedMembership).length;
  const membershipVerified = approved.filter((r) => r.membershipVerified).length;
  const interested = approved.filter(
    (r) => r.futureInterest && isInterested(r.futureInterest),
  ).length;

  /* ---- Executive ------------------------------------------------------ */

  const executive: ReportSection = {
    page: "executive",
    title: "Executive Overview",
    /*
     * An event with no cap is described as having none, rather than as having nought.
     * Capacity is optional here — this event runs to whoever registers — and "2
     * registrations against 0 places" reads as a failure rather than as no limit.
     */
    summary: `${input.eventName} drew ${regs.length} registrations${
      input.capacity > 0 ? ` against ${input.capacity} places` : ""
    }, with ${input.attendance.checkedIn} players attending. ${money(input.fees.collected, input.currency)} was collected against ${money(input.expenses.paid, input.currency)} paid out, leaving ${money(input.position.cashInHand, input.currency)} in hand.`,
    metrics: [
      {
        label: "Registrations",
        value: String(regs.length),
        sub:
          input.capacity > 0
            ? `${pct(regs.length, input.capacity)} of ${input.capacity} places`
            : "no capacity limit set",
      },
      {
        label: "Attended",
        value: String(input.attendance.checkedIn),
        sub: `${pct(input.attendance.checkedIn, approved.length)} of approved entries`,
      },
      {
        label: "Revenue received",
        value: money(input.fees.collected, input.currency),
        caveat: "Verified payments only.",
        tone: "positive",
      },
      {
        label: "Expenses paid",
        value: money(input.expenses.paid, input.currency),
        sub: `${money(input.expenses.committed, input.currency)} committed`,
      },
      {
        label: "Cash in hand",
        value: money(input.position.cashInHand, input.currency),
        tone: input.position.cashInHand >= 0 ? "positive" : "negative",
      },
      {
        label: "Returning participants",
        value: String(returning),
        sub: `${pct(returning, approved.length)} of the field`,
      },
    ],
    tables: [
      {
        title: "Entries by division",
        rows: distribution(approved.map((r) => r.division)),
      },
    ],
    observations: [],
  };

  if (input.fees.pendingVerification > 0)
    executive.observations.push(
      `${money(input.fees.pendingVerification, input.currency)} in receipts is awaiting verification and is excluded from revenue.`,
    );
  if (input.position.breakEvenShortfall > 0)
    executive.observations.push(
      `${money(input.position.breakEvenShortfall, input.currency)} must still be collected to cover what has been paid and committed.`,
    );
  if (input.play.conflicts > 0)
    executive.observations.push(
      `${input.play.conflicts} score conflict${input.play.conflicts === 1 ? "" : "s"} remained unresolved.`,
    );

  /* ---- Participants ---------------------------------------------------- */

  const participants: ReportSection = {
    page: "participants",
    title: "Participant Analysis",
    metrics: [
      { label: "Total registrations", value: String(regs.length) },
      { label: "Approved", value: String(approved.length) },
      {
        label: "Waitlisted",
        value: String(regs.filter((r) => r.status === "waitlisted").length),
      },
      {
        label: "New participants",
        value: String(approved.length - returning),
        sub: `${pct(approved.length - returning, approved.length)} of the field`,
      },
      ...(hasTracks
        ? [
            {
              label: "On the board-game floor",
              value: String(onFloor),
              sub: bothCount ? `includes ${bothCount} also competing` : "social attendees",
            },
            {
              label: "In the Scrabble pool",
              value: String(inPool),
              sub: bothCount ? `includes ${bothCount} also on the floor` : "competitors",
            },
          ]
        : []),
      ...(membershipClaimed
        ? [
            {
              label: "Member discounts",
              value: `${membershipVerified}/${membershipClaimed}`,
              sub: "verified of claimed",
              caveat:
                membershipVerified < membershipClaimed
                  ? "Unverified claims are not counted as settled revenue."
                  : undefined,
              tone:
                membershipVerified < membershipClaimed
                  ? ("warning" as const)
                  : ("neutral" as const),
            },
          ]
        : []),
      ...(interested
        ? [
            {
              label: "Future event interest",
              value: String(interested),
              sub: "asked to hear about the next one",
            },
          ]
        : []),
    ],
    tables: [
      ...(hasTracks
        ? [
            {
              title: "By what they came for",
              rows: [
                { label: "Board games only", count: boardOnly, share: pctOf(boardOnly, approved.length) },
                { label: "Speed Scrabble only", count: scrabbleOnly, share: pctOf(scrabbleOnly, approved.length) },
                { label: "Both", count: bothCount, share: pctOf(bothCount, approved.length) },
              ].filter((r) => r.count > 0),
            },
          ]
        : []),
      { title: "By division", rows: distribution(approved.map((r) => r.division)) },
      { title: "By city", rows: distribution(approved.map((r) => r.city), { limit: 8 }) },
      {
        title: "By school or club",
        rows: distribution(approved.map((r) => r.club), { limit: 10 }),
      },
    ],
    observations: [],
  };

  const cities = distribution(approved.map((r) => r.city));
  if (cities.length)
    participants.observations.push(
      `${cities[0].label} supplied ${cities[0].share}% of the field.`,
    );
  if (returning > 0)
    participants.observations.push(
      `${returning} of ${approved.length} players had entered a previous event.`,
    );

  if (membershipClaimed > membershipVerified)
    participants.observations.push(
      `${membershipClaimed - membershipVerified} member discount${membershipClaimed - membershipVerified === 1 ? "" : "s"} were claimed but never verified.`,
    );

  if (hasTracks && bothCount > 0)
    participants.observations.push(
      `${bothCount} participant${bothCount === 1 ? "" : "s"} joined both the board-game floor and the Speed Scrabble competition.`,
    );

  /* ---- Performance ------------------------------------------------------ */

  const performance: ReportSection = {
    page: "performance",
    title: "Tournament Performance",
    metrics: [
      {
        label: "Rounds completed",
        value: `${input.play.roundsCompleted} of ${input.rounds}`,
      },
      {
        label: "Boards verified",
        value: `${input.play.boardsVerified} of ${input.play.boardsTotal}`,
        sub: pct(input.play.boardsVerified, input.play.boardsTotal),
        caveat: "Unverified boards are excluded from every figure below.",
      },
      { label: "Average score", value: String(Math.round(input.play.averageScore)) },
      { label: "Highest score", value: String(input.play.highestScore) },
      {
        label: "Average spread",
        value:
          input.play.averageSpread > 0
            ? `+${Math.round(input.play.averageSpread)}`
            : String(Math.round(input.play.averageSpread)),
      },
      {
        label: "Score conflicts",
        value: String(input.play.conflicts),
        tone: input.play.conflicts > 0 ? "warning" : "positive",
      },
    ],
    tables: [],
    observations: [],
  };

  const unverified = input.play.boardsTotal - input.play.boardsVerified;
  if (unverified > 0)
    performance.observations.push(
      `${unverified} board${unverified === 1 ? "" : "s"} finished without a verified result.`,
    );
  if (input.play.roundsCompleted < input.rounds)
    performance.observations.push(
      `${input.rounds - input.play.roundsCompleted} scheduled round${input.rounds - input.play.roundsCompleted === 1 ? "" : "s"} did not take place.`,
    );

  /* ---- Financial --------------------------------------------------------- */

  const financial: ReportSection = {
    page: "financial",
    title: "Financial Performance",
    metrics: [
      {
        label: "Expected fee revenue",
        value: money(input.fees.expected, input.currency),
        sub: "collected, pending and unpaid",
      },
      {
        label: "Verified revenue",
        value: money(input.fees.collected, input.currency),
        caveat: "The only figure that counts as money received.",
        tone: "positive",
      },
      {
        label: "Awaiting verification",
        value: money(input.fees.pendingVerification, input.currency),
        tone: input.fees.pendingVerification > 0 ? "warning" : "neutral",
      },
      {
        label: "Discounts given",
        value: money(input.fees.discountGiven, input.currency),
        sub: `${input.fees.complimentaryCount} complimentary entries`,
      },
      { label: "Expenses paid", value: money(input.expenses.paid, input.currency) },
      {
        label: "Committed but unpaid",
        value: money(input.expenses.committed, input.currency),
      },
      {
        label: "Projected profit",
        value: money(input.position.projectedProfit, input.currency),
        sub: `${input.position.margin}% margin`,
        tone: input.position.projectedProfit >= 0 ? "positive" : "negative",
      },
      {
        label: "Worst case",
        value: money(input.position.worstCaseProfit, input.currency),
        caveat: "Nothing further collected, every commitment honoured.",
        tone: input.position.worstCaseProfit >= 0 ? "positive" : "negative",
      },
    ],
    tables: [
      {
        title: "Expenses by category",
        rows: input.expenses.byCategory.map((c) => ({
          label: c.category,
          count: c.amount,
          share: c.share,
        })),
      },
    ],
    observations: [],
  };

  if (input.fees.outstanding > 0)
    financial.observations.push(
      `${money(input.fees.outstanding, input.currency)} in fees was never submitted.`,
    );
  if (input.expenses.planned > 0)
    financial.observations.push(
      `${money(input.expenses.planned, input.currency)} remains planned but uncommitted.`,
    );

  /* ---- Communication ------------------------------------------------------ */

  const communication: ReportSection = {
    page: "communication",
    title: "Certificates and Communication",
    metrics: [
      { label: "Certificates prepared", value: String(input.certificates.prepared) },
      {
        label: "Issued",
        value: String(input.certificates.issued),
        sub: pct(input.certificates.issued, input.certificates.prepared),
      },
      {
        label: "Withdrawn",
        value: String(input.certificates.withdrawn),
        caveat: "Withdrawn certificates remain verifiable and report their status.",
        tone: input.certificates.withdrawn > 0 ? "warning" : "neutral",
      },
      { label: "Notifications sent", value: String(input.notifications.sent) },
      {
        label: "Delivery failures",
        value: String(input.notifications.failed),
        tone: input.notifications.failed > 0 ? "warning" : "positive",
      },
    ],
    tables: [],
    observations: [],
  };

  const undelivered = input.certificates.prepared - input.certificates.issued;
  if (undelivered > 0)
    communication.observations.push(
      `${undelivered} prepared certificate${undelivered === 1 ? "" : "s"} ${undelivered === 1 ? "was" : "were"} never issued.`,
    );
  if (input.notifications.failed > 0)
    communication.observations.push(
      `${input.notifications.failed} notification${input.notifications.failed === 1 ? "" : "s"} failed to deliver.`,
    );

  return [executive, participants, performance, financial, communication];
}

/* -------------------------------------------------------------------------- */
/* Document                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReportDocument {
  title: string;
  eventName: string;
  organizer: string;
  subtitle: string;
  generatedAt: string;
  generatedBy: string;
  sections: ReportSection[];
}

/** Assembles the full document, ready to render or print. */
export function buildDocument(input: ReportInput): ReportDocument {
  return {
    title: "Tournament Report",
    eventName: input.eventName,
    organizer: input.organizer,
    subtitle: `${input.venue}, ${input.city} · ${input.startDate}`,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    sections: buildReport(input),
  };
}
