import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Robots policy.
 *
 * Blocks the organizer and operational routes while leaving every public event
 * page crawlable. Written as explicit disallows rather than a blanket rule,
 * because a broad pattern is how a site accidentally de-indexes the pages it
 * most wants found.
 *
 * This keeps private areas out of search results. It is not a security control —
 * anything genuinely sensitive is protected by authentication, not by robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/organizer",
          "/app/",
          "/player",
          "/live/tv",
          // Personal links and check-in records are per-participant, not content.
          "/r/",
          "/events/*/check-in",
          "/register/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
