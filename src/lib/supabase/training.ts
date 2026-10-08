"use client";

/**
 * Training signups, against the database.
 *
 * Written to their own collection, `trainingSignups`, which is the single thing keeping a
 * trainee out of the tournament. Everything that answers "who is playing" — the roster, the
 * pairing feed, the standings, the check-in report — filters on `collection = 'registrations'`,
 * so a signup stored here cannot reach a board no matter what its payload says. See
 * `0087_training_sessions_are_not_a_tournament.sql`.
 *
 * Nothing throws at the caller. This runs at the end of a form a parent has just filled in on
 * a phone, and a screen that crashes loses what they typed.
 */

import type { StoredProof } from "./paymentProof";

import { supabase } from "./client";

/** The collection. Deliberately not `registrations`. */
export const TRAINING_SIGNUPS = "trainingSignups";

/** The long-lived event every signup hangs off, created by migration 0087. */
export const TRAINING_EVENT_ID = "training-sessions";

/** The slug its public page is served at. */
export const TRAINING_SLUG = "training";

/** One signup, as it is stored and as the coach's list reads it back. */
export interface StoredTrainingSignup {
  id: string;
  fullName: string;
  yearOfBirth: string;
  age: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  preferredSlot: string;
  experience: string;
  payment: string;
  paymentStatus: string;
  amountDue: number;
  currency: string;
  proof: StoredProof | null;
  createdAt: string;
}

export async function saveTrainingSignup(input: {
  organizationId: string;
  data: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "Signing up is not available right now." };

  const { error } = await db.from("records").insert({
    collection: TRAINING_SIGNUPS,
    organization_id: input.organizationId,
    event_id: TRAINING_EVENT_ID,
    data: input.data,
    status: "active",
  });

  if (error) {
    /* Never show a parent a Postgres message. */
    console.error("saveTrainingSignup", error);
    return {
      ok: false,
      message: "We could not save your signup. Please try again.",
    };
  }
  return { ok: true };
}

/**
 * Every signup, for the coach.
 *
 * Staff only, decided in the database: the collection is not publicly readable, and the
 * function checks the caller is staff before it returns a row. A signup carries a child's name
 * and a parent's mobile number.
 */
export async function listTrainingSignups(): Promise<StoredTrainingSignup[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("training_signups");
  if (error || !Array.isArray(data)) {
    if (error) console.error("listTrainingSignups", error);
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => {
    const d = (row.out_data ?? {}) as Record<string, unknown>;
    const proof = d.paymentProof;

    return {
      id: String(row.out_id ?? ""),
      fullName: String(d.fullName ?? ""),
      yearOfBirth: String(d.yearOfBirth ?? ""),
      age: String(d.age ?? ""),
      phone: String(d.phone ?? ""),
      guardianName: String(d.guardianName ?? ""),
      guardianPhone: String(d.guardianPhone ?? ""),
      preferredSlot: String(d.preferredSlot ?? ""),
      experience: String(d.experience ?? ""),
      payment: String(d.payment ?? ""),
      paymentStatus: String(d.paymentStatus ?? ""),
      amountDue: Number(d.amountDue ?? 0),
      currency: String(d.currency ?? "PKR"),
      proof:
        proof && typeof proof === "object" ? (proof as unknown as StoredProof) : null,
      createdAt: String(row.out_created_at ?? ""),
    };
  });
}
