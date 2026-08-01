import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/design/theme";

export const metadata: Metadata = {
  title: "Live Display — Pakistan National Scrabble Championship 2026",
  description: "Venue display: pairings, standings and announcements.",
};

/**
 * Broadcast and venue screens are always dark, regardless of the operator's
 * app preference — high contrast reads better across a hall and on a projector.
 */
export default function TvLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider forced="dark">{children}</ThemeProvider>;
}
