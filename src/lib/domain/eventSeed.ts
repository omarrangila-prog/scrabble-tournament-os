/**
 * The two real August 2026 events.
 *
 * Not demo data: these are the events the organizer is actually running, and
 * they start with no registrations at all. Entrants arrive from the public
 * form. Seeding invented ones would put fabricated names into the participant
 * list, the payment queue, and ultimately onto certificates that claim to be
 * evidence-based.
 */

import { defaultForm, Discount, PublicEvent, QrToken, RegistrationForm } from "./events";
import type { PaymentMethod } from "./identity";
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
 * The one set of accounts every event collects into.
 *
 * Defined once and shared rather than repeated per event. Two copies of an
 * account number drift the moment one is edited, and a form quoting a stale
 * account sends real money somewhere nobody is watching. Every registration
 * form reads these, so changing them here changes them everywhere.
 *
 * Transcribed from the organizer's registration document. Still worth checking
 * against a statement before money moves — one wrong digit in an IBAN is an
 * unrecoverable transfer.
 */
export const PAYMENT_ACCOUNTS = {
  methods: ["bank-transfer", "easypaisa"] as PaymentMethod[],
  bank:
    "Habib Metropolitan Bank · Huda Garib · 6-01-70-20311-714-140261 · IBAN PK66MPBL0170027140140261 · Khayaban-e-Shahbaz Branch",
  wallet: "0333 6665761 (Nida Khan)",
  /** Where participants send their screenshot if they cannot upload it. */
  receiptContact: "0300 8278594",
} as const;

/**
 * GAME ON!
 *
 * Built from the event poster plus what the organizer has since confirmed.
 * Anything neither source states is left empty and listed in `unconfirmed`,
 * which blocks publication until it is supplied — a public page carrying an
 * invented capacity or payment account is worse than one that admits the gap.
 *
 * The payment accounts came from the organizer directly, not from the poster:
 * both August events collect into the same HabibMetro and EasyPaisa accounts.
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

  // Same organizer contact as the August 23 event.
  contactPhone: "0300 8278594",
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

  rates: [
    { id: "standard", label: "Standard entry", amount: 1200, basis: "Everyone" },
    {
      id: "member",
      label: "Alliance Française member",
      amount: 1080,
      basis: "Members of Alliance Française de Karachi",
    },
  ],

  // Shared across every event — see PAYMENT_ACCOUNTS.
  paymentMethods: [...PAYMENT_ACCOUNTS.methods],
  bankDetails: PAYMENT_ACCOUNTS.bank,
  walletDetails: PAYMENT_ACCOUNTS.wallet,
  waitingList: true,

  participationTracks: ["board_games", "speed_scrabble", "both"],

  // Speed Scrabble format is not printed on the poster.
  rounds: 0,
  roundMinutes: 0,
  breakMinutes: 0,
  divisions: ["beginner", "recreational", "advanced", "masters"],

  unconfirmed: [
    "Registration deadline",
    "Maximum capacity",
    "Number of Speed Scrabble rounds",
    "Round duration",
    "Closing time",
    "Prize structure",
    "Refund policy",
    "Whether certificates are issued",
    "Contact email",
  ],

  // The poster announces no prizes. Carrying over the previous event's would
  // publish amounts nobody has committed to paying.
  prizes: [],

  /*
   * Open. The two blockers the setup checklist enforces — a payment method and
   * a receiving account — are both now supplied, so people can register and
   * pay. The items still in `unconfirmed` above are genuinely unknown but none
   * of them stops someone entering; they surface as gaps on the event page
   * rather than as a closed door.
   */
  state: "registration-open",
  createdAt: T("2026-07-28"),
  createdBy: "Sir Hani",
  publishedAt: T("2026-08-01"),
};

/**
 * Blufy's AlphaBattle — 23 August.
 *
 * A separate event from GAME ON!, at a different venue with different pricing.
 * Details come from the organizer's registration form.
 */
