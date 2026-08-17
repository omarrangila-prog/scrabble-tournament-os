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
/**
 * The one event this system is currently running.
 *
 * Exported so no screen has to repeat the string. It was written out by hand in
 * eleven files, which is eleven places to miss when the next event gets an id.
 */
export const ACTIVE_EVENT_ID = "evt-alphabattle-23-august";

/**
 * The tournament the active event is scored through.
 *
 * Kept beside the event id because they have to agree: the awards screen compares them
 * and quietly does nothing when they differ.
 */
export const TOURNAMENT_ID = "t-pnsc-2026";

export const PAYMENT_ACCOUNTS = {
  methods: ["bank-transfer", "easypaisa"] as PaymentMethod[],
  bank:
    "Habib Metropolitan Bank · Huda Garib · 6-01-70-20311-714-140261 · IBAN PK66MPBL0170027140140261 · Khayaban-e-Shahbaz Branch",
  wallet: "0333 6665761 (Nida Khan)",
  /** Where participants send their screenshot if they cannot upload it. */
  receiptContact: "0300 8278594",
} as const;

/**
 * The 23 August prices — the single source for every surface.
 *
 * PKR 1,250 is the figure on the organizer's own registration form, alongside
 * PSA 950 and Early Bird 800. GAME ON! charges 1,200; that is a different event,
 * not a competing figure for this one.
 *
 * Stated once because the same number was previously written into the event fee,
 * the rate table and the price rules independently. Three copies diverge the
 * moment one is edited, and the landing page then quotes a price the form does
 * not charge.
 */
export const ALPHABATTLE_PRICES = {
  base: 1250,
  psaMember: 950,
  hhs: 1000,
  kas: 850,
  earlyBird: 800,
  currency: "PKR",
  /** Early Bird closes at the end of this day. Extend it to reopen the offer. */
  earlyBirdUntil: "2026-08-09T23:59:59+05:00",
} as const;

/**
 * Blufy's AlphaBattle — 23 August.
 *
 * A separate event from GAME ON!, at a different venue with different pricing.
 * Details come from the organizer's registration form.
 */
