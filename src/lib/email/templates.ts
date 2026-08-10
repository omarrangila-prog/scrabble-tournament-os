/**
 * What the emails say.
 *
 * Pure functions returning subject, HTML and plain text, so the wording can be tested
 * without sending anything and cannot drift between the two formats.
 *
 * Plain text is not optional. Some clients show it instead of the HTML, and a
 * participant whose check-in code only exists in an HTML block they cannot see has
 * effectively received nothing.
 *
 * Nothing here states anything the caller has not supplied. An email is the copy
 * somebody keeps, so a sentence invented here would be the version they trust.
 */

export interface Composed {
  subject: string;
  html: string;
  text: string;
}

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/** Escapes text going into HTML. Names come from a form and are not trusted markup. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The shell every message shares.
 *
 * Table-based and inline-styled on purpose: email clients strip stylesheets and many
 * do not support flexbox or grid, so a layout that looks modern in a browser collapses
 * into a column of unstyled text in Outlook.
 */
function wrap(title: string, body: string): string {
  return [
    `<div style="margin:0;padding:24px 12px;background:${CREAM};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid rgba(62,47,35,0.12);">`,
    `<tr><td style="padding:24px 24px 8px;">`,
    `<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">Blufy&rsquo;s AlphaBattle</p>`,
    `<h1 style="margin:8px 0 0;font-size:21px;line-height:1.25;color:${BROWN};">${escape(title)}</h1>`,
    `</td></tr>`,
    `<tr><td style="padding:8px 24px 24px;font-size:15px;line-height:1.6;color:${BROWN};">`,
    body,
    `</td></tr>`,
    `</table>`,
    `</div>`,
  ].join("");
}

function button(href: string, label: string): string {
  return (
    `<p style="margin:20px 0 0;"><a href="${escape(href)}" ` +
    `style="display:inline-block;padding:12px 20px;border-radius:10px;background:${FOREST};` +
    `color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${escape(label)}</a></p>`
  );
}

/* -------------------------------------------------------------------------- */

export interface RegistrationEmail {
  fullName: string;
  eventName: string;
  eventDate: string;
  venue: string;
  checkInCode: string;
  checkInUrl: string;
  amount: string;
}

/**
 * The confirmation a participant receives.
 *
 * The check-in code is the point of the message. It appears in the subject line as
 * well as the body, because a code somebody has to open an email to find is a code
 * they will be hunting for at the door.
 */
export function registrationEmail(input: RegistrationEmail): Composed {
  const subject = `You are registered — check-in code ${input.checkInCode}`;

  const html = wrap("You are registered", [
    `<p style="margin:0;">Thank you, ${escape(input.fullName)}. Your place at ${escape(input.eventName)} is confirmed.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 0;background:${CREAM};border-radius:12px;">`,
    `<tr><td style="padding:16px;text-align:center;">`,
    `<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:rgba(62,47,35,0.6);">Your check-in code</p>`,
    `<p style="margin:6px 0 0;font-size:32px;font-weight:800;letter-spacing:5px;color:${BROWN};">${escape(input.checkInCode)}</p>`,
    `</td></tr></table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 0;font-size:14px;color:rgba(62,47,35,0.85);">`,
    `<tr><td style="padding:3px 0;">Date</td><td style="padding:3px 0;text-align:right;font-weight:600;">${escape(input.eventDate)}</td></tr>`,
    `<tr><td style="padding:3px 0;">Venue</td><td style="padding:3px 0;text-align:right;font-weight:600;">${escape(input.venue)}</td></tr>`,
    `<tr><td style="padding:3px 0;">Amount</td><td style="padding:3px 0;text-align:right;font-weight:600;">${escape(input.amount)}</td></tr>`,
    `</table>`,
    button(input.checkInUrl, "Check in on the day"),
    `<p style="margin:16px 0 0;font-size:13px;color:rgba(62,47,35,0.6);">Keep this email. The code above is what you enter at the venue, and the button is a one-tap version of it.</p>`,
  ].join(""));

  const text = [
    `You are registered — ${input.eventName}`,
    ``,
    `Thank you, ${input.fullName}. Your place is confirmed.`,
    ``,
    `YOUR CHECK-IN CODE: ${input.checkInCode}`,
    ``,
    `Date:   ${input.eventDate}`,
    `Venue:  ${input.venue}`,
    `Amount: ${input.amount}`,
    ``,
    `Check in on the day: ${input.checkInUrl}`,
    ``,
    `Keep this email. The code above is what you enter at the venue.`,
  ].join("\n");

  return { subject, html, text };
}

/* -------------------------------------------------------------------------- */

export interface CertificateEmail {
  recipientName: string;
  eventName: string;
  eventDate: string;
  statement: string;
  detail?: string;
  verifyUrl: string;
  code: string;
}

/**
 * A certificate, sent to the person who earned it.
 *
 * Carries the verification link rather than an image. Anyone receiving a forwarded
 * certificate can check it against the record, which is what makes it worth having —
 * a picture proves nothing on its own.
 */
export function certificateEmail(input: CertificateEmail): Composed {
  const subject = `Your certificate — ${input.eventName}`;

  const html = wrap("Your certificate", [
    `<p style="margin:0;">Congratulations, ${escape(input.recipientName)}.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 0;border:2px solid ${GOLD};border-radius:12px;background:#FFFDF6;">`,
    `<tr><td style="padding:22px;text-align:center;">`,
    `<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:rgba(62,47,35,0.6);">${escape(input.eventName)}</p>`,
    `<p style="margin:4px 0 0;font-size:12px;font-weight:600;color:rgba(62,47,35,0.6);">${escape(input.eventDate)}</p>`,
    `<p style="margin:16px 0 0;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(62,47,35,0.6);">${escape(input.statement)}</p>`,
    `<p style="margin:6px 0 0;font-size:24px;font-weight:800;color:${BROWN};">${escape(input.recipientName)}</p>`,
    input.detail
      ? `<p style="margin:10px 0 0;font-size:13px;color:rgba(62,47,35,0.7);">${escape(input.detail)}</p>`
      : "",
    `<p style="margin:16px 0 0;font-size:11px;letter-spacing:1.2px;color:rgba(62,47,35,0.5);">VERIFICATION ${escape(input.code)}</p>`,
    `</td></tr></table>`,
    button(input.verifyUrl, "Verify this certificate"),
    `<p style="margin:16px 0 0;font-size:13px;color:rgba(62,47,35,0.6);">Anyone can open that link to confirm this certificate against our records.</p>`,
  ].join(""));

  const text = [
    `Your certificate — ${input.eventName}`,
    ``,
    `Congratulations, ${input.recipientName}.`,
    ``,
    `${input.eventName}`,
    `${input.eventDate}`,
    `${input.statement}`,
    input.detail ?? "",
    ``,
    `Verification code: ${input.code}`,
    `Verify: ${input.verifyUrl}`,
    ``,
    `Anyone can open that link to confirm this certificate against our records.`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}
