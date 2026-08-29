import type { Metadata } from "next";
import { buildEventSeed } from "@/lib/domain/eventSeed";
import type { PublicEvent } from "@/lib/domain/events";
import { publicEventFromStored } from "@/lib/domain/publicEvent";
import { eventJsonLd, lowestPrice, SITE_URL } from "@/lib/seo";
import { readEventForMetadata } from "@/lib/supabase/serverEvent";

/**
 * Server-side metadata for one event.
 *
 * The page itself is interactive and runs on the client, so the title, the
 * description, the canonical URL and the structured data are produced here —
 * a crawler and a WhatsApp preview both read the server response, and neither
 * runs the JavaScript that would otherwise fill them in.
 *
 * Every value comes from the event record. A preview quoting a price or a date
 * the page does not show would mislead somebody before they even arrive.
 */
/**
 * The event behind a slug, from wherever it lives.
 *
 * The seed first, because the 23 August event is defined there in full and that definition
 * is what its page charges from. Everything else is a database row — which is every event a
 * director creates through the app, and was every event this function used to call missing.
 * Both paths end in one `PublicEvent`, so the metadata below reads the same either way.
 */
async function findEvent(slug: string): Promise<PublicEvent | undefined> {
  const seeded = buildEventSeed().events.find((e) => e.slug === slug);
  if (seeded) return seeded;

  const stored = await readEventForMetadata(slug);
  return stored ? publicEventFromStored(stored) : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await findEvent(slug);

  if (!event) {
    // Nothing to describe, and nothing that should be indexed.
    return { title: "Event not found", robots: { index: false, follow: false } };
  }

  const date = new Date(event.startDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

  const title =
    event.seoTitle ?? `${date} ${event.subtitle ?? event.name} at ${event.venueName}`;

  const description =
    event.seoDescription ??
    `Join ${event.name} at ${event.venueName} in ${event.city} on ${date}. ` +
      `From ${event.currency} ${lowestPrice(event).toLocaleString("en-PK")}. ` +
      `Register online — no app or account needed.`;

  const url = `${SITE_URL}/events/${event.slug}`;

  return {
    title,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: {
      type: "website",
      url,
      title: `${title} | Blufy's AlphaBattle`,
      description,
      ...(event.socialImage ? { images: [{ url: event.socialImage }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await findEvent(slug);

  return (
    <>
      {event ? (
        <script
          type="application/ld+json"
          // Server-rendered and derived from the record, so the markup and the
          // page can never disagree about the date, venue or price.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(event)) }}
        />
      ) : null}
      {children}
    </>
  );
}
