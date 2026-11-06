"use client";

/**
 * The sign-ups for a hosted event that takes ordinary registrations, read through
 * `host_registrations`, which answers for staff and for the event's host and nobody else.
 * See `0099_scrabble_and_arts_22_nov.sql`.
 */

import type { StoredProof } from "./paymentProof";

import { supabase } from "./client";

export interface HostRegistration {
  id: string;
  fullName: string;
  phone: string;
  /** What they signed up for, as the event words it: "Scrabble Tournament", a workshop. */
  activity: string;
  /** The Scrabble category, where they play. */
  category: string;
  paymentMethod: string;
  paymentStatus: string;
  /** 0 means the price has not been announced, not that it is free. */
  amountDue: number;
  currency: string;
  proof: StoredProof | null;
  checkedIn: boolean;
  createdAt: string;
}

export async function listHostRegistrations(
  eventId: string,
): Promise<HostRegistration[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("host_registrations", {
    p_event_id: eventId,
  });
  if (error || !Array.isArray(data)) {
    if (error) console.error("listHostRegistrations", error);
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => {
    const d = (row.out_data ?? {}) as Record<string, unknown>;
    const answers = (d.answers ?? {}) as Record<string, unknown>;
    const proof = d.paymentProof;
    return {
      id: String(row.out_id ?? ""),
      fullName: String(d.fullName ?? ""),
      phone: String(d.mobile ?? ""),
      activity: String(answers.activity ?? ""),
      category: String(answers.scrabbleCategory ?? d.preferredDivision ?? ""),
      paymentMethod: String(d.paymentMethod ?? ""),
      paymentStatus: String(d.paymentStatus ?? ""),
      amountDue: Number(d.amountDue ?? 0),
      currency: String(d.currency ?? "PKR"),
      proof:
        proof && typeof proof === "object"
          ? (proof as unknown as StoredProof)
          : null,
      checkedIn: row.out_checked_in_at != null,
      createdAt: String(row.out_created_at ?? ""),
    };
  });
}
