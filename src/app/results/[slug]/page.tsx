import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Certificate } from "@/components/results/Certificate";
import {
  allPlayers,
  findPlayer,
  formatRecord,
  margin,
  ordinal,
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
  won: { label: "Won", colour: "#2F7D52" },
  lost: { label: "Lost", colour: "#A85541" },
  drew: { label: "Drew", colour: "#A97B3F" },
  bye: { label: "No game", colour: "#8A7568" },
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
  /* The design turns into an achievement certificate when a placement is passed to it. */
  const placement =
    player.ranked && player.rank! <= 2
      ? `${ordinal(player.rank!)} place, ${division.name} division`
      : undefined;

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
          All results
        </Link>

        <header
          className="mt-6 border-b pb-8"
          style={{ borderColor: "rgba(199,154,91,0.35)" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.24em]"
            style={{ color: "#A97B3F" }}
          >
            {division.name} Division · 23 August 2026
          </p>
          <h1 className="font-display mt-3 text-4xl font-black tracking-tight sm:text-5xl">
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
          <h2
            className="text-sm font-bold uppercase tracking-[0.18em]"
            style={{ color: "#A97B3F" }}
          >
            Every round
          </h2>

          <ul className="mt-4 space-y-3">
            {player.rounds.map((round) => {
              const verdict = VERDICT[round.result];
              const gap = margin(round);
              return (
                <li
                  key={round.round}
                  className="rounded-xl border bg-white p-4"
                  style={{ borderColor: "rgba(199,154,91,0.4)" }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className="text-xs font-bold uppercase tracking-[0.16em]"
                      style={{ color: "#9A867A" }}
                    >
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
                        <span
                          className="font-semibold"
                          style={{ color: "#9A867A" }}
                        >
                          by {Math.abs(gap)}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  {round.result === "bye" ? (
                    <p className="mt-2" style={{ color: "#6B5A50" }}>
                      No game this round — {player.name.split(" ")[0]} sat the
                      round out.
                    </p>
                  ) : (
                    <p className="mt-2">
                      <span className="font-display block text-2xl font-black tabular-nums">
                        {round.scoreFor}
                        <span className="mx-2" style={{ color: "#C79A5B" }}>
                          &ndash;
                        </span>
                        {round.scoreAgainst}
                      </span>
                      <span
                        className="mt-1 block text-sm"
                        style={{ color: "#6B5A50" }}
                      >
                        against{" "}
                        <span
                          className="font-semibold"
                          style={{ color: "#4A2E2A" }}
                        >
                          {round.opponent ?? "an opponent"}
                        </span>
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-12">
          <h2
            className="text-sm font-bold uppercase tracking-[0.18em]"
            style={{ color: "#A97B3F" }}
          >
            Certificate
          </h2>
          <Certificate
            name={player.name}
            placement={placement}
            document={{
              name: player.name,
              division: division.name,
              placement,
              position: player.ranked
                ? `${ordinal(player.rank!)} of ${rankedCount}`
                : null,
              record: formatRecord(player),
              spread: withSign(player.spread),
              rounds: player.rounds,
            }}
          />
        </section>

        <nav
          className="mt-12 border-t pt-6 text-sm"
          style={{ borderColor: "rgba(199,154,91,0.35)", color: "#8A7568" }}
        >
          <p>
            Same division:{" "}
            {division.players
              .filter((p) => p.slug !== player.slug)
              .slice(0, 6)
              .map((p, i) => (
                <span key={p.slug}>
                  {i > 0 ? " · " : ""}
                  <Link href={`/results/${p.slug}`} className="underline">
                    {p.name}
                  </Link>
                </span>
              ))}
          </p>
          <p className="mt-3">
            Scores as published by the Pakistan Scrabble Association, unchanged.
          </p>
        </nav>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border bg-white px-3 py-3"
      style={{ borderColor: "rgba(199,154,91,0.4)" }}
    >
      <dt
        className="text-[0.65rem] font-bold uppercase tracking-[0.16em]"
        style={{ color: "#9A867A" }}
      >
        {label}
      </dt>
      <dd className="mt-1 text-lg font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
