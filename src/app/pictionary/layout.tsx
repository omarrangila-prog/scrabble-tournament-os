import type { Metadata } from "next";

/**
 * What a shared link looks like.
 *
 * This page is passed around on WhatsApp more than it is browsed to, so the preview — not the
 * page — is what most people see first. Without its own, it would be announced as the site's
 * Scrabble tournament listing.
 */
export const metadata: Metadata = {
  title: "Speed Pictionary",
  description:
    "Grab a team, think fast, and get drawing! Sunday 22 November, 12 pm – 4 pm at The Social, Karachi. Ages 13 to 23, alone or as a pair, lunch included, cash prize for the winning team.",
  alternates: { canonical: "/pictionary" },
  openGraph: {
    type: "website",
    title: "Blufy's Alphabattle presents Speed Pictionary",
    description:
      "Grab a team, think fast, and get drawing! 22 Nov, 12 – 4 pm, The Social, Karachi. Ages 13 to 23. Limited spots — sign up now.",
    url: "/pictionary",
  },
};

export default function PictionaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
