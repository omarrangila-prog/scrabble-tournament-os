import type { MetadataRoute } from "next";
import { buildEventSeed } from "@/lib/domain/eventSeed";
import { splitEventsForPublic } from "@/lib/domain/events";
import { SITE_URL } from "@/lib/seo";

/**
 * The sitemap.
 *
 * Lists only public, canonical URLs. Organizer screens, participant links and
 * check-in records are deliberately absent: they are either private or unique to
 * one person, and neither belongs in search results.
 *
 * Events come from the same seed the pages read, so publishing an event adds it
 * here without a separate step. Drafts are excluded by `splitEventsForPublic` —
 * listing an unannounced event would publish a date nobody has committed to.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const { upcoming, past } = splitEventsForPublic(buildEventSeed().events);

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...upcoming.map((e) => ({
      url: `${SITE_URL}/events/${e.slug}`,
      lastModified: new Date(e.publishedAt ?? e.createdAt),
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...past.map((e) => ({
      url: `${SITE_URL}/events/${e.slug}`,
      lastModified: new Date(e.publishedAt ?? e.createdAt),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
