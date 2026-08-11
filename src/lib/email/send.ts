/**
 * Sending email.
 *
 * Server-only. The provider key must never reach a browser, so nothing here may be
 * imported from a client component — the API route is the only caller.
 *
 * Plain `fetch` rather than a provider SDK. One HTTP call does not justify a dependency,
 * and the failure modes are easier to see when the request is visible.
 *
 * Two providers, because they solve different problems:
 *
 *   Brevo verifies a single sender *address*, by emailing it a link. No DNS, no domain
 *     purchase, and mail reaches anybody. This is what makes sending possible for an
 *     organizer who does not own a domain.
 *
 *   Resend verifies a *domain*. Better deliverability, but until a domain is verified it
 *     will only deliver to the account owner — which for a participant list of forty is
 *     the same as not sending at all.
 *
 * Whichever key is present is used, Brevo first. Nothing here asks the caller to choose:
 * the screens send email, and which provider carries it is deployment configuration.
 *
 * The result is a discriminated union rather than a boolean. "It did not send" covers
 * three very different situations — nothing is configured, the provider refused the
 * address, the provider is down — and a screen that cannot tell them apart cannot tell
 * the user what to do next.
 */

export type SendResult =
  | { ok: true; id: string }
  /** No provider configured. Not a failure to report as one. */
  | { ok: false; reason: "not-configured"; message: string }
  | { ok: false; reason: "rejected"; message: string }
  | { ok: false; reason: "unavailable"; message: string };

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type Provider = "brevo" | "resend" | "none";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

function brevoKey(): string | undefined {
  return process.env.BREVO_API_KEY?.trim() || undefined;
}

function resendKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

/**
 * Which provider will carry the mail.
 *
 * Brevo wins when both are present, because it is the one that can reach participants
 * without a verified domain. A deployment holding both keys is a deployment mid-migration,
 * and the one that delivers is the safer default.
 */
export function provider(): Provider {
  if (brevoKey()) return "brevo";
  if (resendKey()) return "resend";
  return "none";
}

/**
 * The name and address mail is sent from.
 *
 * `EMAIL_FROM` may be written either way — `a@b.com` or `Name <a@b.com>` — because both
 * are what people paste. Brevo wants the two apart, Resend takes them together, so the
 * parsing happens once here rather than at each call.
 */
