/**
 * Demo data for the public event slice.
 *
 * One published event with a realistic spread of registrations: verified and
 * pending payments, a discount campaign, a complimentary entry, a waitlisted
 * player and an amount mismatch — so the organizer review queue has genuine
 * decisions to make rather than a uniform list.
 */

import { defaultForm, Discount, generateToken, PublicEvent, QrToken, RegistrationForm } from "./events";
import type { GuestRegistration } from "../store/useEventStore";
import { rng } from "./seed";
import { FEMALE_FIRST, LAST, MALE_FIRST } from "./names";
import { PaymentMethod, PlayerCategory } from "./identity";

const T = (day: string, time = "10:00") => {
  // Pad to HH:MM — a single-digit hour makes an invalid ISO string.
  const [h, m = "00"] = time.split(":");
  const hh = h.padStart(2, "0");
  const mm = m.padStart(2, "0");
  return new Date(`${day}T${hh}:${mm}:00+05:00`).toISOString();
};

export const DEMO_EVENT_SLUG = "karachi-scrabble-sunday-2026";

const EVENT: PublicEvent = {
  id: "evt-karachi-sunday",
  organizationId: "org-federation",
  // The demo event's games live in the seeded tournament, so certificates and
  // standings have a real record to read from.
  tournamentId: "t-pnsc-2026",
  slug: DEMO_EVENT_SLUG,

  name: "Karachi Scrabble Sunday 2026",
  shortDescription:
    "A one-day rated tournament across four divisions, played over six rounds.",
  description:
    "Karachi Scrabble Sunday brings together players of every level for a friendly but seriously contested one-day event. Six rounds of tournament Scrabble, four divisions, and prizes in each. New players are genuinely welcome — the Beginner division exists for exactly that reason.",
  bannerCaption: "Six rounds · Four divisions · One Sunday",

  organizer: "Bluffy Alphabattle",
  venueName: "The Reading Room, Clifton",
  address: "Block 4, Clifton",
  city: "Karachi",
  mapsUrl: "https://maps.google.com/?q=Clifton+Karachi",

  startDate: "2026-09-13",
  startTime: "09:30",
  expectedFinish: "18:00",
  timeZone: "Asia/Karachi (PKT, UTC+5)",

  contactPhone: "+92 300 2345678",
  contactEmail: "play@bluffyalphabattle.pk",

  visibility: "public",
  capacity: 100,

  registrationOpensAt: T("2026-08-01"),
  registrationClosesAt: T("2026-09-10", "23:59"),
  fee: 2000,
  currency: "PKR",
  paymentMethods: ["bank-transfer", "easypaisa", "jazzcash", "cash"],
  bankDetails: "Meezan Bank · Bluffy Alphabattle · PK00 MEZN 0000 0012 3456 78",
  walletDetails: "EasyPaisa / JazzCash · 0300 2345678 (Bluffy Alphabattle)",
  waitingList: true,

  rounds: 6,
  roundMinutes: 45,
  breakMinutes: 15,
  divisions: ["beginner", "recreational", "advanced", "masters"],

  prizes: [
    { place: "Champion", award: "PKR 15,000" },
    { place: "Runner-up", award: "PKR 10,000" },
    { place: "Third place", award: "PKR 5,000" },
    { place: "Division winners", award: "PKR 3,000 each" },
    { place: "Highest single game", award: "PKR 2,000" },
    { place: "Best new player", award: "PKR 2,000" },
  ],

  state: "registration-open",
  createdAt: T("2026-07-28"),
  createdBy: "Sir Hani",
  publishedAt: T("2026-08-01"),
};

const DISCOUNTS: Discount[] = [
  {
    id: "disc-early",
    eventId: EVENT.id,
    code: "EARLYBIRD",
    label: "Early-bird discount",
    kind: "fixed",
    value: 300,
    maxRedemptions: 40,
    redemptions: 12,
    active: true,
    expiresAt: T("2026-08-20"),
    campaign: "Early registration",
  },
  {
    id: "disc-song",
    eventId: EVENT.id,
    code: "SONGCHALLENGE",
    label: "Instagram song challenge winner",
    kind: "fixed",
    value: 500,
    freeGames: 2,
    maxRedemptions: 1,
    redemptions: 1,
    active: true,
    campaign: "Instagram Song Challenge",
  },
  {
    id: "disc-school",
    eventId: EVENT.id,
    code: "SCHOOL25",
    label: "School group discount",
    kind: "percentage",
    value: 25,
    maxRedemptions: 0,
    redemptions: 6,
    active: true,
    campaign: "School outreach",
  },
  {
    id: "disc-comp",
    eventId: EVENT.id,
    code: "VOLUNTEER",
    label: "Complimentary entry — volunteer",
    kind: "free-entry",
    value: 0,
    maxRedemptions: 5,
    redemptions: 2,
    active: true,
    campaign: "Volunteer recognition",
  },
];

const CITIES = ["Karachi", "Hyderabad", "Lahore", "Sukkur", "Islamabad"];
const CLUBS = [
  "The City School",
  "Karachi Grammar School",
  "Beaconhouse Clifton",
  "Karachi Scrabble Club",
  "Sindh Word Guild",
  "Unaffiliated",
];
const EXPERIENCE = [
  "Never played a tournament",
  "Under 1 year",
  "1–3 years",
  "3–5 years",
  "More than 5 years",
];
const DIVISIONS: PlayerCategory[] = ["beginner", "recreational", "advanced", "masters"];
const METHODS: PaymentMethod[] = ["bank-transfer", "easypaisa", "jazzcash", "cash"];

