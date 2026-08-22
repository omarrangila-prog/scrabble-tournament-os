"use client";

import type { ConfirmationPlayer } from "@/lib/domain/confirmation";
import { supabase } from "./client";

/**
 * Reading and answering a details confirmation, from a participant's own phone.
 *
 * Everything is keyed on the token their registration already carries — the same one behind
 * their personal check-in link. No account, and no database id in a URL.
 */

export async function confirmationGroup(
  eventId: string,
  token: string,
): Promise<ConfirmationPlayer[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("confirmation_group_by_token", {
    p_event_id: eventId,
    p_token: token.trim(),
  });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    number: String(r.out_number ?? ""),
    name: String(r.out_name ?? ""),
    age: String(r.out_age ?? ""),
    mobile: String(r.out_mobile ?? ""),
    email: String(r.out_email ?? ""),
    area: String(r.out_area ?? ""),
    division: String(r.out_division ?? ""),
    psa: String(r.out_psa ?? ""),
    mediaConsent: String(r.out_media_consent ?? ""),
    amount: r.out_amount === null ? null : Number(r.out_amount),
    paymentStatus: String(r.out_payment_status ?? ""),
    paymentMethod: String(r.out_payment_method ?? ""),
    confirmedAt: (r.out_confirmed_at as string | null) ?? null,
    correction: String(r.out_correction ?? ""),
    isYou: Boolean(r.out_is_you),
  }));
}

export async function confirmDetails(
  eventId: string,
  token: string,
  number: string,
): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { data, error } = await db.rpc("confirm_details_by_token", {
    p_event_id: eventId,
    p_token: token.trim(),
    p_number: number,
  });
  return !error && data === "confirmed";
}

export async function requestCorrection(
  eventId: string,
  token: string,
  number: string,
  field: string,
  detail: string,
): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { data, error } = await db.rpc("request_correction_by_token", {
    p_event_id: eventId,
    p_token: token.trim(),
    p_number: number,
    p_field: field,
    p_detail: detail,
  });
  return !error && data === "recorded";
}