export function fromParts(raw?: string): { name?: string; email: string } {
  const value = (raw ?? process.env.EMAIL_FROM ?? "").trim();

  const angled = value.match(/^(.*?)<\s*([^>]+?)\s*>$/);
  if (angled) {
    const name = angled[1].trim().replace(/^["']|["']$/g, "").trim();
    return { name: name || undefined, email: angled[2].trim() };
  }

  /*
   * No address configured falls back to Resend's shared sender, which delivers only to
   * the account owner. That is the correct fallback: it is testable, and it fails in the
   * direction of "the director sees nothing arrived" rather than a refused send.
   */
  return { email: value || "onboarding@resend.dev" };
}

/** Whether email can be sent at all, so a screen can say so before offering it. */
export function isEmailConfigured(): boolean {
  return provider() !== "none";
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

const UNREACHABLE: SendResult = {
  ok: false,
  reason: "unavailable",
  message: "Could not reach the email provider. Please try again.",
};

export async function sendEmail(email: Email): Promise<SendResult> {
  switch (provider()) {
    case "brevo":
      return sendViaBrevo(email);
    case "resend":
      return sendViaResend(email);
    default:
      return {
        ok: false,
        reason: "not-configured",
        message:
          "Email is not set up. Add BREVO_API_KEY and EMAIL_FROM to the hosting " +
          "project's environment variables and redeploy.",
      };
  }
}

async function sendViaBrevo(email: Email): Promise<SendResult> {
  const key = brevoKey()!;
  const sender = fromParts();

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: sender.name ? { name: sender.name, email: sender.email } : { email: sender.email },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
  } catch {
    /*
     * The network, not the provider. Worth separating: a director seeing this should try
     * again rather than go looking at their email account.
     */
    return UNREACHABLE;
  }

  const body = (await response.json().catch(() => null)) as
    | { messageId?: string; message?: string; code?: string }
    | null;

  if (!response.ok) {
    /*
     * The provider's own message is passed through. It is usually the specific and
     * actionable one — "sender not valid", "invalid recipient" — and replacing it with
     * something generic throws away the only useful information in the reply.
     */
    return {
      ok: false,
      reason: "rejected",
      message: body?.message ?? `The email provider refused this message (${response.status}).`,
    };
  }

  if (!body?.messageId) {
    return {
      ok: false,
      reason: "unavailable",
      message: "The email provider accepted the message without confirming it.",
    };
  }

  return { ok: true, id: String(body.messageId) };
}

async function sendViaResend(email: Email): Promise<SendResult> {
  const key = resendKey()!;
  const sender = fromParts();

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender.name ? `${sender.name} <${sender.email}>` : sender.email,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
  } catch {
    return UNREACHABLE;
  }

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null;

  if (!response.ok) {
    return {
      ok: false,
      reason: "rejected",
      message: body?.message ?? `The email provider refused this message (${response.status}).`,
    };
  }

  if (!body?.id) {
    return {
      ok: false,
      reason: "unavailable",
      message: "The email provider accepted the message without confirming it.",
    };
  }

  return { ok: true, id: body.id };
}

/* -------------------------------------------------------------------------- */
/* Deliverability                                                             */
/* -------------------------------------------------------------------------- */

export interface Deliverability {
  configured: boolean;
  provider: Provider;
  /** The address mail is sent from. */
  from: string;
  /**
   * What the provider has verified, and what it says about each: sender addresses for
   * Brevo, domains for Resend. Named for what it means rather than for either provider's
   * word for it.
   */
  identities: { name: string; status: string }[];
  /** True when mail will reach somebody other than the account owner. */
  canReachAnyone: boolean;
  /** What to do about it, in the terms of whichever provider is configured. */
  fix?: string;
  /** Set when something prevented the check itself. */
  problem?: string;
}

/**
 * Whether mail will actually arrive, asked before anybody tries to send forty of them.
 *
 * Both providers accept a send request and then refuse delivery until an identity is
 * verified. Discovering that one refusal at a time, forty times, on the day certificates
 * go out, is the wrong moment: the director needs to know before they start that "Email
 * all" will reach one person.
 *
 * A failure to check is reported as unknown rather than as "fine". An unverified guess in
 * the optimistic direction is exactly what this exists to prevent.
 */
export async function checkDeliverability(): Promise<Deliverability> {
  const which = provider();
  const sender = fromParts();

  const base: Deliverability = {
    configured: which !== "none",
    provider: which,
    from: sender.name ? `${sender.name} <${sender.email}>` : sender.email,
    identities: [],
    canReachAnyone: false,
  };

  if (which === "brevo") return brevoDeliverability(base, sender.email);
  if (which === "resend") return resendDeliverability(base);
  return base;
}

async function brevoDeliverability(
  base: Deliverability,
  fromAddress: string,
): Promise<Deliverability> {
  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": brevoKey()!, Accept: "application/json" },
    });
  } catch {
    return { ...base, problem: "Could not reach the email provider to check delivery." };
  }

  if (!response.ok) {
    return {
      ...base,
      problem: `The email provider would not report its senders (${response.status}).`,
    };
  }

  const body = (await response.json().catch(() => null)) as
    | { senders?: { email?: string; name?: string; active?: boolean }[] }
    | null;

  const identities = (body?.senders ?? []).flatMap((s) =>
    s?.email
      ? [{ name: String(s.email), status: s.active ? "verified" : "pending" }]
      : [],
  );

  /*
   * The sending address itself must be verified — not merely some address on the account.
   * Brevo refuses a send from an unverified sender, so "one of your senders is verified"
   * is not the question being asked.
   */
  const mine = identities.find(
    (i) => i.name.toLowerCase() === fromAddress.toLowerCase(),
  );

  return {
    ...base,
    identities,
    canReachAnyone: mine?.status === "verified",
    fix: mine
      ? mine.status === "verified"
        ? undefined
        : `${fromAddress} is added to Brevo but not confirmed yet. Open the confirmation email Brevo sent to that address and click the link.`
      : identities.length
        ? `EMAIL_FROM is ${fromAddress}, which is not a sender on this Brevo account. Set it to one of: ${identities
            .map((i) => i.name)
            .join(", ")}.`
        : "No sender is set up on this Brevo account yet. Add one under Senders, confirm it from the email Brevo sends you, then set EMAIL_FROM to that address.",
  };
}

async function resendDeliverability(base: Deliverability): Promise<Deliverability> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${resendKey()!}` },
    });
  } catch {
    return { ...base, problem: "Could not reach the email provider to check delivery." };
  }

  if (!response.ok) {
    return {
      ...base,
      problem: `The email provider would not report its domains (${response.status}).`,
    };
  }

  const body = (await response.json().catch(() => null)) as
    | { data?: { name?: string; status?: string }[] }
    | null;

  const identities = (body?.data ?? []).flatMap((d) =>
    d?.name ? [{ name: String(d.name), status: String(d.status ?? "unknown") }] : [],
  );

  const verified = identities.some((d) => d.status.toLowerCase() === "verified");

  return {
    ...base,
    identities,
    canReachAnyone: verified,
    fix: verified
      ? undefined
      : "No domain is verified with Resend, so mail reaches only the account owner. Verify one at resend.com/domains, or switch to Brevo, which verifies a single address and needs no domain.",
  };
}
