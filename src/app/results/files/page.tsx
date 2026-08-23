import type { Metadata } from "next";
import Link from "next/link";

import { FileList, type FileRow } from "@/components/results/FileList";
import {
  EVENT,
  citationFor,
  formatRecord,
  ordinal,
  withSign,
} from "@/lib/domain/eventRecord";

export const metadata: Metadata = {
  title: "Blufy's AlphaBattle — Download your record",
  description:
    "Every player's results and certificate from Blufy's AlphaBattle, 23 August 2026, ready to download.",
};

/** One folder, every player's file in it, names on the outside. */
export default function FilesPage() {
  const rows: FileRow[] = EVENT.divisions.flatMap((division) => {
    const field = division.players.filter((p) => p.ranked).length;
    return division.players.map((player) => {
      const position = player.ranked
        ? `${ordinal(player.rank!)} of ${field}`
        : null;
      return {
        slug: player.slug,
        name: player.name,
        division: division.name,
        position,
        document: {
          name: player.name,
          division: division.name,
          citation: citationFor(player, division),
          position,
          record: formatRecord(player),
          spread: withSign(player.spread),
          rounds: player.rounds,
        },
      };
    });
  });

  return (
    <main
      className="min-h-dvh px-5 py-10 sm:px-8 sm:py-16"
      style={{ background: "#FBF7EE", color: "#4A2E2A" }}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href="/results"
          className="text-sm underline"
          style={{ color: "#8A7568" }}
        >
          Final standings
        </Link>

        <header className="mt-6">
          <p
            className="text-xs font-bold uppercase tracking-[0.24em]"
            style={{ color: "#A97B3F" }}
          >
            23 August 2026 · Karachi
          </p>
          <h1 className="font-display mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Download your record
          </h1>
          <p
            className="mt-3 text-base leading-relaxed"
            style={{ color: "#6B5A50" }}
          >
            One file for every player who took part. Each is two pages: all
            three rounds with your opponents and scores, then your certificate.
            Find your name and press Download.
          </p>
        </header>

        <FileList rows={rows} />

        <footer
          className="mt-12 border-t pt-6 text-sm"
          style={{ borderColor: "rgba(199,154,91,0.35)", color: "#8A7568" }}
        >
          Scores as published by the Pakistan Scrabble Association, unchanged.
        </footer>
      </div>
    </main>
  );
}
