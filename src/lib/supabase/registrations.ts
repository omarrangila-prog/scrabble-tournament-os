/**
 * Registrations and check-in, against the database.
 *
 * The pages used to read and write browser storage, which meant a registration
 * existed only on the phone that made it: the organizer never saw it, and
 * clearing the browser destroyed it. These functions put the real record in
 * Postgres.
 *
 * Every rule that decides an outcome — whether a code matches, whether somebody
 * has already arrived, whether a payment may pass — lives in a database function
 * rather than here. A check performed in the browser is a suggestion, and this
 * runs on a stranger's phone.
 *
 * Nothing throws at the caller. A registration screen that shows a message can
 * be retried; one that crashes loses whatever was typed.
 */

import { supabase, isSupabaseConfigured } from "./client";

export const REGISTRATIONS = "registrations";

/** What a participant may see about themselves before checking in. */
export interface CheckInSubject {
  token: string;
  fullName: string;
  playingLevel: string;
  registrationStatus: string;
  paymentStatus: string;
  amountDue: number;
  currency: string;
  checkedInAt: string | null;
}

export type CheckInResult =
  | { result: "checked_in"; fullName: string; at: string }
  | { result: "already_checked_in"; fullName: string; at: string }
  | { result: "not_found"; message: string }
  | { result: "blocked"; message: string };

/** True when the app is pointed at a database at all. */
export function usingDatabase(): boolean {
  return isSupabaseConfigured();
}

/* -------------------------------------------------------------------------- */
/* Writing a registration                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Stores one registration.
 *
 * `paymentStatus` is sent as the claim the participant actually made. The
 * database promotes a receipt-backed claim to verified itself; the browser is not
 * permitted to declare a payment received, and the insert policy refuses if it
 * tries.
 */
export async function saveRegistration(input: {
  eventId: string;
  organizationId: string;
  checkInCode: string;
  data: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "Registration is not available right now." };

  const { error } = await db.from("records").insert({
    collection: REGISTRATIONS,
    organization_id: input.organizationId,
    event_id: input.eventId,
    check_in_code: input.checkInCode,
    data: input.data,
    status: "active",
  });

  if (error) {
    // Never show a participant a Postgres message.
    console.error("saveRegistration", error);
    return {
      ok: false,
      message: "We could not save your registration. Please try again.",
    };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Check-in                                                                    */
/* -------------------------------------------------------------------------- */

type SubjectRow = {
  token: string;
  full_name: string;
  playing_level: string;
  registration_status: string;
  payment_status: string;
  amount_due: number;
  currency: string;
  checked_in_at: string | null;
};

const toSubject = (r: SubjectRow): CheckInSubject => ({
  token: r.token,
  fullName: r.full_name,
  playingLevel: r.playing_level,
  registrationStatus: r.registration_status,
  paymentStatus: r.payment_status,
  amountDue: Number(r.amount_due ?? 0),
  currency: r.currency ?? "PKR",
  checkedInAt: r.checked_in_at,
});

/**
 * Finds a participant by their six-digit code.
 *
 * The registrations table is not readable by an anonymous caller, so this goes
 * through a database function that returns only these fields and only for an
 * exact code. Without the code, nothing comes back — which is what stops the
 * check-in page being a way to enumerate who is attending.
 */
export async function findByCheckInCode(
  eventId: string,
  code: string,
): Promise<CheckInSubject | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("find_registration_for_checkin", {
    p_event_id: eventId,
    p_code: code,
  });

  if (error || !Array.isArray(data) || data.length === 0) return null;
  return toSubject(data[0] as SubjectRow);
}

/** The same, from a personal one-tap link. */
export async function findByPersonalToken(
  eventId: string,
  token: string,
): Promise<CheckInSubject | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("find_registration_by_token", {
    p_event_id: eventId,
    p_token: token,
  });

  if (error || !Array.isArray(data) || data.length === 0) return null;
  return toSubject(data[0] as SubjectRow);
}

/**
 * Records an arrival.
 *
 * The decision is the database's: it takes a row lock, refuses a second arrival,
 * and stamps its own clock. Two taps cannot produce two arrivals, and a phone
 * with a wrong clock cannot write a wrong time.
 */
export async function checkInParticipant(input: {
  eventId: string;
  code?: string;
  token?: string;
  method: "personal_link" | "venue_qr" | "staff_manual";
}): Promise<CheckInResult> {
  const db = supabase();
  if (!db) return { result: "blocked", message: "Check-in is not available right now." };

  const { data, error } = await db.rpc("check_in_registration", {
    p_event_id: input.eventId,
    p_code: input.code ?? null,
    p_token: input.token ?? null,
    p_method: input.method,
  });

  if (error || !Array.isArray(data) || data.length === 0) {
    console.error("checkInParticipant", error);
    return {
      result: "blocked",
      message: "We could not check you in. Please see the event desk.",
    };
  }

  const row = data[0] as {
    out_result: string;
    out_full_name: string | null;
    out_checked_in_at: string | null;
    out_message: string;
  };

  if (row.out_result === "checked_in" || row.out_result === "already_checked_in") {
    return {
      result: row.out_result,
      fullName: row.out_full_name ?? "",
      at: row.out_checked_in_at ?? new Date().toISOString(),
    };
  }

  return {
    result: row.out_result === "not_found" ? "not_found" : "blocked",
    message: row.out_message,
  };
}

/**
 * Arrival totals for the venue display.
 *
 * A count, not a list. The wall needs a number; it must not need the participant
 * names to produce one.
 */
export async function arrivalTotals(
  eventId: string,
): Promise<{ expected: number; checkedIn: number }> {
  const db = supabase();
  if (!db) return { expected: 0, checkedIn: 0 };

  const { data, error } = await db.rpc("checkin_counts", { p_event_id: eventId });
  if (error || !Array.isArray(data) || data.length === 0) return { expected: 0, checkedIn: 0 };

  const row = data[0] as { expected: number; checked_in: number };
  return { expected: Number(row.expected ?? 0), checkedIn: Number(row.checked_in ?? 0) };
}

/**
 * Recovers a registration for somebody who has lost their code.
 *
 * Needs a contact detail and the surname together. Returns a masked name and the
 * personal token — never the code, because handing the code back would turn one
 * lucky guess into a working credential.
 */
export async function recoverRegistration(
  eventId: string,
  contact: string,
  lastName: string,
): Promise<{ maskedName: string; token: string } | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("recover_registration", {
    p_event_id: eventId,
    p_contact: contact,
    p_last_name: lastName,
  });

  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { out_masked_name: string; out_token: string };
  return { maskedName: row.out_masked_name, token: row.out_token };
}
