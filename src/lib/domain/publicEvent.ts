/**
 * A database event, in the shape the public pages already read.
 *
 * The event page and the registration form resolve their slug against seed data held in
 * the browser. That worked for the one event written into the source, and meant an event
 * created through the organizer's own form had no public page and could take no
 * registrations — the row existed, the link went nowhere.
 *
 * This adapts a stored event to `PublicEvent` so both pages keep one code path. Where the
 * database holds less than the seed does, the field is left empty rather than filled with
 * a plausible value: an event with no prize list should show no prizes, not an invented
 * one, and a fee of nothing stated is not a fee of zero.
 */

import type { StoredEvent } from "@/lib/supabase/events";

import { PublicEvent, EventState } from "./events";
import type { PlayerCategory } from "./identity";

const EVENT_STATES: EventState[] = [
  "draft",
  "registration-open",
  "registration-closed",
  "preparing",
  "check-in-open",
  "check-in-closed",
  "round-published",
  "round-active",
  "result-entry",
  "break",
  "final-review",
  "completed",
  "archived",
];

function stateOf(value: string): EventState {
  return (EVENT_STATES as string[]).includes(value) ? (value as EventState) : "draft";
}

/**
 * The categories an event offers.
 *
 * Every event this system runs uses the same three, and they are what the form and the
 * standings are built around. A created event that named none would otherwise offer a
 * participant no category to enter.
 */
const DEFAULT_DIVISIONS: PlayerCategory[] = ["beginner", "recreational", "advanced"];

export function publicEventFromStored(stored: StoredEvent): PublicEvent {
  const d = stored.details;

  return {
    id: stored.id,
    organizationId: "org-federation",
    slug: stored.slug,

    name: stored.name,
    shortDescription: stored.subtitle ?? "",
    /*
     * No description is written rather than generated. A sentence assembled from the
     * date and venue reads like copy the organizer approved, and they did not.
     */
    description: "",
    bannerCaption: stored.subtitle ?? "",

    organizer: stored.name,
    venueName: d.venueName ?? "",
    address: d.venueAddress ?? "",
    city: d.city ?? "",

    startDate: d.startDate,
    startTime: d.startTime ?? "",
    expectedFinish: d.endTime ?? "",
    timeZone: "Asia/Karachi (PKT, UTC+5)",

    contactPhone: "",
    contactEmail: "",

    paymentInstructions: d.paymentInstructions,
    terms: d.terms,
    rateCard: d.rateCard,

    visibility: "public",
    /* Zero means no stated limit, the same as it does for the seeded event. */
    capacity: d.capacity ?? 0,

    /*
     * No separate registration window is recorded, so the phase is the only gate — which
     * is how the day is actually run: the director opens and closes registration.
     */
    registrationOpensAt: "",
    registrationClosesAt: "",

    fee: d.fee ?? 0,
    currency: d.currency ?? "PKR",
    paymentMethods: [],
    bankDetails: "",
    walletDetails: "",
    waitingList: false,

    rounds: d.rounds ?? 0,
    roundMinutes: d.roundMinutes ?? 0,
    breakMinutes: 0,
    divisions: DEFAULT_DIVISIONS,

    /* Nothing is promised that the organizer has not entered. */
    prizes: [],

    subtitle: stored.subtitle ?? undefined,
    participationTracks: ["speed_scrabble"],

    state: stateOf(stored.state),
    createdAt: stored.createdAt,
    /* Recorded against the organization, not a name the database does not keep. */
    createdBy: "",
  };
}
