import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pakistan National Scrabble Championship 2026 — Live",
  description: "Live pairings, results and standings.",
};

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
