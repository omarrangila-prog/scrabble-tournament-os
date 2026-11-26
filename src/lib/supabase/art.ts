"use client";

/**
 * Art Activity sign-ups, against the database. Their own collection, so they never reach the
 * Scrabble draw; read back only through `art_registrations`, which answers for staff. See 0103.
 * Nothing throws at the caller: this runs at the end of a form somebody filled in on a phone.
 */

import type { ArtActivity } from "@/lib/domain/art";

import type { StoredProof } from "./paymentProof";
import { supabase } from "./client";

export const ART_COLLECTION = "artRegistrations";
export const ART_EVENT_ID = "evt-art-activity-december-2026";
export const ART_SLUG = "art-december-2026";
export const ART_PATH = "/art/register";

export interface StoredArtEntry {
  id: string;
  receiptNo: string;
  fullName: string;
  age: number | null;
  phone: string;
  email: string;
  activities: ArtActivity[];
  payment: string;
  paymentStatus: string;
  autoVerified: boolean;
  amountDue: number;
  promoCode: string;
  promoAmountOff: number;
  proof: StoredProof | null;
  createdAt: string;
}

type Outcome = { ok: true } | { ok: false; message: string };

export async function saveArtEntry(data: Record<string, unknown>): Promise<Outcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "Registering is not available right now." };
  const { error } = await db.from("records").insert({
    collection: ART_COLLECTION,
    organization_id: "org-federation",
    event_id: ART_EVENT_ID,
    data,
    status: "active",
  });
  if (error) {
    console.error("saveArtEntry", error);
    return { ok: false, message: "We could not save your registration. Please try again." };
  }
  return { ok: true };
}

export async function listArtEntries(): Promise<StoredArtEntry[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.rpc("art_registrations");
  if (error || !Array.isArray(data)) {
    if (error) console.error("listArtEntries", error);
    return [];
  }
  return (data as Record<string, unknown>[]).map((row) => {
    const d = (row.out_data ?? {}) as Record<string, unknown>;
    const age = Number(d.age);
    const proof = d.paymentProof;
    return {
      id: String(row.out_id ?? ""),
      receiptNo: String(d.receiptNo ?? ""),
      fullName: String(d.fullName ?? ""),
      age: Number.isFinite(age) ? age : null,
      phone: String(d.phone ?? ""),
      email: String(d.email ?? ""),
      activities: (Array.isArray(d.activities) ? d.activities : []).filter(
        (a): a is ArtActivity => a === "canvas" || a === "tote",
      ),
      payment: String(d.payment ?? ""),
      paymentStatus: String(d.paymentStatus ?? ""),
      autoVerified: d.autoVerified === true,
      amountDue: Number(d.amountDue ?? 0),
      promoCode: String(d.promoCode ?? ""),
      promoAmountOff: Number(d.promoAmountOff ?? 0),
      proof: proof && typeof proof === "object" ? (proof as unknown as StoredProof) : null,
      createdAt: String(row.out_created_at ?? ""),
    };
  });
}

async function call(fn: string, args: Record<string, unknown>): Promise<Outcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };
  const { error } = await db.rpc(fn, args);
  return error ? { ok: false, message: error.message.replace(/^.*?:\s*/, "") } : { ok: true };
}

/** Whether this phone number may use the event's code. Yes or no; nothing else comes back. */
export async function artPromoEligible(phone: string): Promise<boolean | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.rpc("art_promo_eligible", { p_art_event_id: ART_EVENT_ID, p_phone: phone });
  if (error || typeof data !== "boolean") return null;
  return data;
}

export const setArtPaid = (id: string, paid: boolean) =>
  call("staff_set_art_payment", { p_id: id, p_paid: paid, p_by: null });
export const removeArtEntry = (id: string) => call("staff_remove_art", { p_id: id, p_by: null });
