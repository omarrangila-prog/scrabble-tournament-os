/**
 * Public events, registration forms and secure access tokens.
 *
 * Extends the existing identity/registration domain with the pieces a director
 * needs to open registration to the public: an event definition, a form the
 * director builds themselves, and signed tokens that let a participant act
 * without an account and without ever seeing an internal record id.
 */

import { PaymentMethod, PlayerCategory } from "./identity";
import { ParticipationTrack } from "../firebase/schema";
import { Rate } from "./pricing";

/* -------------------------------------------------------------------------- */
/* Event lifecycle                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Event state drives what the public QR opens, which participant actions are
 * available, and which organizer controls are enabled.
 */
export type EventState =
  | "draft"
  | "registration-open"
  | "registration-closed"
  | "preparing"
  | "check-in-open"
  | "check-in-closed"
  | "round-published"
  | "round-active"
  | "result-entry"
  | "break"
  | "final-review"
  | "completed"
  | "archived";

export const EVENT_STATE_LABEL: Record<EventState, string> = {
  draft: "Draft",
  "registration-open": "Registration Open",
  "registration-closed": "Registration Closed",
  preparing: "Preparing Event",
  "check-in-open": "Check-in Open",
  "check-in-closed": "Check-in Closed",
  "round-published": "Pairings Published",
  "round-active": "Round Active",
  "result-entry": "Result Entry Open",
  break: "Break",
  "final-review": "Final Results Review",
  completed: "Completed",
  archived: "Archived",
};

/** Where the phase-aware event QR sends a participant in each state. */
export const STATE_DESTINATION: Record<EventState, string> = {
  draft: "closed",
  "registration-open": "register",
  "registration-closed": "closed",
  preparing: "closed",
  "check-in-open": "check-in",
  "check-in-closed": "pairing",
  "round-published": "pairing",
  "round-active": "pairing",
  "result-entry": "submit-result",
  break: "standings",
  "final-review": "standings",
  completed: "results",
  archived: "results",
};

/* -------------------------------------------------------------------------- */
/* Registration form                                                           */
/* -------------------------------------------------------------------------- */

export type FieldKind =
  | "text"
  | "email"
  | "phone"
  | "date"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "textarea"
  | "file"
  | "heading"
  | "paragraph"
  | "consent";

export interface FormField {
  id: string;
  kind: FieldKind;
  label: string;
  /** Helper text shown beneath the control. */
  hint?: string;
  placeholder?: string;
  required: boolean;
  /** Choices for select / radio / checkbox. */
  options?: string[];
  /** Maps this field onto a known applicant property, when it is a core field. */
  mapsTo?: string;
  /** Core fields cannot be deleted — the tournament cannot run without them. */
  locked?: boolean;
  /** Shows this field only when another field holds a given value. */
  showWhen?: { fieldId: string; equals: string };
}

export interface RegistrationForm {
  id: string;
  eventId: string;
  title: string;
  intro: string;
  fields: FormField[];
  /** Shown above the submit button, alongside the fee breakdown. */
  paymentInstructions: string;
  termsText: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Discounts                                                                   */
/* -------------------------------------------------------------------------- */

export type DiscountKind = "percentage" | "fixed" | "free-entry";

export interface Discount {
  id: string;
  eventId: string;
  code: string;
  label: string;
  kind: DiscountKind;
  /** Percent (0-100) for percentage, currency amount for fixed. */
  value: number;
  /** Complimentary games granted alongside the discount. */
  freeGames?: number;
  expiresAt?: string;
  /** Zero means unlimited. */
  maxRedemptions: number;
  redemptions: number;
  active: boolean;
  campaign?: string;
}

/** Fee after any discount, with the arithmetic shown so it can be displayed. */
export interface FeeBreakdown {
  baseFee: number;
  discountLabel?: string;
  discountAmount: number;
  amountDue: number;
  freeGames: number;
  currency: string;
}

/**
 * Computes the amount due. Deterministic and rounded to whole currency units —
 * this figure is shown to the participant and must match what a reviewer sees.
 */
export function computeFee(
  baseFee: number,
  currency: string,
  discount?: Discount | null,
): FeeBreakdown {
  if (!discount || !discount.active) {
    return { baseFee, discountAmount: 0, amountDue: baseFee, freeGames: 0, currency };
  }

  let discountAmount = 0;
  if (discount.kind === "free-entry") discountAmount = baseFee;
  else if (discount.kind === "percentage")
    discountAmount = Math.round((baseFee * Math.min(100, Math.max(0, discount.value))) / 100);
  else discountAmount = Math.min(baseFee, Math.max(0, discount.value));

  return {
    baseFee,
    discountLabel: discount.label,
    discountAmount,
    amountDue: Math.max(0, baseFee - discountAmount),
    freeGames: discount.freeGames ?? 0,
    currency,
  };
}

/* -------------------------------------------------------------------------- */
/* Event                                                                       */
/* -------------------------------------------------------------------------- */

export interface PublicEvent {
  id: string;
  organizationId: string;
  /** URL segment, e.g. "karachi-scrabble-sunday-2026". */
  slug: string;

