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

import { missingConfig, supabase } from "./client";

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
  /*
   * Everything the form recorded. The payment screen needs the receipt file, the
   * transaction reference and the method; finance and analytics each want a
   * different subset again. Carrying the document avoids a migration per field.
   */
  data: Record<string, unknown>;
}

/** Reads a string field out of the stored registration document. */
export function field(reg: OrganizerRegistration, key: string): string | undefined {
  const value = reg.data[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Reads a numeric field, distinguishing "not set" from zero.
 *
 * `field` above returns undefined for anything that is not a string, so asking it for an
 * amount always answered "missing" — which classified every registration as having no amount
 * established. A number needs its own reader, and the null has to survive: an imported
 * registration whose fee nobody has worked out yet is not a registration that owes nothing.
 */
export function numberField(reg: OrganizerRegistration, key: string): number | null {
  const value = reg.data[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;

  /* Stored as text by some writers; "" and null both mean nobody set it. */
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Reads a field out of the import block, for registrations that came from the Excel sheet.
 *
 * Those people carry the organizer's own vocabulary — "Early Bird", "Cash on Site" — beside
 * the application's payment state rather than instead of it, so nothing was reinterpreted on
 * the way in. Returns undefined for anybody who registered on the website, which is what lets
 * a screen show the label only where one exists.
 */
export function importField(reg: OrganizerRegistration, key: string): string | undefined {
  const block = reg.data.import;
  if (!block || typeof block !== "object") return undefined;

  const value = (block as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Reads a string field out of the form answers. */
export function answer(reg: OrganizerRegistration, key: string): string | undefined {
  const answers = reg.data.answers;
  if (!answers || typeof answers !== "object") return undefined;
  const value = (answers as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * The domain a bare username belongs to.
 *
 * Supabase Auth identifies accounts by email address and rejects anything that is
 * not one, so "admin" cannot be an account. The director wanted to type a username
 * rather than an address, so a value with no "@" is completed to one here — "admin"
 * signs in as admin@blufys.pk.
 *
 * The mapping lives in one place because it has to match the address the account was
 * actually created with. Two copies of it is a login that works on one screen.
 */
const USERNAME_DOMAIN = "blufys.pk";

/** Completes a bare username to the address its account uses. */
export function asEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed.includes("@")) return trimmed;
  return `${trimmed}@${USERNAME_DOMAIN}`;
}

export type SignInOutcome =
  | { ok: true; email: string }
  | { ok: false; message: string };

/**
 * Signs in. It does not create accounts.
 *
 * There is one director, and they hold the account. Signing in used to create an
 * account on first use, which meant anyone who found this URL could register
 * themselves — the allowlist stopped them seeing anything, but a stranger could
 * still put a row in the auth table, and a sign-in form that quietly creates
 * accounts is not a sign-in form.
 *
 * A new member of staff is added by putting their address in `staff_allowlist` and
 * creating their user in Supabase. That is a deliberate act by the director rather
 * than a side effect of typing a password.
 */
export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  const db = supabase();
  if (!db) {
    /*
     * Says which variable is missing. This read "Sign-in is not available right
     * now", which is true and useless: the cause is always one absent environment
     * variable, and naming it is the difference between a thirty-second fix and an
     * evening spent guessing at the app.
     */
    const missing = missingConfig();
    return {
      ok: false,
      message: missing
        ? `This deployment has no database connection: ${missing} is not set. Add it in the hosting project's environment variables and redeploy.`
        : "Sign-in is not available right now.",
    };
  }

  const trimmed = asEmail(email);

  const attempt = await db.auth.signInWithPassword({ email: trimmed, password });
  if (!attempt.error) return { ok: true, email: trimmed };

  const problem = attempt.error.message.toLowerCase();

  /*
   * The account exists but Supabase is waiting on a confirmation email.
   *
   * This failed silently once: no session was issued and the page simply stayed on
   * the form with nothing to explain why. Saying so is the difference between a
   * five-second fix and an evening of guessing.
   */
  if (problem.includes("email not confirmed")) {
    return {
      ok: false,
      message:
        "This account has not been confirmed yet. Confirm it from the email Supabase " +
        "sent, or turn off “Confirm email” under Authentication → Sign In / Providers.",
    };
  }

  /*
   * Wrong password and unknown address are deliberately the same message. Telling
   * a stranger which addresses exist is telling them which one to attack.
   */
  if (problem.includes("invalid login credentials")) {
    return { ok: false, message: "That email and password do not match." };
  }

  return { ok: false, message: "Could not sign in. Please try again." };
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
    /*
     * Absent until migration 0017 is applied, so this falls back to an empty
     * document rather than crashing every screen that reads a field from it.
     */
    data: (r.out_data as Record<string, unknown> | null) ?? {},
  }));
}

/**
 * Checks a player in from the roster.
 *
 * The desk has a list of names, not codes, so this goes in by row id and is gated
 * on staff membership rather than on knowing a participant's code. Returns whether
 * they were already in, so the screen can say "already checked in at 09:14" rather
 * than silently doing nothing.
 */
/**
 * Checks a player in, staff-side.
 *
 * Payment-aware: a status self-check-in would also block on (an unverified or rejected
 * receipt) comes back as `blocked`/`blockedReason` rather than silently succeeding, which is
 * what happened before this — staff check-in had no payment awareness at all. Passing
 * `overrideReason` proceeds anyway and records the override, with why, in the audit log.
 * Omit it to get the same refusal self-service would give; nothing already relying on the
 * old two-field shape breaks, since a normal check-in with no payment problem returns exactly
 * what it always did.
 */
export async function staffCheckIn(
  recordId: string,
  overrideReason?: string,
): Promise<{
  ok: boolean;
  at?: string;
  already?: boolean;
  blocked?: boolean;
  blockedReason?: string;
  message?: string;
}> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_check_in", {
    p_record_id: recordId,
    p_override_reason: overrideReason ?? null,
  });
  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Staff check-in needs migration 0048 applied." };
    }
    return { ok: false, message: "Could not check that player in." };
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  const blockedReason = (row?.out_blocked_reason as string | null) ?? undefined;
  return {
    ok: true,
    at: row?.out_checked_in_at ? String(row.out_checked_in_at) : undefined,
    already: row?.out_already === true,
    blocked: Boolean(blockedReason),
    blockedReason,
  };
}

