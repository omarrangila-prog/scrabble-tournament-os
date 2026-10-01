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

import { eventTimeLine } from "./eventTime";
import { EVENT_STATE_LABEL, PublicEvent, EventState } from "./events";
import type { PlayerCategory } from "./identity";
import { promoCodesFrom } from "./pricing";
import { activityOptionsFrom } from "./registrationParticipants";

/*
 * Read off the label map rather than listed again.
 *
 * This file kept its own copy of the thirteen state names. Four more were added elsewhere
 * and this copy was not updated, so an event in `round-preview` or `result-review` read
 * back as `draft` — and a draft has no public page at all. The label map is typed
 * `Record<EventState, string>`, so the compiler keeps it complete and this cannot drift
 * again.
 */
function stateOf(value: string): EventState {
  return Object.hasOwn(EVENT_STATE_LABEL, value) ? (value as EventState) : "draft";
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
    /* Derived, so a stored finish time is actually shown. See `eventTime.ts`. */
    timeDisplay: eventTimeLine(d.startTime, d.endTime) || undefined,
    timeZone: "Asia/Karachi (PKT, UTC+5)",

    contactPhone: "",
    contactEmail: "",

    paymentInstructions: d.paymentInstructions,
    terms: d.terms,
    feeDetails: d.feeDetails,
    /*
     * The rate card, so a database event prices the same way a seeded one does. Without
     * this the registration form fell back to the single `fee` and a reduced rate the
     * organiser had set was charged at the regular price.
     */
    rates: d.rates,
    /*
     * What this event sells, where it sells more than Scrabble. Read rather than assumed:
     * the three Cafe Leap tickets used to be an array inside the registration form, keyed
     * off the event slug, so the prices a participant was charged could not be changed by
     * anybody running the event.
     */
    activities: activityOptionsFrom(d.activities),
    promoCodes: promoCodesFrom(d.promoCodes),
    mapsUrl: d.mapsUrl,
    mapCoords: d.mapCoords,

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