const ALPHABATTLE: PublicEvent = {
  id: ACTIVE_EVENT_ID,
  organizationId: "org-federation",
  slug: "alphabattle-23-august",

  name: "Blufy's AlphaBattle",
  subtitle: "A fast-paced Scrabble showdown",

  shortDescription:
    "Five timed games and a song round. Newcomers, casual players and strategists all welcome.",
  description:
    "Whether you are a newcomer, a casual player or a strategy pro, join us for a fun, friendly word battle with good vibes. Five timed games of twenty minutes decide the top two in each category, with four songs to guess from twenty-second clips along the way.",
  bannerCaption: "A fast-paced Scrabble showdown",

  organizer: "Blufy's AlphaBattle",
  collaborators: [],

  venueName: "Chai Chatt, Habitt City",
  address:
    "Street No. 3, Karachi Memon Co-operative Housing Society, P.E.C.H.S., Karachi",
  city: "Karachi",
  mapsUrl: "https://maps.app.goo.gl/xFEWE2Rr38GjaeScA",

  /*
   * The tournament this event is scored and certified through.
   *
   * Absent until now, and the Certificate Studio checks it before doing anything: with
   * no link it reported "No tournament is linked to this event yet" and could not
   * prepare a single certificate. The award screen was therefore inert for the one event
   * the system runs — reachable, titled, and unable to produce the thing it exists for.
   */
  tournamentId: TOURNAMENT_ID,

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

  fee: ALPHABATTLE_PRICES.base,
  currency: ALPHABATTLE_PRICES.currency,

  /*
   * One rate: PKR 800.
   *
   * The early bird is delivered by the EARLYBIRD code rather than automatically
   * by date. With both in place everyone got 450 until 10 August whether they
   * knew the code or not, which left the code with nothing to do — the organizer
   * wants it to be the thing that reduces the price.
   *
   * The PSA member and family rates were removed earlier: both sat above 800, so
   * the engine would never have applied either and the questions behind them
   * would have changed nothing.
   */
  // Derived, so the rate table can never disagree with the price rules.
  rates: [
    {
      id: "standard",
      label: "Regular registration",
      amount: ALPHABATTLE_PRICES.base,
      basis: "Everyone",
    },
  ],

  /*
   * The prices the organizer set, in the order they apply.
   *
   * Regular is PKR 1,250 — the figure on the organizer's own registration form,
   * alongside PSA 950 and Early Bird 800. GAME ON! charges 1,200; that is a
   * different event and not a competing figure for this one.
   *
   * Early Bird is a coupon rather than a date-driven rate. Given automatically
   * by date it reduced the price for everyone whether they had the code or not,
   * which left the code with nothing to do.
   */
  priceRules: {
    regular: ALPHABATTLE_PRICES.base,
    regularLabel: "Regular registration",
    member: { price: ALPHABATTLE_PRICES.psaMember, label: "PSA Member" },
    coupons: [
      {
        code: "EARLYBIRD",
        label: "Early Bird",
        price: ALPHABATTLE_PRICES.earlyBird,
        /*
         * Today only, as instructed — the 9th, taken from the system clock
         * rather than from a date written in conversation. Extend this to
         * reopen the offer; the code is refused the moment it passes.
         */
        availableUntil: ALPHABATTLE_PRICES.earlyBirdUntil,
      },
      /*
       * PSA, as a code as well as a question.
       *
       * The form asks "Are you a PSA member?", and answering yes has always given the
       * member rate. But members were also typing PSA into the promotion box — the
       * obvious thing to try — and being told the code was not recognised while the fee
       * stayed at the regular price. Two ways of claiming the same rate, one of which
       * silently refused.
       *
       * Deliberately no `availableUntil`: PSA membership does not expire on a date, so
       * neither does the rate. It is the same PKR 950 the membership question gives, so
       * the two routes cannot disagree.
       */
      { code: "PSA", label: "PSA Member", price: ALPHABATTLE_PRICES.psaMember },
      { code: "HHS", label: "HHS Promotional Rate", price: ALPHABATTLE_PRICES.hhs },
      /*
       * No closing date, because none was set. Add `availableUntil` to close it — the code
       * is refused the moment it passes, the way EARLYBIRD is.
       */
      { code: "KAS", label: "KAS Promotional Rate", price: ALPHABATTLE_PRICES.kas },
    ],
    currency: ALPHABATTLE_PRICES.currency,
  },

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

  /*
   * What the fee covers, so it can be badged on the card rather than buried in
   * the description. Somebody comparing events should see it without reading.
   */
  highTeaIncluded: true,
  includedBenefits: [
    "Five timed games of twenty minutes",
    "Guess-the-song rounds",
    "Lunch and tea",
    "Prizes in every category",
  ],

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
/**
 * Promotion codes.
 *
 * EARLYBIRD is how the early bird is given: PKR 350 off the 800 entry, bringing
 * it to 450. There is no date-based early-bird rate, so this code is the only
 * route to the lower price and typing it changes the amount.
 *
 * It expires at the end of 10 August, so a code shared afterwards cannot reopen
 * a closed offer.
 */
const DISCOUNTS: Discount[] = [
  {
    id: "disc-alphabattle-earlybird",
    eventId: "evt-alphabattle-23-august",
    code: "EARLYBIRD",
    label: "Early bird",
    kind: "fixed",
    value: 350,
    expiresAt: "2026-08-10T23:59:59+05:00",
    maxRedemptions: 0,
    redemptions: 0,
    active: true,
  },
];

/**
 * The event itself, for anything that needs its facts outside the store.
 *
 * The share card draws the date, venue and city from here, so a change to the event
 * changes the image every person forwarding the link sees.
 */
export const ACTIVE_EVENT = ALPHABATTLE;

export function buildEventSeed(): {
  events: PublicEvent[];
  forms: RegistrationForm[];
  discounts: Discount[];
  registrations: GuestRegistration[];
  tokens: QrToken[];
} {
  /*
   * One active event: Blufy's AlphaBattle on 23 August.
   *
   * GAME ON! (8 August) has passed and is no longer in the active system. The
   * organizer should not have to pick an event on every visit, and stale details
   * from a finished evening should not be able to surface in a workspace, a
   * report or a certificate. The store still holds a list, so publishing the
   * next event needs no code change.
   *
   * Registrations start empty and are only the ones people actually submit —
   * seeding invented entrants would put fabricated names in the participant
   * list, the payment queue and eventually on certificates.
   */
  const events = [ALPHABATTLE];
  const registrations: GuestRegistration[] = [];

  return {
    events,
    // Each event gets its own form: the questions differ between them.
    forms: events.map((e) => defaultForm(e.id)),
    discounts: DISCOUNTS,
    registrations,
    tokens: events.map((e) => ({
      token: "ALPHA23AUG",
      kind: "event" as const,
      eventId: e.id,
      issuedAt: e.publishedAt ?? e.createdAt,
      revoked: false,
    })),
  };
}
