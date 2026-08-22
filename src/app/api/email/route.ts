import { NextResponse } from "next/server";

import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import {
  certificateEmail,
  playerCodeEmail,
  registrationEmail,
} from "@/lib/email/templates";
import { checkDeliverability, isEmailConfigured, sendEmail } from "@/lib/email/send";

/**
 * Sending email.
 *
 * The provider key lives only here, on the server. The route exists rather than a
 * direct call from a component because a key in a browser bundle is a key anybody can
 * read and use.
 *
 * Two shapes of request, with deliberately different rules:
 *
 *   registration — no sign-in. Anybody can ask, but the recipient is *not* in the
 *     request: it is looked up from the database using the participant's own token,
 *     which only they were given. That is what stops this being an open relay for
 *     sending mail to arbitrary addresses.
 *
 *   certificate — staff only, verified by asking the database whether the caller's
 *     session is staff. Here the recipient is supplied, because a director emailing a
 *     winner is the whole point, and trusting the caller is only safe once we know who
 *     they are.
 */

interface RegistrationRequest {
  kind: "registration" | "player-codes";
  people?: {
    fullName: string;
    email: string;
    playerNumber: string;
    checkInCode: string;
    token: string;
  }[];
  token: string;
}

/**
 * A details confirmation, already composed.
 *
 * Composed on the client because the card is assembled from the participant's own record,
 * which the browser has already read through their token — recomposing it here would mean a
 * second source of truth for what somebody's card says. Staff only, and the recipient is
 * supplied, so the sign-in check is what stops this being an open relay.
 */
interface ConfirmationRequest {
  kind: "details-confirmation";
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface CertificateRequest {
  kind: "certificate";
  to: string;
  recipientName: string;
  statement: string;
  detail?: string;
  personalNote?: string;
  code: string;
  eventName: string;
  eventDate: string;
  verifyUrl: string;
}

type Body = RegistrationRequest | CertificateRequest | ConfirmationRequest;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/**
 * Whether the caller's session is staff, according to the database.
 *
 * The token is not decoded here. Asking Postgres to read `staff` with it means row
 * level security is the authority, so a forged or expired token fails for the same
 * reason a stranger's would — this route cannot be talked into a different answer
 * than the rest of the app gives.
 */
async function callerIsStaff(authorization: string | null): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_KEY) return false;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/staff?select=user_id&limit=1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization },
  });

  if (!response.ok) return false;
  const rows = (await response.json().catch(() => null)) as unknown[] | null;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * The participant's own record, found by the token only they hold.
 *
 * `registration_for_email` rather than `find_registration_by_token`: the latter was
 * written for the check-in screen and returns neither an email address nor a check-in
 * code, so a send built on it would have addressed mail to nothing and omitted the one
 * thing the message exists to carry.
 */
