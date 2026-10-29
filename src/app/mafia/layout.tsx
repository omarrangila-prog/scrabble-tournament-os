import type { Metadata } from "next";
import {
  Kaushan_Script,
  Pinyon_Script,
  Playfair_Display,
} from "next/font/google";

/*
 * The poster's three voices, loaded for this route only so the rest of the app pays nothing for
 * them: a tall high-contrast serif for the title and headings, a brush script for the red second
 * word, and a calligraphic script for the invitation. Self-hosted by Next at build time, so
 * there is no request to Google when somebody opens the page and no flash of a fallback face.
 */
const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-noir-serif",
  display: "swap",
});
const brush = Kaushan_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-noir-brush",
  display: "swap",
});
const script = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-noir-script",
  display: "swap",
});

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
  return (
    <div className={`${serif.variable} ${brush.variable} ${script.variable}`}>
      {children}
    </div>
  );
}