  name: string;
  shortDescription: string;
  description: string;
  bannerCaption: string;

  organizer: string;
  venueName: string;
  address: string;
  city: string;
  mapsUrl?: string;

  startDate: string;
  startTime: string;
  expectedFinish: string;
  timeZone: string;

  contactPhone: string;
  contactEmail: string;

  visibility: "public" | "private";
  capacity: number;

  registrationOpensAt: string;
  registrationClosesAt: string;
  fee: number;
  currency: string;
  paymentMethods: PaymentMethod[];
  bankDetails: string;
  walletDetails: string;
  waitingList: boolean;

  rounds: number;
  roundMinutes: number;
  breakMinutes: number;
  divisions: PlayerCategory[];

  prizes: { place: string; award: string }[];

  /** Shown under the event name, e.g. "An Evening of Board Games & Speed Scrabble". */
  subtitle?: string;

  /**
   * Organizations presenting the event together.
   *
   * Distinct from `organizer`, which is who operates the platform. A
   * collaborator lends its name to the event without running it, and
   * conflating the two renames the event after one of its partners.
   */
  collaborators?: string[];

  /**
   * How the time is written publicly, e.g. "5:00 PM onwards".
   *
   * Kept separate from `startTime` because a poster may state an opening time
   * without a close, and inventing a finish to fill the field would put a time
   * on the public page that nobody committed to.
   */
  timeDisplay?: string;

  /** Which tracks a participant may choose. */
  participationTracks?: ParticipationTrack[];

  /**
   * The rates this event offers.
   *
   * Each event prices itself: the two live events already differ in both the
   * amounts and which tiers exist at all. A participant qualifying for several
   * pays the cheapest, never a stack.
   */
  rates?: Rate[];

  /**
   * Percentage off for a verified Alliance Française member.
   *
   * The reduction is shown from the moment it is claimed, so the participant
   * sees the fee they expect, but it is not counted as settled until someone
   * has checked the membership number.
   */
  memberDiscountPercent?: number;
  /** The membership body the discount belongs to. */
  memberDiscountBody?: string;

  /**
   * Details the poster did not confirm.
   *
   * Listed rather than guessed. Each one blocks publication until the organizer
   * supplies it, because a public page stating an invented capacity or deadline
   * is worse than one that omits it.
   */
  unconfirmed?: string[];

  /**
   * The tournament whose games back this event, once play has begun.
   *
   * Registration and play are separate records: an event exists from the moment
   * it is created, but its games only exist once a tournament is set up for it.
   * Undefined means no results exist yet — which is a normal state, not an
   * error, and must read as "nothing to report" rather than being filled in
   * from whatever tournament happens to be loaded.
   */
  tournamentId?: string;

