import type { Metadata } from "next";
import Link from "next/link";

import {
  EVENT,
  formatRecord,
  withSign,
  playedRounds,
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
      style={{
        background:
          "radial-gradient(120% 70% at 50% -10%, #16241C 0%, #0E1512 70%)",
        color: "#F4EFE4",
      }}
    >
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-white/10 pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C89B3C]">
            23 August 2026 · Karachi
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Blufy&rsquo;s AlphaBattle
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/70">
            The complete event record: three rounds,{" "}
            {EVENT.divisions.reduce((n, d) => n + d.players.length, 0)} players,{" "}
            {Math.round(played / 2)} games played. Open your name to see every
            opponent you faced, your score in each game, and where you finished
            in your category.
          </p>

          <Link
            href="/results/files"
            className="mt-6 inline-block rounded-lg px-5 py-3 text-sm font-bold transition hover:opacity-90"
            style={{ background: "#C89B3C", color: "#0E1512" }}
          >
            Download your results and certificate
          </Link>
        </header>

        {EVENT.divisions.map((division) => {
          const ranked = division.players.filter((p) => p.ranked);
          const unranked = division.players.filter((p) => !p.ranked);

          return (
            <section key={division.code} className="mt-12">
              <h2 className="text-2xl font-extrabold tracking-tight text-[#4FA87A]">
                {division.name}
                <span className="ml-2 text-base font-semibold text-white/40">
                  {ranked.length} players
                </span>
              </h2>

              <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                {ranked.map((player) => (
                  <li key={player.slug}>
                    <Link
                      href={`/results/${player.slug}`}
                      className="flex items-center gap-3 px-3 py-3 transition hover:bg-white/5 sm:gap-4 sm:px-4"
                    >
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-extrabold tabular-nums"
                        style={
                          player.rank! <= 2
                            ? { background: "#C89B3C", color: "#0E1512" }
                            : {
                                background: "rgba(255,255,255,0.07)",
                                color: "#F4EFE4",
                              }
                        }
                      >
                        {player.rank}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {player.name}
                        </span>
                        {player.rank! <= 2 ? (
                          <span className="text-xs font-bold uppercase tracking-wider text-[#C89B3C]">
                            {player.rank === 1 ? "1st place" : "2nd place"}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right text-sm tabular-nums text-white/70">
                        <span className="block font-bold text-white">
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
                <p className="mt-3 text-sm text-white/50">
                  Also played, not ranked in the final standings:{" "}
                  {unranked.map((p, i) => (
                    <span key={p.slug}>
                      {i > 0 ? ", " : ""}
                      <Link
                        href={`/results/${p.slug}`}
                        className="underline hover:text-white"
                      >
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

        <footer className="mt-14 border-t border-white/10 pt-6 text-sm text-white/45">
          Results as published by the Pakistan Scrabble Association. Every score
          on this site is taken from that report unchanged.
        </footer>
      </div>
    </main>
  );
}
