/**
 * Transactional email for an event.
 *
 * Every message here is triggered by something the recipient did — they
 * registered, their payment was checked, their entry was approved. That makes
 * these transactional, and they do not need marketing consent: withholding
 * someone's own confirmation because they declined a newsletter would be
 * absurd.
 *
 * The one message that is *not* transactional is the future-event
 * announcement, and it is deliberately not built here. It belongs to the
 * audience engine, which enforces opt-in and unsubscribe.
 *
 * Nothing in this module sends anything. It composes messages and queues them;
 * delivery belongs to whatever provider the organizer configures. Queuing and
 * sending are kept apart so a provider outage never loses a message.
 */

import { ParticipationTrack, TRACK_LABEL, playsScrabble } from "../firebase/schema";

export type EmailKind =
  | "registration-received"
  | "payment-verified"
  | "payment-correction"
  | "registration-approved"
  | "event-reminder";

export const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  "registration-received": "Registration received",
  "payment-verified": "Payment verified",
  "payment-correction": "Payment correction needed",
  "registration-approved": "Registration approved",
  "event-reminder": "Event reminder",
};

export interface EventDetails {
  name: string;
  subtitle?: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  currency: string;
  collaborators?: string[];
}

export interface RecipientDetails {
  fullName: string;
  email: string;
  track: ParticipationTrack;
  amountDue: number;
  /** Opaque participant token. Never an internal record id. */
  token: string;
  membershipClaimed?: boolean;
  membershipVerified?: boolean;
}

export interface ComposedEmail {
  kind: EmailKind;
  to: string;
  subject: string;
  /** Plain text. Rendering to HTML belongs to the provider. */
  body: string;
  /** Where the personal link points, when the message carries one. */
  link?: string;
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function whereAndWhen(event: EventDetails): string {
  return [`${event.date}`, event.time, `${event.venue}, ${event.city}`].join("\n");
}

/**
 * Composes one message.
 *
 * Every message states the event, the date, the time and the venue. A
 * participant who kept only one email should still be able to turn up at the
 * right place — so nothing is left to "as previously advised".
 */
export function composeEmail(
  kind: EmailKind,
  event: EventDetails,
  recipient: RecipientDetails,
  options: { reason?: string; link?: string } = {},
): ComposedEmail {
  const hi = `Hi ${firstName(recipient.fullName)},`;
  const money = (n: number) => `${event.currency} ${n.toLocaleString("en-PK")}`;
  const details = whereAndWhen(event);
  const joining = TRACK_LABEL[recipient.track];

  switch (kind) {
    case "registration-received":
      return {
        kind,
        to: recipient.email,
        subject: `${event.name} — registration received`,
        link: options.link,
        body: [
          hi,
          "",
          `Thanks for registering for ${event.name}${event.subtitle ? ` — ${event.subtitle}` : ""}.`,
          "",
          details,
          "",
          `You are joining: ${joining}`,
          `Amount due: ${money(recipient.amountDue)}`,
          recipient.membershipClaimed && !recipient.membershipVerified
            ? "\nYour Alliance Française member discount is included above and will be confirmed once we have checked your membership number. If it cannot be verified, the standard fee applies."
            : "",
          "",
          "We will confirm your place once payment is verified.",
          options.link ? `\nYour registration: ${options.link}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "payment-verified":
      return {
        kind,
        to: recipient.email,
        subject: `${event.name} — payment verified`,
        link: options.link,
        body: [
          hi,
          "",
          `Your payment of ${money(recipient.amountDue)} for ${event.name} has been verified. Your place is confirmed.`,
          "",
          details,
          "",
          `You are joining: ${joining}`,
          recipient.membershipVerified
            ? "\nYour Alliance Française member discount was applied."
            : "",
          "",
          "Bring this email or your registration link to check in on the day.",
          options.link ? `\nYour registration: ${options.link}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "payment-correction":
      return {
        kind,
        to: recipient.email,
        subject: `${event.name} — we need another look at your payment`,
        link: options.link,
        body: [
          hi,
          "",
          `We could not verify your payment for ${event.name}.`,
          "",
          // The reason is required by queueEmail, so it is always present here.
          options.reason ? `What we found: ${options.reason}` : "",
          "",
          `Amount due: ${money(recipient.amountDue)}`,
          "",
          options.link
            ? `You can upload a new receipt here: ${options.link}`
            : "Please reply to this email with a corrected receipt.",
          "",
          "Your registration is safe — nothing has been cancelled.",
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "registration-approved":
      return {
        kind,
        to: recipient.email,
        subject: `${event.name} — you're in`,
        link: options.link,
        body: [
          hi,
          "",
          `Your registration for ${event.name} is confirmed.`,
          "",
          details,
          "",
          `You are joining: ${joining}`,
          "",
          playsScrabble(recipient.track)
            ? "Arrive a few minutes early so we can seat you before the first round. Your pairing appears on your registration page once the round is published."
            : "Come whenever suits you after doors open. Visit the welcome desk and we will point you to a game.",
          options.link ? `\nYour registration: ${options.link}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "event-reminder":
      return {
        kind,
        to: recipient.email,
        subject: `${event.name} is tomorrow`,
        link: options.link,
        body: [
          hi,
          "",
          `${event.name} is tomorrow.`,
          "",
          details,
          "",
          `You are joining: ${joining}`,
          "",
          "Checking in: scan the QR code on the display at the entrance, or ask at the welcome desk. You do not need an app.",
          options.link ? `\nYour registration: ${options.link}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Queue                                                                       */
/* -------------------------------------------------------------------------- */

export type QueueStatus = "queued" | "sent" | "failed";

export interface QueuedEmail extends ComposedEmail {
  id: string;
  status: QueueStatus;
  queuedAt: string;
  sentAt?: string;
  /** Why delivery failed, when it did. */
  failure?: string;
}

export interface QueueResult {
  ok: boolean;
  email?: QueuedEmail;
  /** Why the message was refused. */
  reason?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Queues a message for delivery.
 *
 * Refuses rather than sends when something is missing. A correction email with
 * no reason tells a participant their payment failed and gives them no way to
 * act on it, which is worse than sending nothing and following up by hand.
 */
export function queueEmail(
  kind: EmailKind,
  event: EventDetails,
  recipient: RecipientDetails,
  options: { reason?: string; link?: string; at?: string } = {},
): QueueResult {
  if (!recipient.email.trim())
    return { ok: false, reason: "This participant has no email address." };

  if (kind === "payment-correction" && !options.reason?.trim())
    return {
      ok: false,
      reason: "A correction email needs a reason. The participant cannot act on 'payment failed'.",
    };

  const composed = composeEmail(kind, event, recipient, options);

  return {
    ok: true,
    email: {
      ...composed,
      id: `mail-${uid()}`,
      status: "queued",
      queuedAt: options.at ?? new Date().toISOString(),
    },
  };
}

export interface QueueSummary {
  queued: number;
  sent: number;
  failed: number;
  byKind: { kind: EmailKind; count: number }[];
}

export function summariseQueue(emails: QueuedEmail[]): QueueSummary {
  const kinds = new Map<EmailKind, number>();
  for (const e of emails) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);

  return {
    queued: emails.filter((e) => e.status === "queued").length,
    sent: emails.filter((e) => e.status === "sent").length,
    failed: emails.filter((e) => e.status === "failed").length,
    byKind: [...kinds.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
  };
}
