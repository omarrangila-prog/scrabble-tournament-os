/**
 * Organizer authentication and the participant list.
 *
 * Sign-in is Supabase Auth, so the decision about who may read registrations is
 * made by the database rather than by the browser. Removing the password from the
 * old screen left the dashboard open to anyone who found the URL, and a password
 * the browser checks itself would be no better — a browser can be told to skip
 * it.
 *
 * Staff membership comes from an allowlist held in the database. Signing up with
 * an address that is not on it produces an account that can see exactly what an
 * anonymous visitor sees, which is nothing.
 */

import { supabase } from "./client";

export interface OrganizerRegistration {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  area: string | null;
  playingLevel: string;
  registrationStatus: string;
  paymentStatus: string;
  amountDue: number;
  currency: string;
  checkInCode: string | null;
  checkedInAt: string | null;
  checkInMethod: string | null;
  submittedAt: string;
}

export type SignInOutcome =
  | { ok: true; email: string }
  | { ok: false; message: string };

/**
 * Signs in, creating the account on first use.
 *
 * The organizer has no account until they set one up, and a separate "register"
 * screen for a single person is a step with nothing behind it. A first sign-in
 * creates the account; the allowlist decides whether it carries any access.
 */
export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "Sign-in is not available right now." };

  const trimmed = email.trim().toLowerCase();

  const attempt = await db.auth.signInWithPassword({ email: trimmed, password });
  if (!attempt.error) return { ok: true, email: trimmed };

  const problem = attempt.error.message.toLowerCase();

  /*
   * The account exists but Supabase is waiting on a confirmation email.
   *
   * This failed silently before: sign-up succeeded, no session was issued, and
   * the page simply stayed on the form with nothing to explain why. Saying so is
   * the difference between a five-second fix and an evening of guessing.
   */
  if (problem.includes("email not confirmed")) {
    return {
      ok: false,
      message:
        "Check your inbox and confirm the account, then sign in again. " +
        "To skip confirmation, turn off “Confirm email” in Supabase under " +
        "Authentication → Sign In / Providers → Email.",
    };
  }

  /*
   * Only fall through to sign-up on bad credentials, which is what an unknown
   * account returns. Any other error is a real failure and should surface.
   */
  if (!problem.includes("invalid login credentials")) {
    return { ok: false, message: "Could not sign in. Please try again." };
  }

  const created = await db.auth.signUp({ email: trimmed, password });
  if (created.error) {
    // A wrong password on an existing account lands here.
    return { ok: false, message: "That email and password do not match." };
  }

  /*
   * Sign-up returns a session only when confirmation is off. Without one the
   * account is created but unusable, so say that rather than reporting success
   * and leaving the page unchanged.
   */
  if (!created.data.session) {
    return {
      ok: false,
      message:
        "Account created. Confirm it from the email we just sent, then sign in. " +
        "To skip confirmation, turn off “Confirm email” in Supabase under " +
        "Authentication → Sign In / Providers → Email.",
    };
  }

  return { ok: true, email: trimmed };
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

/** The signed-in address, or null. */
export async function currentOrganizer(): Promise<string | null> {
  const db = supabase();
  if (!db) return null;
  const { data } = await db.auth.getUser();
  return data.user?.email ?? null;
}

/**
 * Whether this account actually carries staff access.
 *
 * Signing in is not the same as being staff: an account created with an address
 * that is not on the allowlist authenticates successfully and can read nothing.
 * The dashboard needs to tell those apart so it can say so rather than showing an
 * empty list that looks like "no registrations yet".
 */
export async function hasStaffAccess(): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { data, error } = await db.from("staff").select("user_id").limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * Every registration for one event.
 *
 * Returns nothing unless the caller is staff — enforced in the database, so it
 * cannot be bypassed by calling the API directly.
 */
export async function listRegistrations(eventId: string): Promise<OrganizerRegistration[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("organizer_registrations", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.out_id),
    fullName: String(r.out_full_name ?? ""),
    email: String(r.out_email ?? ""),
    mobile: String(r.out_mobile ?? ""),
    area: (r.out_area as string | null) ?? null,
    playingLevel: String(r.out_playing_level ?? ""),
    registrationStatus: String(r.out_registration_status ?? ""),
    paymentStatus: String(r.out_payment_status ?? ""),
    amountDue: Number(r.out_amount_due ?? 0),
    currency: String(r.out_currency ?? "PKR"),
    checkInCode: (r.out_check_in_code as string | null) ?? null,
    checkedInAt: (r.out_checked_in_at as string | null) ?? null,
    checkInMethod: (r.out_check_in_method as string | null) ?? null,
    submittedAt: String(r.out_submitted_at ?? ""),
  }));
}

/** Marks a payment verified, recording who decided. */
export async function verifyPayment(recordId: string, by: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { data, error } = await db.rpc("verify_payment", {
    p_record_id: recordId,
    p_by: by,
  });
  return !error && data === true;
}
