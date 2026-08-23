import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Certificate } from "@/components/results/Certificate";
import {
  EVENT,
  allPlayers,
  findPlayer,
  formatRecord,
  citationFor,
  ordinal,
  margin,
  withSign,
} from "@/lib/domain/eventRecord";

export function generateStaticParams() {
  return allPlayers().map(({ player }) => ({ slug: player.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findPlayer(slug);
  if (!entry) return { title: "Blufy's AlphaBattle" };
  return {
    title: `${entry.player.name} — Blufy's AlphaBattle`,
    description: `Round-by-round record and final position in the ${entry.division.name} division.`,
  };
}

const VERDICT: Record<string, { label: string; colour: string }> = {
  won: { label: "Won", colour: "#4FA87A" },
  lost: { label: "Lost", colour: "#D08A7A" },
  drew: { label: "Drew", colour: "#C89B3C" },
  bye: { label: "No game", colour: "#8A8A8A" },
};

/**
 * One player's whole tournament, and the certificate that comes out of it.
 *
 * Every round is shown, including one sat out, because a record with a round quietly
 * missing invites the reader to wonder what happened to it. The certificate sits below the
 * table on purpose: the reason it says what it says is the thing directly above it.
 */
export default async function PlayerRecordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = findPlayer(slug);
  if (!entry) notFound();

  const { player, division } = entry;
  const rankedCount = division.players.filter((p) => p.ranked).length;

  return (
    <main
      className="min-h-dvh px-5 py-10 sm:px-8 sm:py-16"
      style={{
        background:
          "radial-gradient(120% 70% at 50% -10%, #16241C 0%, #0E1512 70%)",
        color: "#F4EFE4",
      }}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href="/results"
          className="text-sm text-white/50 underline hover:text-white"
        >
          All results
        </Link>

        <header className="mt-6 border-b border-white/10 pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C89B3C]">
            {division.name} Division · 23 August 2026
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {player.name}
          </h1>

          <dl className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
            <Stat
              label="Position"
              value={
                player.ranked
                  ? `${player.rank} of ${rankedCount}`
                  : "Not ranked"
              }
            />
            <Stat label="Record" value={formatRecord(player)} />
            <Stat label="Spread" value={withSign(player.spread)} />
          </dl>
        </header>

        <section className="mt-10">
          <h2 className="text-lg font-extrabold uppercase tracking-[0.14em] text-[#4FA87A]">
            Every round
          </h2>

          <ul className="mt-4 space-y-3">
            {player.rounds.map((round) => {
              const verdict = VERDICT[round.result];
              const gap = margin(round);
              return (
                <li
                  key={round.round}
                  className="rounded-xl border border-white/10 p-4"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                      Round {round.round}
                    </p>
                    <p
                      className="text-sm font-extrabold"
                      style={{ color: verdict.colour }}
                    >
                      {verdict.label}{" "}
                      {gap !== null &&
                      round.result !== "bye" &&
                      round.result !== "drew" ? (
                        <span className="font-semibold text-white/45">
                          by {Math.abs(gap)}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  {round.result === "bye" ? (
                    <p className="mt-2 text-white/60">
                      No game this round — {player.name.split(" ")[0]} sat the
                      round out.
                    </p>
                  ) : (
                    <div className="mt-2 flex items-center gap-4">
                      <p className="min-w-0 flex-1">
                        <span className="block text-2xl font-extrabold tabular-nums">
                          {round.scoreFor}
                          <span className="mx-2 text-white/30">&ndash;</span>
                          {round.scoreAgainst}
                        </span>
                        <span className="mt-1 block text-sm text-white/60">
                          against{" "}
                          <span className="font-semibold text-white/85">
                            {round.opponent ?? "an opponent"}
                          </span>
                        </span>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-extrabold uppercase tracking-[0.14em] text-[#4FA87A]">
            Certificate
          </h2>
          <Certificate
            name={player.name}
            citation={citationFor(player, division)}
            division={division.name}
            position={
              player.ranked
                ? `${ordinal(player.rank!)} of ${rankedCount}`
                : null
            }
          />
        </section>

        <nav className="mt-12 border-t border-white/10 pt-6 text-sm text-white/50">
          <p>
            Same division:{" "}
            {division.players
              .filter((p) => p.slug !== player.slug)
              .slice(0, 6)
              .map((p, i) => (
                <span key={p.slug}>
                  {i > 0 ? " · " : ""}
                  <Link
                    href={`/results/${p.slug}`}
                    className="underline hover:text-white"
                  >
                    {p.name}
                  </Link>
                </span>
              ))}
          </p>
          <p className="mt-3">
            Scores as published by the Pakistan Scrabble Association for{" "}
            {EVENT.name}, unchanged.
          </p>
        </nav>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border border-white/10 px-3 py-3"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <dt className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/45">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
