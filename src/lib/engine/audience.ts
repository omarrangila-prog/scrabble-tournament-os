/**
 * Choosing who to notify, and who must not be notified.
 *
 * Announcing a new tournament to people who played the last one is the single
 * most effective thing an organizer can do. It is also the point where a
 * platform most easily does something it should not: mailing people who never
 * agreed to hear from it, or who asked it to stop.
 *
 * So consent is not a filter the organizer can switch off. It is applied last,
 * after every audience rule, and the count of who was excluded is always
 * reported — an organizer who selects two hundred people and reaches a hundred
 * and sixty should be told why, not left to wonder.
 *
 * The distinction that drives all of it: a message about an event someone has
 * already entered is **transactional** — their pairing, their payment, their
 * certificate. A message about a *different* event is **promotional**, and
 * needs opt-in. Getting this backwards is how a tournament platform becomes a
 * spam problem.
 */

export type MessageKind = "transactional" | "promotional";

/** Where a message can go. */
export type Channel = "email" | "sms" | "whatsapp" | "push";

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push notification",
};

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

/** One person the organizer could contact. */
export interface Contact {
  id: string;
  fullName: string;
  email: string;
  mobile?: string;

  /** Events this person has entered, most recent first. */
  eventIds: string[];
  /** Divisions they have played in. */
  divisions: string[];
  city: string;
  club: string;

  /** Explicit opt-in to hear about future events. */
  marketingConsent: boolean;
  /** Set when they asked to stop. Overrides consent entirely. */
  unsubscribedAt?: string;
  /** Channels that have hard-bounced and should not be retried. */
  bouncedChannels?: Channel[];
}

/* -------------------------------------------------------------------------- */
/* Audience rules                                                              */
/* -------------------------------------------------------------------------- */

export interface AudienceFilter {
  /** Everyone who entered any of these events. Empty means no event filter. */
  eventIds?: string[];
  divisions?: string[];
  cities?: string[];
  clubs?: string[];
  /** Only people who have entered more than once. */
  returningOnly?: boolean;
  /** Specific people, added by hand. */
  contactIds?: string[];
}

/** Whether a contact matches the audience rules, before consent is considered. */
export function matchesFilter(contact: Contact, filter: AudienceFilter): boolean {
  if (filter.contactIds?.length) return filter.contactIds.includes(contact.id);

  if (filter.eventIds?.length) {
    if (!contact.eventIds.some((id) => filter.eventIds!.includes(id))) return false;
  }

  if (filter.divisions?.length) {
    if (!contact.divisions.some((d) => filter.divisions!.includes(d))) return false;
  }

  if (filter.cities?.length && !filter.cities.includes(contact.city)) return false;
  if (filter.clubs?.length && !filter.clubs.includes(contact.club)) return false;
  if (filter.returningOnly && contact.eventIds.length < 2) return false;

  return true;
}

/* -------------------------------------------------------------------------- */
/* Consent                                                                     */
/* -------------------------------------------------------------------------- */

export type ExclusionReason =
  | "unsubscribed"
  | "no-consent"
  | "no-address"
  | "bounced";

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  unsubscribed: "Asked not to be contacted",
  "no-consent": "Has not opted in to event announcements",
  "no-address": "No usable address for this channel",
  bounced: "Previous message to this address bounced",
};

/**
 * Whether this person may receive this message on this channel.
 *
 * Unsubscribe always wins, including over transactional messages on
 * promotional channels — someone who asked a platform to stop messaging them
 * should not keep receiving announcements because a flag elsewhere says they
 * once consented.
 *
 * Transactional messages about an event the person actually entered are
 * exempt from opt-in: they asked for that relationship by registering, and
 * withholding their own pairing would be worse than useless.
 */
