/**
 * Sending email.
 *
 * Server-only. The provider key must never reach a browser, so nothing here may be
 * imported from a client component — the API route is the only caller.
 *
 * Resend over plain `fetch` rather than their SDK. One HTTP call does not justify a
 * dependency, and the failure modes are easier to see when the request is visible.
 *
 * The result is a discriminated union rather than a boolean. "It did not send"
 * covers three very different situations — nothing is configured, the provider
 * refused the address, the provider is down — and a screen that cannot tell them
 * apart cannot tell the user what to do next.
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

function apiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

/**
 * The address mail is sent from.
 *
 * Resend will only accept a domain that has been verified with them, so this is not
 * a free choice — an unverified sender is the most common reason a send is refused.
 */
function from(): string {
  return process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";
}

/** Whether email can be sent at all, so a screen can say so before offering it. */
export function isEmailConfigured(): boolean {
  return Boolean(apiKey());
}

export async function sendEmail(email: Email): Promise<SendResult> {
  const key = apiKey();

  if (!key) {
    return {
      ok: false,
      reason: "not-configured",
      message:
        "Email is not set up. Add RESEND_API_KEY and EMAIL_FROM to the hosting " +
        "project's environment variables and redeploy.",
    };
  }

  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
  } catch {
    /*
     * The network, not the provider. Worth separating: a director seeing this should
     * try again rather than go looking at their Resend account.
     */
    return {
      ok: false,
      reason: "unavailable",
      message: "Could not reach the email provider. Please try again.",
    };
  }

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null;

  if (!response.ok) {
    /*
     * The provider's own message is passed through. It is usually the specific and
     * actionable one — "domain is not verified", "invalid to address" — and replacing
     * it with something generic throws away the only useful information in the reply.
     */
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
