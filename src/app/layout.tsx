import type { Metadata, Viewport } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/seo";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/design/theme";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/**
 * Site metadata.
 *
 * The title template names the brand on every page without repeating it in each
 * one, and `metadataBase` is what makes canonical and Open Graph URLs absolute —
 * relative ones produce link previews that resolve to nothing when shared.
 *
 * The old title and description described the software to an organizer. The
 * public site is what search engines and WhatsApp previews will show, so both
 * now describe the events.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Blufy's Alphabattle | Scrabble & Social Events in Karachi",
    template: "%s | Blufy's Alphabattle",
  },
  description:
    "Discover Scrabble tournaments, board-game nights and social experiences in Karachi. Register in minutes — no app and no account needed.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Blufy's Alphabattle",
    locale: "en_PK",
    url: SITE_URL,
    title: "Blufy's Alphabattle | Scrabble & Social Events in Karachi",
    description:
      "Scrabble tournaments, board-game nights and social experiences in Karachi.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FD" },
    { media: "(prefers-color-scheme: dark)", color: "#090B1A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint to avoid a light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