/** Reverses a check-in, for when staff tap the wrong row. */
export async function staffUndoCheckIn(recordId: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { data, error } = await db.rpc("staff_undo_check_in", { p_record_id: recordId });
  return !error && data === true;
}

export type WalkInOutcome =
  | { ok: true; id: string; checkInCode: string }
  | { ok: false; message: string };

/**
 * Registers somebody at the door.
 *
 * Walk-ins are a fact of the day: a friend brought along, a sibling, somebody who
 * pays cash at the table. They are inserted through a database function so the
 * check-in code is allocated server-side and the row is subject to the same rules
 * as a form registration — the browser cannot mark one paid.
 */
export async function addWalkIn(input: {
  eventId: string;
  fullName: string;
  mobile: string;
  playingLevel: string;
  amount: number;
  by: string;
}): Promise<WalkInOutcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_add_walkin", {
    p_event_id: input.eventId,
    p_full_name: input.fullName,
    p_mobile: input.mobile,
    p_playing_level: input.playingLevel,
    p_amount: input.amount,
    p_by: input.by,
  });

  if (error) {
    /*
     * The function is missing until migration 0016 is applied. Saying so beats
     * "could not add player", which sends the organizer looking for a typo in the
     * name on the busiest morning of the year.
     */
    if (error.message.toLowerCase().includes("could not find the function")) {
      return {
        ok: false,
        message: "Walk-in entry needs migration 0016 applied to the database.",
      };
    }
    return { ok: false, message: "Could not add the player. Please try again." };
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row?.out_id) return { ok: false, message: "Could not add the player. Please try again." };

  return {
    ok: true,
    id: String(row.out_id),
    checkInCode: String(row.out_check_in_code ?? ""),
  };
}

export type PaymentDecision = "verified" | "rejected" | "complimentary" | "refunded";

/**
 * Records a payment decision, with the reason and the person who made it.
 *
 * Separate from `verifyPayment` because a reviewer also needs to say no. Both the
 * note and the reviewer are stored: a rejection nobody signed is an argument
 * waiting to happen at the desk.
 */
export async function decidePayment(input: {
  recordId: string;
  status: PaymentDecision;
  by: string;
  note?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_decide_payment", {
    p_record_id: input.recordId,
    p_status: input.status,
    p_by: input.by,
    p_note: input.note ?? "",
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Payment decisions need migration 0017 applied." };
    }
    return { ok: false, message: "Could not record that decision. Please try again." };
  }

  return { ok: data === true };
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


/**
 * Moving somebody between categories.
 *
 * Written to `confirmedDivision` as well as `preferredDivision`, because every read already
 * prefers the confirmed one — what the participant asked for stays on the record, and the
 * organizer's decision sits beside it rather than erasing the answer they gave.
 */
export async function setDivision(
  recordId: string,
  division: "beginner" | "recreational" | "advanced",
  by: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_division", {
    p_record_id: recordId,
    p_division: division,
    p_by: by,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Changing a category needs migration 0045 applied." };
    }
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }
  return { ok: true };
}
