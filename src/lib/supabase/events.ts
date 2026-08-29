"use client";

import { supabase } from "./client";

/**
 * Events in the database.
 *
 * The old create-event form wrote to browser storage and said the event had been
 * created. Nothing could attach to it — registrations and games are rows keyed by an
 * event id in Postgres — so the button worked and the event did not.
 */

/** The details a public page needs, kept in the event's `data` document. */
export interface EventDetails {
  startDate: string;
  startTime?: string;
  endTime?: string;
  venueName?: string;
  venueAddress?: string;
  city?: string;
  fee?: number;
  currency?: string;
  capacity?: number;
  rounds?: number;
  roundMinutes?: number;
  /** Shown on the registration form when paying online. */
  paymentInstructions?: string;
  /** Shown on the registration form above the "I understand and agree" box. */
  terms?: string;
  /** The advertised rates and what the fee covers, shown on the registration page. */
  feeDetails?: string;
  /** A map link for the venue, so the address on the form is tappable. */
  mapsUrl?: string;
  /** `lat,lng` for the venue, so the map on the form pins the door and not the road. */
  mapCoords?: string;
}

export interface StoredEvent {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  state: string;
  visibility: string;
  status: string;
  details: EventDetails;
  createdAt: string;
}

export type CreateOutcome =
  | { ok: true; id: string; slug: string }
  | { ok: false; message: string };

const NEEDS_MIGRATION = "Creating events needs migration 0024 applied to the database.";

function missing(error: { message: string }): boolean {
  return error.message.toLowerCase().includes("could not find the function");
}

/**
 * Creates an event.
 *
 * Arrives as a draft and private, so naming one does not put it on the public site.
 * Opening registration is a separate, deliberate act once the date, fee and payment
 * details are right.
 */
export async function createEvent(input: {
  name: string;
  slug: string;
  subtitle: string;
  details: EventDetails;
}): Promise<CreateOutcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_create_event", {
    p_slug: input.slug,
    p_name: input.name,
    p_subtitle: input.subtitle,
    p_data: input.details,
  });

  if (error) {
    if (missing(error)) return { ok: false, message: NEEDS_MIGRATION };

    /*
     * The database's own refusals are the useful ones — a name with no letters, or a
     * link already in use. Passed through rather than flattened into "could not
     * create", which would leave the organizer guessing at which field to change.
     */
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row?.out_id) return { ok: false, message: "The event was not created." };

  return { ok: true, id: String(row.out_id), slug: String(row.out_slug) };
}

/** Every event, drafts included. Staff only, enforced in the database. */
export async function listEvents(): Promise<StoredEvent[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("staff_events");
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.out_id),
    slug: String(r.out_slug),
    name: String(r.out_name ?? ""),
    subtitle: (r.out_subtitle as string | null) ?? null,
    state: String(r.out_state ?? "draft"),
    visibility: String(r.out_visibility ?? "private"),
    status: String(r.out_status ?? "active"),
    details: (r.out_data as EventDetails | null) ?? { startDate: "" },
    createdAt: String(r.out_created_at ?? ""),
  }));
}

/** Puts an event on the public site, or takes it off. */
export async function setEventVisibility(
  eventId: string,
  visibility: "public" | "private",
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_event_visibility", {
    p_event_id: eventId,
    p_visibility: visibility,
  });

  if (error) {
    if (missing(error)) return { ok: false, message: NEEDS_MIGRATION };
    return { ok: false, message: "Could not change who can see this event." };
  }

  return { ok: true };
}

/**
 * One published event, by the slug in its URL. No sign-in.
 *
 * Returns null for a draft and for an event that does not exist. The public pages need
 * exactly this: the details of something somebody was given a link to.
 */
export async function readPublicEvent(slug: string): Promise<StoredEvent | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("public_event_by_slug", { p_slug: slug });
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const r = data[0] as Record<string, unknown>;
  return {
    id: String(r.out_id ?? ""),
    slug: String(r.out_slug ?? ""),
    name: String(r.out_name ?? ""),
    subtitle: (r.out_subtitle as string | null) ?? null,
    state: String(r.out_state ?? "draft"),
    visibility: "public",
    status: "active",
    details: (r.out_data ?? {}) as EventDetails,
    createdAt: "",
  };
}