/** 84 registrations against a 100-place event, with realistic status spread. */
function buildRegistrations(): GuestRegistration[] {
  const r = rng(90132026);
  const out: GuestRegistration[] = [];
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const int = (min: number, max: number) => Math.floor(r() * (max - min + 1)) + min;

  for (let i = 0; i < 84; i++) {
    const female = r() < 0.38;
    const first = female ? pick(FEMALE_FIRST) : pick(MALE_FIRST);
    const last = pick(LAST);
    const fullName = `${first} ${last}`;
    const division = pick(DIVISIONS);
    const method = pick(METHODS);

    // Discount distribution: mostly none, some early-bird and school.
    const roll = r();
    let discountCode: string | undefined;
    let discountAmount = 0;
    if (roll < 0.14) {
      discountCode = "EARLYBIRD";
      discountAmount = 300;
    } else if (roll < 0.21) {
      discountCode = "SCHOOL25";
      discountAmount = 500;
    } else if (roll < 0.23) {
      discountCode = "VOLUNTEER";
      discountAmount = 2000;
    }
    const amountDue = EVENT.fee - discountAmount;

    /*
     * Status mix chosen so the review queue is genuinely varied:
     * most approved and verified, a working tail of pending decisions.
     */
    let status: GuestRegistration["status"] = "approved";
    let paymentStatus: GuestRegistration["paymentStatus"] = "verified";
    const s = r();
    if (amountDue === 0) {
      paymentStatus = "complimentary";
    } else if (s < 0.14) {
      status = "submitted";
      paymentStatus = "receipt-uploaded";
    } else if (s < 0.2) {
      status = "under-review";
      paymentStatus = "review-required";
    } else if (s < 0.24) {
      status = "submitted";
      paymentStatus = "not-submitted";
    } else if (s < 0.26) {
      status = "under-review";
      paymentStatus = "amount-mismatch";
    }

    const submittedAt = T(`2026-08-${String(int(2, 28)).padStart(2, "0")}`, `${int(9, 21)}:${String(int(0, 59)).padStart(2, "0")}`);
    const hasReceipt = paymentStatus !== "not-submitted" && paymentStatus !== "complimentary";

    out.push({
      id: `reg-seed-${i + 1}`,
      token: generateToken(),
      eventId: EVENT.id,
      fullName,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      mobile: `+92 3${int(10, 49)} ${int(1000000, 9999999)}`,
      dateOfBirth: `${int(1985, 2012)}-0${int(1, 9)}-${String(int(10, 28))}`,
      city: pick(CITIES),
      club: pick(CLUBS),
      experience: pick(EXPERIENCE),
      selfRating: r() < 0.4 ? int(1100, 2050) : undefined,
      preferredDivision: division,
      previousEvents: r() < 0.5 ? "Sindh Open 2025, Regional Qualifier 2025" : undefined,
      answers: {},
      paymentMethod: method,
      paymentReference: hasReceipt ? `TXN${int(100000, 999999)}` : undefined,
      receiptFileName: hasReceipt ? `receipt-${first.toLowerCase()}.jpg` : undefined,
      amountDue,
      discountCode,
      discountAmount,
      currency: EVENT.currency,
      status,
      paymentStatus,
      confirmedDivision: status === "approved" ? division : undefined,
      submittedAt,
      reviewedAt: status === "approved" ? submittedAt : undefined,
      reviewedBy: status === "approved" ? "Sir Hani" : undefined,
      timeline: [{ at: submittedAt, by: fullName, entry: "Registration submitted." }],
    });
  }

  // One pinned identity so the guided demo always has a known participant.
  out[0] = {
    ...out[0],
    fullName: "Hunain Ahmed",
    email: "hunain@example.com",
    city: "Karachi",
    club: "Karachi Scrabble Club",
    preferredDivision: "advanced",
    confirmedDivision: "advanced",
    experience: "1–3 years",
    selfRating: 1580,
    discountCode: "SONGCHALLENGE",
    discountAmount: 500,
    amountDue: EVENT.fee - 500,
    paymentMethod: "easypaisa",
    paymentReference: "TXN884213",
    receiptFileName: "receipt-hunain.jpg",
    status: "approved",
    paymentStatus: "verified",
    timeline: [
      { at: T("2026-08-14", "11:02"), by: "Hunain Ahmed", entry: "Registration submitted." },
      { at: T("2026-08-14", "11:03"), by: "Hunain Ahmed", entry: "Payment receipt uploaded." },
      { at: T("2026-08-14", "16:20"), by: "Sir Hani", entry: "Payment verified — EasyPaisa reference matched." },
      { at: T("2026-08-14", "16:21"), by: "Sir Hani", entry: "Registration approved." },
    ],
  };

  return out;
}

export function buildEventSeed(): {
  events: PublicEvent[];
  forms: RegistrationForm[];
  discounts: Discount[];
  registrations: GuestRegistration[];
  tokens: QrToken[];
} {
  const registrations = buildRegistrations();
  const form = defaultForm(EVENT.id);

  const tokens: QrToken[] = [
    {
      token: "EVENTKARACHI",
      kind: "event",
      eventId: EVENT.id,
      issuedAt: EVENT.publishedAt ?? EVENT.createdAt,
      revoked: false,
    },
    ...registrations.map((reg) => ({
      token: reg.token,
      kind: "participant" as const,
      eventId: EVENT.id,
      subjectId: reg.id,
      issuedAt: reg.submittedAt,
      revoked: false,
    })),
  ];

  return { events: [EVENT], forms: [form], discounts: DISCOUNTS, registrations, tokens };
}
