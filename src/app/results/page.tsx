import type { Metadata } from "next";
import Link from "next/link";

import {
  EVENT,
  formatRecord,
  playedRounds,
  withSign,
} from "@/lib/domain/eventRecord";

export const metadata: Metadata = {
  title: "Blufy's AlphaBattle — Final Results",
  description:
    "Final standings and every player's round-by-round record from Blufy's AlphaBattle, 23 August 2026, Karachi.",
};

/**
 * The event's record, for everybody who played.
 *
 * Placements, records and scores are the official ones published by the Pakistan Scrabble
 * Association; nothing here is recomputed, so this page and the ranking report cannot
 * disagree. Names and scores only — the same things already on the public report.
 *
 * On the certificate's own paper colours rather than the app's dark chrome, because this is
 * the part of the product a participant keeps.
 */
export default function ResultsPage() {
  const played = EVENT.divisions.reduce(
    (total, d) =>
      total + d.players.reduce((n, p) => n + playedRounds(p).length, 0),
    0,
  );

  return (
    <main
      className="min-h-dvh px-5 py-10 sm:px-8 sm:py-16"
      style={{ background: "#FBF7EE", color: "#4A2E2A" }}
    >
      <div className="mx-auto max-w-4xl">
        <header
          className="border-b pb-8"
          style={{ borderColor: "rgba(199,154,91,0.35)" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.24em]"
            style={{ color: "#A97B3F" }}
          >
            23 August 2026 · Chai Chatt, Karachi
          </p>
          <h1 className="font-display mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Blufy&rsquo;s AlphaBattle
          </h1>
          <p
            className="mt-3 max-w-2xl text-base leading-relaxed"
            style={{ color: "#6B5A50" }}
          >
            The complete event record: three rounds,{" "}
            {EVENT.divisions.reduce((n, d) => n + d.players.length, 0)} players,{" "}
            {Math.round(played / 2)} games played. Open your name to see every
            opponent you faced, your score in each game, and where you finished
            in your category.
          </p>

          <Link
            href="/results/files"
            className="mt-6 inline-block rounded-lg px-5 py-3 text-sm font-bold text-white transition hover:opacity-90"
            style={{ background: "#4A2E2A" }}
          >
            Download your results and certificate
          </Link>
        </header>

        {EVENT.divisions.map((division) => {
          const ranked = division.players.filter((p) => p.ranked);
          const unranked = division.players.filter((p) => !p.ranked);

          return (
            <section key={division.code} className="mt-12">
              <h2 className="font-display text-2xl font-black tracking-tight">
                {division.name}
                <span
                  className="ml-2 text-base font-semibold"
                  style={{ color: "#9A867A" }}
                >
                  {ranked.length} players
                </span>
              </h2>

              <ul
                className="mt-4 overflow-hidden rounded-xl border bg-white"
                style={{ borderColor: "rgba(199,154,91,0.4)" }}
              >
                {ranked.map((player, i) => (
                  <li
                    key={player.slug}
                    style={{
                      borderTop:
                        i === 0 ? "none" : "1px solid rgba(199,154,91,0.22)",
                    }}
                  >
                    <Link
                      href={`/results/${player.slug}`}
                      className="flex items-center gap-3 px-3 py-3 transition hover:bg-[#FBF3E4] sm:gap-4 sm:px-4"
                    >
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-extrabold tabular-nums"
                        style={
                          player.rank! <= 2
                            ? { background: "#C79A5B", color: "#FFFDF7" }
                            : { background: "#F3EADA", color: "#7A6558" }
                        }
                      >
                        {player.rank}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {player.name}
                        </span>
                        {player.rank! <= 2 ? (
                          <span
                            className="text-xs font-bold uppercase tracking-wider"
                            style={{ color: "#A97B3F" }}
                          >
                            {player.rank === 1 ? "1st place" : "2nd place"}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="shrink-0 text-right text-sm tabular-nums"
                        style={{ color: "#7A6558" }}
                      >
                        <span
                          className="block font-bold"
                          style={{ color: "#4A2E2A" }}
                        >
                          {formatRecord(player)}
                        </span>
                        <span className="block text-xs">
                          {withSign(player.spread)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {unranked.length > 0 ? (
                <p className="mt-3 text-sm" style={{ color: "#8A7568" }}>
                  Also played, not ranked in the final standings:{" "}
                  {unranked.map((p, i) => (
                    <span key={p.slug}>
                      {i > 0 ? ", " : ""}
                      <Link href={`/results/${p.slug}`} className="underline">
                        {p.name}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              ) : null}
            </section>
          );
        })}

        <footer
          className="mt-14 border-t pt-6 text-sm"
          style={{ borderColor: "rgba(199,154,91,0.35)", color: "#8A7568" }}
        >
          Results as published by the Pakistan Scrabble Association. Every score
          on this site is taken from that report unchanged.
        </footer>
      </div>
    </main>
  );
}
