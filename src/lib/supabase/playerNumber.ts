"use client";

import { supabase } from "./client";

/**
 * Player numbers, and the phone that remembers one.
 *
 * The number is short and public — 117, printed and announced. It says who somebody claims
 * to be. The last four digits of their mobile say it is actually them. Once both have been
 * given on a device, the token that comes back is kept, and that device never asks again for
 * the rest of the day.
 *
 * The token is the same secret behind a personal check-in link. Nothing else is stored: no
 * name, no phone, no payment. A phone left on a table shows a table number, not a person's
 * details.
 */

export const PLAYER_NUMBER_LENGTH = 3;

export interface PlayerSummary {
  /** "Abdul N." — enough to recognise, not enough to harvest. */
  maskedName: string;
  division: string;
  checkedIn: boolean;
  paymentStatus: string;
  amountDue: number | null;
}

/** Who a number belongs to. Null for any number nobody holds. */
export async function playerByNumber(
  eventId: string,
  number: string,
): Promise<PlayerSummary | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("player_by_number", {
    p_event_id: eventId,
    p_number: number.trim(),
  });

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as Record<string, unknown>;
  return {
    maskedName: String(row.out_masked_name ?? ""),
    division: String(row.out_division ?? ""),
    checkedIn: Boolean(row.out_checked_in),
    paymentStatus: String(row.out_payment_status ?? ""),
    amountDue: row.out_amount_due === null ? null : Number(row.out_amount_due),
  };
}

/**
 * Proves the number belongs to this person, returning their session token.
 *
 * Null for a wrong answer and for an unknown number alike — the caller shows one message for
 * both, so this cannot be used to work out which numbers exist.
 */
export async function claimPlayerNumber(
  eventId: string,
  number: string,
  lastFour: string,
): Promise<string | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("claim_player_number", {
    p_event_id: eventId,
    p_number: number.trim(),
    p_last_four: lastFour.trim(),
  });

  if (error || typeof data !== "string" || data === "") return null;
  return data;
}

/* -------------------------------------------------------------------------- */
/* The phone's memory                                                          */
/* -------------------------------------------------------------------------- */

const KEY = (eventId: string) => `blufy.player.${eventId}`;

interface Remembered {
  token: string;
  number: string;
}

/**
 * Remembers who this phone belongs to, for this event only.
 *
 * Scoped by event id so a phone used at two events does not carry one identity into the
 * other. Wrapped in try/catch because a browser in private mode throws rather than storing —
 * and a participant who cannot be remembered should simply be asked again, not shown an
 * error about storage.
 */
export function rememberPlayer(eventId: string, token: string, number: string): void {
  try {
    localStorage.setItem(KEY(eventId), JSON.stringify({ token, number }));
  } catch {
    /* Nothing to do: the next screen will ask for the number again. */
  }
}

export function rememberedPlayer(eventId: string): Remembered | null {
  try {
    const raw = localStorage.getItem(KEY(eventId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Remembered>;
    if (typeof parsed.token !== "string" || typeof parsed.number !== "string") return null;
    return { token: parsed.token, number: parsed.number };
  } catch {
    return null;
  }
}

/** For "not you?" — the one way a shared phone gets handed to the next person. */
export function forgetPlayer(eventId: string): void {
  try {
    localStorage.removeItem(KEY(eventId));
  } catch {
    /* Nothing to do. */
  }
}

/**
 * The number just assigned to a new registration.
 *
 * The trigger assigns it after the insert, so the browser that submitted the form does not
 * have it — and the confirmation page is the one place somebody is guaranteed to look.
 */
export async function playerNumberForToken(
  eventId: string,
  token: string,
): Promise<string | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("player_number_for_token", {
    p_event_id: eventId,
    p_token: token.trim(),
  });

  if (error || typeof data !== "string" || data === "") return null;
  return data;
}
