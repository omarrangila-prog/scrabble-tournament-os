import type { Metadata } from "next";

/**
 * What a shared link looks like. This page is passed around on WhatsApp more than it is browsed
 * to, so the preview — not the page — is what most people see first.
 */
export const metadata: Metadata = {
  title: "Mafia Wars",
  description:
    "Mafia Wars, hosted by Blufy's Alphabattle and Upstairs. Sunday 22 November, 4:30 – 5:30 pm at The Social, Karachi. PKR 1,400 a head, food included.",
  alternates: { canonical: "/mafia" },
  openGraph: {
    type: "website",
    title: "Mafia Wars — will you be joining us?",
    description:
      "22 Nov, 4:30 – 5:30 pm, The Social, Karachi. PKR 1,400 a head, food included.",
    url: "/mafia",
  },
};

export default function MafiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