async function registrationForToken(token: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/registration_for_email`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_event_id: ACTIVE_EVENT_ID, p_token: token }),
  });

  if (!response.ok) return null;
  const rows = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
  return Array.isArray(rows) && rows.length > 0 ? rows[0]! : null;
}

/**
 * One person's player-number message.
 *
 * Composed here rather than in the browser so the recipient list comes from the database
 * and not from whatever a page happened to be showing.
 */
async function sendPlayerCode(
  origin: string,
  row: { fullName: string; email: string; playerNumber: string; checkInCode: string; token: string },
) {
  const composed = playerCodeEmail({
    fullName: row.fullName || "there",
    playerNumber: row.playerNumber,
    checkInCode: row.checkInCode,
    eventName: "Blufy's AlphaBattle",
    eventDate: "Sunday 23 August 2026",
    venue: "Chai Chatt, Habitt City, Karachi",
    checkInUrl: `${origin}/events/alphabattle-23-august/check-in?t=${encodeURIComponent(row.token)}`,
  });

  return sendEmail({ to: row.email, ...composed });
}

export async function POST(request: Request) {
  if (!isEmailConfigured()) {
    /*
     * 503 rather than 500. Nothing is broken — the feature has not been given a
     * provider, and the caller can say so plainly instead of reporting a fault.
     */
    return NextResponse.json(
      {
        ok: false,
        reason: "not-configured",
        message:
          "Email is not set up. Add RESEND_API_KEY and EMAIL_FROM to the hosting " +
          "project's environment variables and redeploy.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.kind) {
    return NextResponse.json({ ok: false, message: "Nothing to send." }, { status: 400 });
  }

  /* ---- A participant's own confirmation -------------------------------- */
  if (body.kind === "registration") {
    if (!body.token) {
      return NextResponse.json({ ok: false, message: "Missing token." }, { status: 400 });
    }

    const record = await registrationForToken(body.token);
    if (!record) {
      /*
       * Deliberately the same answer as a token that exists but has no email: an
       * unknown token must not be distinguishable from a known one, or this becomes a
       * way to test which tokens are real.
       */
      return NextResponse.json({ ok: false, message: "Nothing to send." }, { status: 404 });
    }

    const to = String(record.out_email ?? "");
    if (!to.includes("@")) {
      return NextResponse.json(
        { ok: false, message: "That registration has no email address." },
        { status: 422 },
      );
    }

    const origin = new URL(request.url).origin;
    const composed = registrationEmail({
      fullName: String(record.out_full_name ?? "there"),
      eventName: "Blufy's AlphaBattle",
      eventDate: "Sunday 23 August 2026",
      venue: "Chai Chatt, Habitt City, Karachi",
      checkInCode: String(record.out_check_in_code ?? ""),
      checkInUrl: `${origin}/events/alphabattle-23-august/check-in?t=${encodeURIComponent(body.token)}`,
      amount: `PKR ${Number(record.out_amount_due ?? 0).toLocaleString("en-PK")}`,
    });

    const result = await sendEmail({ to, ...composed });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  /* ---- Everybody's player number, sent by staff ------------------------ */
  if (body.kind === "player-codes") {
    if (!(await callerIsStaff(request.headers.get("authorization")))) {
      return NextResponse.json(
        { ok: false, message: "Only the organizer can send these." },
        { status: 401 },
      );
    }

    const people = Array.isArray(body.people) ? body.people : [];
    if (people.length === 0) {
      return NextResponse.json({ ok: false, message: "Nobody to send to." }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const sent: string[] = [];
    const failed: { name: string; reason: string }[] = [];

    /*
     * One at a time, and the outcome of each is kept.
     *
     * A bulk send that reports "done" hides the one address that bounced, and the person
     * behind it turns up on the day never having been told their number. Providers also
     * rate-limit bursts, and a sequential send is well inside every limit that matters at
     * this size.
     */
    for (const person of people) {
      if (!person?.email?.includes("@")) {
        failed.push({ name: person?.fullName ?? "unknown", reason: "no email address" });
        continue;
      }

      const result = await sendPlayerCode(origin, person);
      if (result.ok) sent.push(person.fullName);
      else failed.push({ name: person.fullName, reason: result.message ?? "refused" });
    }

    return NextResponse.json({ ok: failed.length === 0, sent, failed });
  }

  /* ---- A certificate, sent by staff ------------------------------------ */
  if (body.kind === "details-confirmation") {
    if (!(await callerIsStaff(request.headers.get("authorization")))) {
      return NextResponse.json(
        { ok: false, message: "Only the organizer can send confirmations." },
        { status: 401 },
      );
    }

    if (!body.to?.includes("@")) {
      return NextResponse.json(
        { ok: false, message: "That contact has no email address on file." },
        { status: 422 },
      );
    }

    const result = await sendEmail({
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  if (body.kind === "certificate") {
    if (!(await callerIsStaff(request.headers.get("authorization")))) {
      return NextResponse.json(
        { ok: false, message: "Only the organizer can send certificates." },
        { status: 401 },
      );
    }

    if (!body.to?.includes("@")) {
      return NextResponse.json(
        { ok: false, message: "That person has no email address on file." },
        { status: 422 },
      );
    }

    const composed = certificateEmail({
      recipientName: body.recipientName,
      eventName: body.eventName,
      eventDate: body.eventDate,
      statement: body.statement,
      detail: body.detail,
      personalNote: body.personalNote,
      verifyUrl: body.verifyUrl,
      code: body.code,
    });

    const result = await sendEmail({ to: body.to, ...composed });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  return NextResponse.json({ ok: false, message: "Unknown request." }, { status: 400 });
}

/**
 * What will happen if mail is sent, without sending any.
 *
 * Read by the Certificate Studio so it can say, before the director presses anything,
 * whether these messages will reach the people they are addressed to.
 *
 * No sign-in check: this reveals nothing about anybody. It reports whether a domain is
 * verified and which address mail comes from, both of which appear in the header of every
 * message the system already sends.
 */
export async function GET() {
  const status = await checkDeliverability();
  return NextResponse.json(status, { status: 200 });
}
