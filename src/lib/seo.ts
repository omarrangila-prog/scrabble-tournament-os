/**
 * Public-site SEO helpers.
 *
 * One place for the canonical origin and the structured data, because a link
 * preview or a JSON-LD block that disagrees with the page is worse than none at
 * all — it puts a wrong price or a wrong date in front of somebody deciding
 * whether to come.
 */

import type { PublicEvent } from "./domain/events";
import { resolvePrice } from "./domain/pricing";

/**
 * The canonical origin.
 *
 * Read from the environment so a preview deployment does not publish canonical
 * URLs pointing at production, which would ask search engines to index the wrong
 * host.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://scrabble-tournament-os.vercel.app"
).replace(/\/$/, "");

/** The lowest price anybody can actually pay, so "from" is never overstated. */
export function lowestPrice(event: PublicEvent, now = new Date()): number {
  if (!event.priceRules) return event.fee;
  const at = now.toISOString();
  const rules = event.priceRules;

  return Math.min(
    resolvePrice(rules, { isMember: false, at }).final,
    resolvePrice(rules, { isMember: true, at }).final,
    ...rules.coupons.map((c) => resolvePrice(rules, { isMember: false, code: c.code, at }).final),
  );
}

/**
 * JSON-LD for one event.
 *
 * Only fields the record actually holds are emitted. Marking up an invented
 * image or an end time nobody set would be a false statement in machine-readable
 * form, which is the kind search engines penalise and people never see.
 */
export function eventJsonLd(event: PublicEvent, now = new Date()) {
  const url = `${SITE_URL}/events/${event.slug}`;
  const start = event.startTime
    ? `${event.startDate}T${event.startTime}:00+05:00`
    : event.startDate;

  const offer = {
    "@type": "Offer",
    url: `${url}/register`,
    price: lowestPrice(event, now),
    priceCurrency: event.currency,
    availability:
      event.state === "registration-open"
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
  };

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    ...(event.subtitle ? { alternateName: event.subtitle } : {}),
    startDate: start,
    ...(event.expectedFinish
      ? { endDate: `${event.startDate}T${event.expectedFinish}:00+05:00` }
      : {}),
    eventStatus:
      event.state === "completed" || event.state === "archived"
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description: event.seoDescription || event.shortDescription || event.description,
    /*
     * The generated share card, when the event has no image of its own. An Event without
     * an `image` is ineligible for Google's event rich results, so this is the difference
     * between a listing with a picture and a line of blue text.
     */
    image: [event.bannerImage ? `${SITE_URL}${event.bannerImage}` : `${SITE_URL}/opengraph-image`],
    location: {
      "@type": "Place",
      name: event.venueName,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.address,
        addressLocality: event.city,
        addressCountry: "PK",
      },
    },
    organizer: {
      "@type": "Organization",
      name: event.organizer,
      url: SITE_URL,
    },
    offers: offer,
    url,
  };
}

/** JSON-LD for the organization itself. Factual fields only. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Blufy's AlphaBattle",
    url: SITE_URL,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Karachi",
      addressCountry: "PK",
    },
  };
}