  state: EventState;
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
}

/** Whether the public page should accept new registrations right now. */
export function registrationStatusOf(
  event: PublicEvent,
  registrationCount: number,
  now = new Date(),
): {
  open: boolean;
  label: string;
  detail: string;
  tone: "success" | "warning" | "critical" | "neutral";
} {
  if (event.state === "draft")
    return {
      open: false,
      label: "Registration Not Open",
      detail: "This event has not been published yet.",
      tone: "neutral",
    };

  if (event.state !== "registration-open")
    return {
      open: false,
      label: "Registration Closed",
      detail: "Registration for this event has closed.",
      tone: "neutral",
    };

  /*
   * Capacity 0 means no limit has been set yet, not a full event. Without this
   * an uncapped event reports "full" from its very first entrant, because
   * 0 >= 0 holds.
   */
  const capped = event.capacity > 0;

  if (capped && registrationCount >= event.capacity) {
    return event.waitingList
      ? {
          open: true,
          label: "Waiting List Open",
          detail: `The event is full at ${event.capacity} players. New entries join the waiting list.`,
          tone: "warning",
        }
      : {
          open: false,
          label: "Registration Full",
          detail: `All ${event.capacity} places have been taken.`,
          tone: "critical",
        };
  }

  const closes = new Date(event.registrationClosesAt);
  const daysLeft = Math.ceil((closes.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft <= 3 && daysLeft > 0)
    return {
      open: true,
      label: "Registration Closing Soon",
      detail: capped
        ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · ${event.capacity - registrationCount} places remaining.`
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to register.`,
      tone: "warning",
    };

  return {
    open: true,
    label: "Registration Open",
    detail: capped
      ? `${event.capacity - registrationCount} of ${event.capacity} places remaining.`
      : `${registrationCount} registered so far.`,
    tone: "success",
  };
}

/* -------------------------------------------------------------------------- */
/* Secure tokens                                                               */
/* -------------------------------------------------------------------------- */

export type TokenKind =
  | "event"
  | "participant"
  | "check-in"
  | "board"
  | "result"
  | "certificate";

export interface QrToken {
  /** Opaque public value. Never a database id. */
  token: string;
  kind: TokenKind;
  eventId: string;
  /** Internal record this token resolves to; never sent to the browser URL. */
  subjectId?: string;
  issuedAt: string;
  expiresAt?: string;
  revoked: boolean;
}

const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generates an opaque token.
 *
 * Uses the platform CSPRNG where available so tokens are not guessable from a
 * timestamp. Ambiguous characters (0/O, 1/I/L) are excluded so a token can be
 * read aloud or typed from a printed sheet without error.
 */
export function generateToken(length = 12): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

/** Builds a URL-safe slug from an event name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* -------------------------------------------------------------------------- */
/* Share assets                                                                */
/* -------------------------------------------------------------------------- */

export interface ShareAssets {
  publicUrl: string;
  registerUrl: string;
  /** Short, shareable form of the registration link. */
  shortUrl: string;
  liveUrl: string;
  whatsappText: string;
  emailSubject: string;
  emailBody: string;
}

export function buildShareAssets(event: PublicEvent, origin: string): ShareAssets {
  const publicUrl = `${origin}/events/${event.slug}`;
  const registerUrl = `${publicUrl}/register`;

  /*
   * The short link drops the date suffix: "game-on-8-august" becomes "game-on".
   * It is what goes on a poster and into a message, where a long URL wraps and
   * gets mistyped. The canonical link still works and is what the browser
   * settles on after the redirect.
   */
  const MONTHS =
    "january|february|march|april|may|june|july|august|september|october|november|december";
  // Month names specifically, so "round-2-qualifier" is not mistaken for a date
  // and shortened to "round".
  const shortSlug = event.slug.replace(new RegExp(`-\\d{1,2}-(?:${MONTHS})$`, "i"), "");
  const shortUrl = `${origin}/go/${shortSlug}`;
  const liveUrl = `${origin}/live/${event.slug}`;

  const money = `${event.currency} ${event.fee.toLocaleString("en-PK")}`;
  const when = `${event.startDate} · ${event.startTime}`;

  return {
    publicUrl,
    registerUrl,
    shortUrl,
    liveUrl,
    whatsappText: [
      `*${event.name}*`,
      "",
      `📅 ${when}`,
      `📍 ${event.venueName}, ${event.city}`,
      `🎟️ Entry ${money}`,
      `♟️ ${event.rounds} rounds · ${event.divisions.length} divisions`,
      "",
      "Register here:",
      registerUrl,
    ].join("\n"),
    emailSubject: `${event.name} — registration is open`,
    emailBody: [
      `${event.name}`,
      "",
      event.shortDescription,
      "",
      `Date: ${when}`,
      `Venue: ${event.venueName}, ${event.address}, ${event.city}`,
      `Entry fee: ${money}`,
      `Format: ${event.rounds} rounds`,
      `Divisions: ${event.divisions.join(", ")}`,
      "",
      `Register: ${registerUrl}`,
      "",
      `Questions? ${event.contactEmail} · ${event.contactPhone}`,
      "",
      event.organizer,
    ].join("\n"),
  };
}

/* -------------------------------------------------------------------------- */
/* Default form                                                                */
/* -------------------------------------------------------------------------- */

/** The starting form a director edits. Core fields are locked. */
export function defaultForm(eventId: string): RegistrationForm {
  const f = (
    id: string,
    kind: FieldKind,
    label: string,
    extra: Partial<FormField> = {},
  ): FormField => ({ id, kind, label, required: true, ...extra });

  return {
    id: `form-${eventId}`,
    eventId,
    title: "Player registration",
    intro: "Complete this form to enter the tournament. It takes about two minutes.",
    fields: [
      f("h-about", "heading", "About you", { required: false }),
      f("fullName", "text", "Full name", { mapsTo: "fullName", locked: true, placeholder: "As it should appear on your certificate" }),
      f("email", "email", "Email address", { mapsTo: "email", locked: true, hint: "Your confirmation and certificate are sent here." }),
      f("phone", "phone", "Mobile number", { mapsTo: "mobile", locked: true, placeholder: "+92 300 0000000" }),
      f("dob", "date", "Date of birth", { mapsTo: "dateOfBirth", locked: true }),
      f("city", "text", "City", { mapsTo: "city", locked: true }),
      f("club", "text", "School, club or organization", { mapsTo: "club", required: false }),

      f("h-play", "heading", "Your Scrabble experience", { required: false }),
      f("experience", "select", "How long have you played competitively?", {
        mapsTo: "experience",
        options: ["Never played a tournament", "Under 1 year", "1–3 years", "3–5 years", "More than 5 years"],
      }),
      f("rating", "number", "Official rating, if you have one", {
        required: false,
        hint: "PSA, WESPA or another recognised rating. Leave blank if unrated.",
      }),
      f("division", "select", "Preferred playing level", {
        mapsTo: "category",
        options: ["Beginner", "Recreational", "Advanced", "Masters"],
        hint: "Your preferred level is a request. Final placement is confirmed using tournament history, rating and organizer approval.",
      }),
      f("previousEvents", "textarea", "Previous tournaments played", { required: false }),

      f("h-guardian", "heading", "Guardian details", { required: false }),
      f("guardianName", "text", "Guardian name", {
        required: false,
        hint: "Required for players under 18.",
      }),
      f("guardianPhone", "phone", "Guardian contact number", { required: false }),

      f("h-pay", "heading", "Payment", { required: false }),
      f("paymentMethod", "radio", "How are you paying?", {
        mapsTo: "paymentMethod",
        locked: true,
        options: ["Bank transfer", "EasyPaisa", "JazzCash", "Cash at venue"],
      }),
      f("reference", "text", "Transaction reference", {
        required: false,
        hint: "The reference number shown on your transfer receipt.",
      }),
      f("receipt", "file", "Payment receipt", {
        required: false,
        hint: "A screenshot or photo of your payment confirmation.",
      }),

      f("consent", "consent", "I agree to the tournament rules and code of conduct", {
        locked: true,
      }),
    ],
    paymentInstructions:
      "Transfer the amount shown above, then upload your receipt. Your place is confirmed once the organizer verifies the payment.",
    termsText:
      "Players are expected to arrive fifteen minutes before the first round, follow the official word list, and accept the Tournament Director's rulings as final.",
    updatedAt: new Date().toISOString(),
  };
}
