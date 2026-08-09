import type { Metadata } from "next";
import { buildEventSeed } from "@/lib/domain/eventSeed";
import { eventJsonLd, lowestPrice, SITE_URL } from "@/lib/seo";

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
function findEvent(slug: string) {
  return buildEventSeed().events.find((e) => e.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = findEvent(slug);

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
      title: `${title} | Blufy's Alphabattle`,
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
  const event = findEvent(slug);

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
