"use client";

import * as React from "react";

import type { Deliverability } from "./send";

/**
 * Whether email will actually arrive, asked once per screen.
 *
 * The provider accepts every send request and then refuses delivery to anybody but the
 * account owner until a domain is verified. Without this the director finds that out one
 * bounce at a time, on the day, having already told forty people to expect a certificate.
 */
export function useDeliverability(): { status: Deliverability | null; loaded: boolean } {
  const [status, setStatus] = React.useState<Deliverability | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let live = true;

    (async () => {
      try {
        const r = await fetch("/api/email");
        const body = (await r.json()) as Deliverability;
        if (!live) return;
        setStatus(body);
      } catch {
        if (live) setStatus(null);
      } finally {
        if (live) setLoaded(true);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  return { status, loaded };
}

/**
 * A WhatsApp link for one recipient.
 *
 * The realistic channel for this event: every entrant gives a mobile number, and no
 * domain has to be verified for a message to arrive. Returns null when there is no number
 * to send to, so the control can be absent rather than dead.
 *
 * Pakistani numbers are written locally as 03xx…; wa.me needs them in international form.
 */
export function whatsappLink(mobile: string, message: string): string | null {
  const digits = (mobile ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;

  let international = digits;
  if (international.startsWith("0")) international = `92${international.slice(1)}`;
  else if (international.startsWith("92")) {
    /* Already international. */
  } else if (international.length === 10) international = `92${international}`;

  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}
