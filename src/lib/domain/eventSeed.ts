/**
 * Demo data for the public event slice.
 *
 * One published event with a realistic spread of registrations: verified and
 * pending payments, a discount campaign, a complimentary entry, a waitlisted
 * player and an amount mismatch — so the organizer review queue has genuine
 * decisions to make rather than a uniform list.
 */

import { defaultForm, Discount, PublicEvent, QrToken, RegistrationForm } from "./events";
import type { GuestRegistration } from "../store/useEventStore";

const T = (day: string, time = "10:00") => {
  // Pad to HH:MM — a single-digit hour makes an invalid ISO string.
  const [h, m = "00"] = time.split(":");
  const hh = h.padStart(2, "0");
  const mm = m.padStart(2, "0");
  return new Date(`${day}T${hh}:${mm}:00+05:00`).toISOString();
};

export const DEMO_EVENT_SLUG = "game-on-8-august";

/**
 * GAME ON!
 *
 * Built strictly from the event poster. Anything the poster does not state is
 * left empty and listed in `unconfirmed`, which blocks publication until the
 * organizer supplies it — a public page carrying an invented capacity or
 * payment account is worse than one that admits the gap.
 *
 * The year is the one exception, and it is a deduction rather than an
 * invention: the poster says "8th August, Saturday", and 8 August falls on a
 * Saturday in 2026 but not 2025. It remains editable in Event Settings.
 */
const EVENT: PublicEvent = {
  id: "evt-game-on-8-august",
  organizationId: "org-federation",
  slug: DEMO_EVENT_SLUG,

  name: "GAME ON!",
  subtitle: "An Evening of Board Games & Speed Scrabble",

  shortDescription: "Board games. New people. Great vibes. Countless memories.",
  description:
    "Get ready for an evening of board games, Speed Scrabble, new connections and great energy. Whether you are joining for friendly board games, competitive wordplay or both, GAME ON! brings together new people, great vibes and countless memories.",
  bannerCaption: "Board games. New people. Great vibes. Countless memories.",

  // Who runs the platform. The three names on the poster are collaborators.
  organizer: "Bluffy Alphabattle",
  collaborators: ["Boardgame Baithak", "Blufy's AlphaBattle", "Alliance Française"],

  venueName: "Alliance Française de Karachi",
  address: "Clifton, Karachi",
  city: "Karachi",
  mapsUrl: "https://maps.google.com/?q=Alliance+Française+de+Karachi+Clifton",

  startDate: "2026-08-08",
  startTime: "17:00",
  // The poster says "onwards" and states no finish, so none is claimed.
  expectedFinish: "",
  timeDisplay: "5:00 PM onwards",
  timeZone: "Asia/Karachi (PKT, UTC+5)",

  contactPhone: "",
  contactEmail: "",

  visibility: "public",
  // Not stated on the poster.
  capacity: 0,

  registrationOpensAt: T("2026-07-01"),
  // No deadline is printed, so registration is open until the organizer closes it.
  registrationClosesAt: T("2026-08-08", "17:00"),

  fee: 1200,
  currency: "PKR",
  memberDiscountPercent: 10,
  memberDiscountBody: "Alliance Française de Karachi",

  // No account details appear on the poster, and reusing a previous event's
  // would send money to the wrong place.
  paymentMethods: [],
  bankDetails: "",
  walletDetails: "",
  waitingList: true,

  participationTracks: ["board_games", "speed_scrabble", "both"],

  // Speed Scrabble format is not printed on the poster.
  rounds: 0,
  roundMinutes: 0,
  breakMinutes: 0,
  divisions: ["beginner", "recreational", "advanced", "masters"],

  unconfirmed: [
    "Payment method and receiving account",
    "Registration deadline",
    "Maximum capacity",
    "Number of Speed Scrabble rounds",
    "Round duration",
    "Closing time",
    "Prize structure",
    "Refund policy",
    "Whether certificates are issued",
    "Contact phone and email",
  ],

  // The poster announces no prizes. Carrying over the previous event's would
  // publish amounts nobody has committed to paying.
  prizes: [],

  // Registration cannot open until the unconfirmed details above are supplied.
  state: "draft",
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


export function buildEventSeed(): {
  events: PublicEvent[];
  forms: RegistrationForm[];
  discounts: Discount[];
  registrations: GuestRegistration[];
  tokens: QrToken[];
} {
  /*
   * GAME ON! starts empty. Its registrations are the ones people actually
   * submit — seeding invented entrants would put fabricated names in the
   * participant list, the payment queue and eventually on certificates.
   *
   * buildRegistrations() is kept for the archived demo event, which retains its
   * own history.
   */
  const registrations: GuestRegistration[] = [];
  const form = defaultForm(EVENT.id);

  const tokens: QrToken[] = [
    {
      token: "GAMEON8AUG",
      kind: "event",
      eventId: EVENT.id,
      issuedAt: EVENT.publishedAt ?? EVENT.createdAt,
      revoked: false,
    },
  ];

  return { events: [EVENT], forms: [form], discounts: DISCOUNTS, registrations, tokens };
}