const ALPHABATTLE: PublicEvent = {
  id: "evt-alphabattle-23-august",
  organizationId: "org-federation",
  slug: "alphabattle-23-august",

  name: "Blufy's AlphaBattle",
  subtitle: "A fast-paced Scrabble showdown",

  shortDescription:
    "Five timed games and a song round. Newcomers, casual players and strategists all welcome.",
  description:
    "Whether you are a newcomer, a casual player or a strategy pro, join us for a fun, friendly word battle with good vibes. Five timed games of twenty minutes decide the top two in each category, with four songs to guess from twenty-second clips along the way.",
  bannerCaption: "A fast-paced Scrabble showdown",

  organizer: "Bluffy Alphabattle",
  collaborators: [],

  venueName: "Chai Chatt, Habitt City",
  address:
    "Street No. 3, Karachi Memon Co-operative Housing Society, P.E.C.H.S., Karachi",
  city: "Karachi",
  mapsUrl: "https://maps.app.goo.gl/xFEWE2Rr38GjaeScA",

  startDate: "2026-08-23",
  startTime: "12:00",
  expectedFinish: "15:30",
  timeDisplay: "12:00 PM to 3:30 PM",
  timeZone: "Asia/Karachi (PKT, UTC+5)",

  contactPhone: "0300 8278594",
  contactEmail: "",

  visibility: "public",
  capacity: 0,

  registrationOpensAt: T("2026-07-01"),
  registrationClosesAt: T("2026-08-23", "11:45"),

  fee: 1250,
  currency: "PKR",

  /*
   * Four rates. A participant qualifying for several pays the cheapest — three
   * PSA members registering together would otherwise stack their way down to
   * almost nothing.
   */
  rates: [
    { id: "standard", label: "Standard entry", amount: 1250, basis: "Everyone" },
    {
      id: "member",
      label: "PSA member",
      amount: 950,
      basis: "Members of the Pakistan Scrabble Association",
    },
    {
      id: "family",
      label: "Family rate",
      amount: 850,
      basis: "Three or more registering together",
      minGroupSize: 3,
    },
    {
      id: "early-bird",
      label: "Early bird",
      amount: 800,
      basis: "Until 9 August",
      availableUntil: "2026-08-09T23:59:59+05:00",
    },
  ],

  // Shared across every event — see PAYMENT_ACCOUNTS.
  paymentMethods: [...PAYMENT_ACCOUNTS.methods],
  bankDetails: PAYMENT_ACCOUNTS.bank,
  walletDetails: PAYMENT_ACCOUNTS.wallet,
  waitingList: true,

  // A Scrabble competition only. No board-game floor at this one.
  participationTracks: ["speed_scrabble"],

  rounds: 5,
  roundMinutes: 20,
  breakMinutes: 0,
  divisions: ["beginner", "recreational", "advanced"],

  prizes: [
    { place: "Winner, each category", award: "PKR 5,000" },
    { place: "Runner-up, each category", award: "PKR 2,000" },
    { place: "Winner of each guess-the-song", award: "PKR 1,000" },
  ],

  unconfirmed: ["Maximum capacity", "Contact email"],

  // Open: payment method and receiving account are both set.
  state: "registration-open",
  createdAt: T("2026-07-01"),
  createdBy: "Sir Hani",
};

/*
 * No seeded discount codes. The five that used to ship carried invented
 * redemption counts and read as though an organizer had created and used them.
 */
const DISCOUNTS: Discount[] = [];

export function buildEventSeed(): {
  events: PublicEvent[];
  forms: RegistrationForm[];
  discounts: Discount[];
  registrations: GuestRegistration[];
  tokens: QrToken[];
} {
  /*
   * Two events, each starting empty. Their registrations are the ones people
   * actually submit — seeding invented entrants would put fabricated names in
   * the participant list, the payment queue and eventually on certificates.
   */
  const events = [EVENT, ALPHABATTLE];
  const registrations: GuestRegistration[] = [];

  return {
    events,
    // Each event gets its own form: the questions differ between them.
    forms: events.map((e) => defaultForm(e.id)),
    discounts: DISCOUNTS,
    registrations,
    tokens: events.map((e) => ({
      token: e.id === EVENT.id ? "GAMEON8AUG" : "ALPHA23AUG",
      kind: "event" as const,
      eventId: e.id,
      issuedAt: e.publishedAt ?? e.createdAt,
      revoked: false,
    })),
  };
}
