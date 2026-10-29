"use client";

/**
 * Speed Pictionary entries, against the database.
 *
 * Written to their own collection, `pictionaryTeams`, which is the single thing keeping an entry
 * out of the Scrabble draw: everything that answers "who is playing" filters on
 * `collection = 'registrations'`. See `0094_pictionary_teams.sql` and
 * `0095_pictionary_individuals_and_pairs.sql`.
 *
 * Nothing throws at the caller. This runs at the end of a form somebody has just filled in on a
 * phone, and a screen that crashes loses what they typed.
 */

import type { StoredProof } from "./paymentProof";

import { supabase } from "./client";

export const PICTIONARY_TEAMS = "pictionaryTeams";
export const PICTIONARY_EVENT_ID = "evt-pictionary-22-nov-2026";
export const PICTIONARY_SLUG = "pictionary";

export interface StoredEntry {
  id: string;
  type: "individual" | "team";
  players: string[];
  ages: number[];
  phone: string;
  email: string;
  payment: string;
  paymentStatus: string;
  autoVerified: boolean;
  amountDue: number;
  currency: string;
  proof: StoredProof | null;
  createdAt: string;
}

/** How many spots are taken, in people, or null when that cannot be read. */
export async function countSpotsTaken(): Promise<number | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.rpc("pictionary_spots_taken", {
    p_slug: PICTIONARY_SLUG,
  });
  if (error || typeof data !== "number") return null;
  return data;
}

export type SaveOutcome =
  { ok: true } | { ok: false; message: string; full?: boolean };

export async function saveEntry(input: {
  organizationId: string;
  data: Record<string, unknown>;
}): Promise<SaveOutcome> {
  const db = supabase();
  if (!db)
    return { ok: false, message: "Registering is not available right now." };

  const { error } = await db.from("records").insert({
    collection: PICTIONARY_TEAMS,
    organization_id: input.organizationId,
    event_id: PICTIONARY_EVENT_ID,
    data: input.data,
    status: "active",
  });

  if (error) {
    /* The database's own refusals, which are written to be read. */
    if (/spots are taken/i.test(error.message)) {
      return {
        ok: false,
        full: true,
        message:
          "Sorry, the last spot was just taken. Nothing has been recorded.",
      };
    }
    if (/Only \d+ spot/i.test(error.message)) {
      return { ok: false, message: error.message };
    }
    if (/between \d+ and \d+ years old/i.test(error.message)) {
      return { ok: false, message: error.message };
    }
    /* Never show anybody a Postgres message. */
    console.error("saveEntry", error);
    return {
      ok: false,
      message: "We could not save your entry. Please try again.",
    };
  }
  return { ok: true };
}

/** Every entry, for the organisers. Staff only, decided in the database. */
export async function listEntries(): Promise<StoredEntry[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("pictionary_teams");
  if (error || !Array.isArray(data)) {
    if (error) console.error("listEntries", error);
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => {
    const d = (row.out_data ?? {}) as Record<string, unknown>;
    const proof = d.paymentProof;
    return {
      id: String(row.out_id ?? ""),
      type: d.entryType === "team" ? "team" : "individual",
      players: Array.isArray(d.players) ? d.players.map(String) : [],
      ages: Array.isArray(d.ages) ? d.ages.map(Number) : [],
      phone: String(d.phone ?? ""),
      email: String(d.email ?? ""),
      payment: String(d.payment ?? ""),
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

export async function setEntryPaid(
  id: string,
  paid: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase();
  if (!db)
    return { ok: false, message: "The database is not reachable right now." };
  const { error } = await db.rpc("staff_set_team_payment", {
    p_id: id,
    p_paid: paid,
    p_by: null,
  });
  if (error)
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  return { ok: true };
}

export async function removeEntry(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase();
  if (!db)
    return { ok: false, message: "The database is not reachable right now." };
  const { error } = await db.rpc("staff_remove_team", { p_id: id, p_by: null });
  if (error)
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  return { ok: true };
}