export function exclusionFor(
  contact: Contact,
  kind: MessageKind,
  channel: Channel,
): ExclusionReason | null {
  if (contact.unsubscribedAt) return "unsubscribed";

  if (kind === "promotional" && !contact.marketingConsent) return "no-consent";

  if (contact.bouncedChannels?.includes(channel)) return "bounced";

  const address =
    channel === "email"
      ? contact.email
      : channel === "sms" || channel === "whatsapp"
        ? contact.mobile
        : contact.email;

  if (!address || !address.trim()) return "no-address";

  return null;
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

export interface AudienceResult {
  /** Who will actually be messaged. */
  recipients: Contact[];
  /** Who matched the rules but was excluded, and why. */
  excluded: { contact: Contact; reason: ExclusionReason }[];
  /** Counts per reason, for the summary line. */
  excludedCounts: Record<ExclusionReason, number>;
  /** Matched the audience rules, before consent. */
  matched: number;
}

/**
 * Resolves an audience.
 *
 * Consent is applied after the audience rules rather than as one of them, so
 * an organizer cannot construct a filter that quietly includes people who
 * opted out. The excluded list is returned rather than silently dropped: the
 * gap between "selected 200" and "reaching 160" must be explainable.
 */
export function resolveAudience(
  contacts: Contact[],
  filter: AudienceFilter,
  kind: MessageKind,
  channel: Channel,
): AudienceResult {
  const matched = contacts.filter((c) => matchesFilter(c, filter));

  const recipients: Contact[] = [];
  const excluded: { contact: Contact; reason: ExclusionReason }[] = [];
  const excludedCounts: Record<ExclusionReason, number> = {
    unsubscribed: 0,
    "no-consent": 0,
    "no-address": 0,
    bounced: 0,
  };

  for (const contact of matched) {
    const reason = exclusionFor(contact, kind, channel);
    if (reason) {
      excluded.push({ contact, reason });
      excludedCounts[reason] += 1;
    } else {
      recipients.push(contact);
    }
  }

  return { recipients, excluded, excludedCounts, matched: matched.length };
}

/** Plain-language summary of who is being reached and who is not. */
export function describeAudience(result: AudienceResult): string {
  if (result.matched === 0) return "Nobody matches these filters.";

  const parts: string[] = [
    `${result.recipients.length} of ${result.matched} will be messaged`,
  ];

  const reasons = (Object.keys(result.excludedCounts) as ExclusionReason[])
    .filter((r) => result.excludedCounts[r] > 0)
    .map((r) => `${result.excludedCounts[r]} ${EXCLUSION_LABEL[r].toLowerCase()}`);

  if (reasons.length) parts.push(reasons.join(", "));

  return `${parts.join(". ")}.`;
}

/* -------------------------------------------------------------------------- */
/* Message                                                                     */
/* -------------------------------------------------------------------------- */

export interface MessageDraft {
  subject: string;
  body: string;
  kind: MessageKind;
  channel: Channel;
}

export interface MessageProblem {
  severity: "blocker" | "warning";
  message: string;
}

/** Characters a single SMS holds before it is split and billed twice. */
const SMS_LIMIT = 160;

/**
 * Checks a message before it goes out.
 *
 * A promotional message must carry a way to stop receiving them — that is what
 * makes the consent meaningful rather than a checkbox someone ticked once.
 */
export function checkMessage(draft: MessageDraft): MessageProblem[] {
  const problems: MessageProblem[] = [];
  const body = draft.body.trim();

  if (!body) problems.push({ severity: "blocker", message: "The message is empty." });

  if (draft.channel === "email" && !draft.subject.trim())
    problems.push({ severity: "blocker", message: "An email needs a subject." });

  if (draft.kind === "promotional") {
    /*
     * Requires an actual instruction, not merely the words. A loose match on
     * "opt out" would pass a message that happens to contain the phrase —
     * including one saying there is no way to opt out — which is precisely the
     * case this check exists to catch.
     */
    const instructsOptOut =
      /\b(to|click|tap|visit|reply|text|send|email)\b[^.!?]{0,40}\bunsubscribe\b/i.test(body) ||
      /\bunsubscribe\b[^.!?]{0,20}\b(here|link|below|at)\b/i.test(body) ||
      /\b(reply|text|send)\s+stop\b/i.test(body) ||
      /\bto\s+opt[\s-]?out\b/i.test(body) ||
      /\bstop\s+receiving\s+(these|this|them)\b/i.test(body);

    // A negation cancels it: "no unsubscribe option" is not an instruction.
    const negated = /\b(no|not|cannot|can't|without)\b[^.!?]{0,30}\b(unsubscribe|opt[\s-]?out)\b/i.test(
      body,
    );

    if (!instructsOptOut || negated)
      problems.push({
        severity: "blocker",
        message:
          "A promotional message must tell people how to stop receiving them. Add an unsubscribe line.",
      });
  }

  if (draft.channel === "sms" && body.length > SMS_LIMIT)
    problems.push({
      severity: "warning",
      message: `${body.length} characters will send as ${Math.ceil(body.length / SMS_LIMIT)} messages and be billed as such.`,
    });

  if (/\{\{\s*\w+\s*\}\}/.test(body))
    problems.push({
      severity: "blocker",
      message: "The message still contains an unfilled placeholder.",
    });

  return problems;
}

/** Whether a draft may be sent. */
export function canSend(draft: MessageDraft, audience: AudienceResult): {
  ok: boolean;
  reason: string;
} {
  const problems = checkMessage(draft);
  const blocker = problems.find((p) => p.severity === "blocker");
  if (blocker) return { ok: false, reason: blocker.message };

  if (audience.recipients.length === 0)
    return { ok: false, reason: "Nobody in this audience can be messaged." };

  return {
    ok: true,
    reason: `Ready to send to ${audience.recipients.length} recipient${audience.recipients.length === 1 ? "" : "s"}.`,
  };
}

/**
 * Fills the personal fields a message offers.
 *
 * Only the recipient's own details, and only fields the platform holds — a
 * template cannot reach into anything else.
 */
export function personalise(body: string, contact: Contact): string {
  return body
    .replace(/\[name\]/gi, contact.fullName)
    .replace(/\[first name\]/gi, contact.fullName.trim().split(/\s+/)[0] ?? contact.fullName)
    .replace(/\[city\]/gi, contact.city)
    .replace(/\[club\]/gi, contact.club);
}
