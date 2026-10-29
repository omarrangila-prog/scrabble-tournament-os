"use client";

/**
 * Mafia Wars sign-ups, against the database.
 *
 * Written to their own collection, `mafiaRegistrations`, which is the single thing keeping a
 * sign-up out of the Scrabble draw. Read back only through `mafia_registrations`, which answers
 * for staff and for the event's host and nobody else. See `0096_mafia_wars_and_event_hosts.sql`.
 *
 * Nothing throws at the caller. This runs at the end of a form somebody has just filled in on a
 * phone, and a screen that crashes loses what they typed.
 */

import type { StoredProof } from "./paymentProof";

import { supabase } from "./client";

export const MAFIA_COLLECTION = "mafiaRegistrations";
export const MAFIA_EVENT_ID = "evt-mafia-wars-22-nov-2026";
export const MAFIA_SLUG = "mafia-wars";

export interface StoredMafiaEntry {
  id: string;
  fullName: string;
  age: number | null;
  phone: string;
  mediaConsent: boolean;
  paymentStatus: string;
  autoVerified: boolean;
  amountDue: number;
  currency: string;
  proof: StoredProof | null;
  createdAt: string;
}

export async function saveMafiaEntry(
  data: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase();
  if (!db)
    return { ok: false, message: "Signing up is not available right now." };

  const { error } = await db.from("records").insert({
    collection: MAFIA_COLLECTION,
    organization_id: "org-federation",
    event_id: MAFIA_EVENT_ID,
    data,
    status: "active",
  });

  if (error) {
    /* Never show anybody a Postgres message. */
    console.error("saveMafiaEntry", error);
    return {
      ok: false,
      message: "We could not save your sign-up. Please try again.",
    };
  }
  return { ok: true };
}

/** Every sign-up. Staff and this event's host only, decided in the database. */
export async function listMafiaEntries(
  eventId = MAFIA_EVENT_ID,
): Promise<StoredMafiaEntry[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("mafia_registrations", {
    p_event_id: eventId,
  });
  if (error || !Array.isArray(data)) {
    if (error) console.error("listMafiaEntries", error);
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => {
    const d = (row.out_data ?? {}) as Record<string, unknown>;
    const proof = d.paymentProof;
    const age = Number(d.age);
    return {
      id: String(row.out_id ?? ""),
      fullName: String(d.fullName ?? ""),
      age: Number.isFinite(age) ? age : null,
      phone: String(d.phone ?? ""),
      mediaConsent: d.mediaConsent === true,
      paymentStatus: String(d.paymentStatus ?? ""),
      autoVerified: d.autoVerified === true,
      amountDue: Number(d.amountDue ?? 0),
      currency: String(d.currency ?? "PKR"),
      proof:
        proof && typeof proof === "object"
          ? (proof as unknown as StoredProof)
          : null,
      createdAt: String(row.out_created_at ?? ""),
    };
  });
}

export interface HostedEvent {
  id: string;
  slug: string;
  name: string;
}

/** The events this signed-in account hosts. Empty for staff and for anybody else. */
export async function hostedEvents(): Promise<HostedEvent[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.rpc("host_events");
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.out_id ?? ""),
    slug: String(r.out_slug ?? ""),
    name: String(r.out_name ?? ""),
  }));
}
