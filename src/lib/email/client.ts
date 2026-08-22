"use client";

import { supabase } from "@/lib/supabase/client";

/**
 * Asking the server to send an email.
 *
 * The provider key is server-side, so a browser can only request a send; it cannot
 * address one itself. Both calls go to the same route, which decides what each is
 * allowed to do.
 *
 * Nothing here reports success on its own. "Sent" is only ever what the provider
 * confirmed, because an email a participant never received but was told about is worse
 * than one that visibly failed.
 */

export type EmailOutcome =
  | { ok: true }
  /** Nothing is configured. Worth distinguishing so a screen can stop offering it. */
  | { ok: false; configured: false; message: string }
  | { ok: false; configured: true; message: string };

async function post(body: unknown, authorization?: string): Promise<EmailOutcome> {
  let response: Response;

  try {
    response = await fetch("/api/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, configured: true, message: "Could not reach the server. Please try again." };
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; reason?: string; message?: string }
    | null;

  if (response.ok && payload?.ok) return { ok: true };

  return {
    ok: false,
    configured: response.status !== 503,
    message: payload?.message ?? "The email was not sent.",
  };
}

/**
 * Sends a participant their own confirmation.
 *
 * Only the token travels. The address is looked up on the server from that token, so
 * this cannot be used to send mail to somebody else.
 */
export function emailConfirmation(token: string): Promise<EmailOutcome> {
  return post({ kind: "registration", token });
}

export interface CertificateSend {
  to: string;
  recipientName: string;
  statement: string;
  detail?: string;
  /** The same personal line the printed certificate carries. */
  personalNote?: string;
  code: string;
  eventName: string;
  eventDate: string;
  verifyUrl: string;
}

/**
 * Sends a certificate. Staff only.
 *
 * The session token is attached so the server can ask the database whether this caller
 * is staff — a certificate email names a person and states what they won, and that is
 * not something an anonymous request should be able to send to anybody.
 */
export async function emailCertificate(input: CertificateSend): Promise<EmailOutcome> {
  const db = supabase();
  const session = db ? (await db.auth.getSession()).data.session : null;

  if (!session) {
    return { ok: false, configured: true, message: "Sign in again to send certificates." };
  }

  return post({ kind: "certificate", ...input }, `Bearer ${session.access_token}`);
}

export interface PlayerCodeRecipient {
  fullName: string;
  email: string;
  playerNumber: string;
  checkInCode: string;
  token: string;
}

export interface BulkOutcome {
  ok: boolean;
  sent: string[];
  failed: { name: string; reason: string }[];
  message?: string;
}

/**
 * Sends everybody their player number. Staff only.
 *
 * The session token is attached for the same reason the certificate send attaches it: this
 * posts a list of names and addresses and asks the server to mail them, and an anonymous
 * request must not be able to do that.
 *
 * Omitting it is not a small mistake — the route answers 401 and the page reports "0 sent,
 * 0 not delivered", which reads like an empty list rather than like a refusal.
 */
export async function emailPlayerCodes(
  people: PlayerCodeRecipient[],
): Promise<BulkOutcome> {
  const db = supabase();
  const session = db ? (await db.auth.getSession()).data.session : null;

  if (!session) {
    return { ok: false, sent: [], failed: [], message: "Sign in again to send these." };
  }

  const response = await fetch("/api/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ kind: "player-codes", people }),
  }).catch(() => null);

  if (!response) {
    return { ok: false, sent: [], failed: [], message: "No connection." };
  }

  const body = (await response.json().catch(() => null)) as Partial<BulkOutcome> | null;

  if (!body) {
    return { ok: false, sent: [], failed: [], message: "The server did not answer." };
  }

  /*
   * A refusal is reported as one. Defaulting the lists to empty and calling it a result is
   * how "nobody was told" comes to look like "there was nobody to tell".
   */
  if (!response.ok && !body.sent) {
    return {
      ok: false,
      sent: [],
      failed: [],
      message: body.message ?? `The server refused (${response.status}).`,
    };
  }

  return {
    ok: Boolean(body.ok),
    sent: body.sent ?? [],
    failed: body.failed ?? [],
    message: body.message,
  };
}


/**
 * A details confirmation, to one contact.
 *
 * Staff only, and the session token goes with it: this names people and states what they owe,
 * which is not something an anonymous request should be able to post to any address.
 *
 * Composed by the caller, because the card is built from the participant's own record and
 * having the server rebuild it would be a second opinion about what somebody's card says.
 */
export async function emailDetailsConfirmation(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailOutcome> {
  const db = supabase();
  const session = db ? (await db.auth.getSession()).data.session : null;

  if (!session) {
    return { ok: false, configured: true, message: "Sign in again to send confirmations." };
  }

  return post({ kind: "details-confirmation", ...input }, `Bearer ${session.access_token}`);
}
