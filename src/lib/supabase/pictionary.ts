"use client";

/**
 * Speed Pictionary teams, against the database.
 *
 * Written to their own collection, `pictionaryTeams`, which is the single thing keeping a team
 * out of the Scrabble draw: everything that answers "who is playing" filters on
 * `collection = 'registrations'`. See `0094_pictionary_teams.sql`.
 *
 * Nothing throws at the caller. This runs at the end of a form somebody has just filled in on a
 * phone, and a screen that crashes loses what they typed.
 */

import type { StoredProof } from "./paymentProof";

import { supabase } from "./client";

export const PICTIONARY_TEAMS = "pictionaryTeams";
export const PICTIONARY_EVENT_ID = "evt-pictionary-22-nov-2026";
export const PICTIONARY_SLUG = "pictionary";

export interface StoredTeam {
  id: string;
  teamName: string;
  players: string[];
  captainPhone: string;
  payment: string;
  paymentStatus: string;
  autoVerified: boolean;
  amountDue: number;
  currency: string;
  proof: StoredProof | null;
  createdAt: string;
}

/** How many team places are taken, or null when that cannot be read. */
export async function countTeams(): Promise<number | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.rpc("pictionary_team_count", {
    p_slug: PICTIONARY_SLUG,
  });
  if (error || typeof data !== "number") return null;
  return data;
}

export type SaveOutcome =
  { ok: true } | { ok: false; message: string; full?: boolean };

export async function saveTeam(input: {
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
    /* The database's own refusal when the last place went while this form was being filled. */
    if (/team places are taken/i.test(error.message)) {
      return {
        ok: false,
        full: true,
        message:
          "Sorry, the last team place was just taken. Nothing has been recorded.",
      };
    }
    /* Never show anybody a Postgres message. */
    console.error("saveTeam", error);
    return {
      ok: false,
      message: "We could not save your team. Please try again.",
    };
  }
  return { ok: true };
}

/** Every team, for the organisers. Staff only, decided in the database. */
export async function listTeams(): Promise<StoredTeam[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("pictionary_teams");
  if (error || !Array.isArray(data)) {
    if (error) console.error("listTeams", error);
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => {
    const d = (row.out_data ?? {}) as Record<string, unknown>;
    const proof = d.paymentProof;
    return {
      id: String(row.out_id ?? ""),
      teamName: String(d.teamName ?? ""),
      players: Array.isArray(d.players) ? d.players.map(String) : [],
      captainPhone: String(d.captainPhone ?? ""),
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

export async function setTeamPaid(
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

export async function removeTeam(
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
