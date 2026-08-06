import type { Metadata, Viewport } from "next";
import { Manrope, Fraunces, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/design/theme";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});
/*
 * Display face for participant-facing headlines.
 *
 * Manrope is a clean UI sans and stays the interface font. Headlines on the
 * public pages carry the printed poster's character, which a UI sans cannot —
 * Fraunces is a high-contrast display serif with a soft, slightly playful axis
 * that suits a games evening without becoming a novelty face.
 */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  // Variable weight: axes cannot be combined with a fixed weight list, and the
  // full range is what lets one face carry both headlines and small labels.
  axes: ["SOFT", "WONK"],
  display: "swap",
});

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bluffy Alphabattle",
  description:
    "Registration, seating, pairings, scoring and live results — beautifully connected.",
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
      className={`${manrope.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
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
