"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { officialOrDerivedStandings, type PublicStanding } from "@/lib/supabase/submitResult";
import { readPublicEvent } from "@/lib/supabase/events";

/**
 * The event's record, for everybody who played — read from the database.
 *
 * The August results live at `/results` as a static page: that tournament is finished, its
 * figures were published by the association, and a page that recomputed them could only
 * disagree with the printed report. This is the same page for an event that is still being
 * played, so it reads the standings instead of carrying them.
 *
 * Same paper as the certificate, deliberately. This is the part of the product a participant
 * keeps, opens on their phone in the room, and sends to somebody — it should not look like
 * the organiser's dark control room.
 *
 * Placements come from the standings the database computes: wins first, then spread. Nothing
 * is recomputed here, so this page and the wall cannot disagree about who is ahead.
 */

const PAPER = "#FBF7EE";
const INK = "#4A2E2A";
const MUTED = "#6B5A50";
const FAINT = "#9A867A";
const BRASS = "#A97B3F";
const GILT = "#C79A5B";
const RULE = "rgba(199,154,91,0.35)";

const DIVISION_ORDER = ["beginner", "recreational", "advanced", "masters"];
const DIVISION_LABEL: Record<string, string> = {
  beginner: "Beginner",
  recreational: "Recreational",
  advanced: "Advanced",
  masters: "Masters",
};

export default function LiveResultsPage() {
  const params = useParams<{ eventSlug: string }>();
  const slug = decodeURIComponent(params.eventSlug ?? "");

  const [eventName, setEventName] = React.useState("");
  const [eventId, setEventId] = React.useState("");
  /* The venue and date as the event records them — not as this file assumes them. */
  const [venue, setVenue] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [rows, setRows] = React.useState<PublicStanding[]>([]);
  const [source, setSource] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const event = await readPublicEvent(slug);
      if (!live) return;

      if (!event) {
        setLoaded(true);
        return;
      }
      setEventName(event.name);
      setEventId(event.id);
      setVenue(
        [event.details.venueName, event.details.city].filter(Boolean).join(", "),
      );
      setStartDate(event.details.startDate ?? "");

      const table = await officialOrDerivedStandings(event.id);
      if (!live) return;
      setRows(table.rows);
      setSource(table.source);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, [slug]);

  /*
   * Re-read while the day is running. Somebody refreshing this on their phone between rounds
   * should see the round that just finished, not the page they opened an hour ago.
   */
  React.useEffect(() => {
    if (!eventId) return;
    const id = window.setInterval(() => {
      void officialOrDerivedStandings(eventId).then((t) => {
        setRows(t.rows);
        setSource(t.source);
      });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [eventId]);

  const divisions = DIVISION_ORDER.map((division) => ({
    division,
    players: rows.filter((r) => r.division === division),
  })).filter((d) => d.players.length > 0);

  const totalPlayers = rows.length;
  const gamesPlayed = Math.round(rows.reduce((n, r) => n + r.played, 0) / 2);

  return (
    <main className="min-h-dvh px-5 py-10 sm:px-8 sm:py-16" style={{ background: PAPER, color: INK }}>
      <div className="mx-auto max-w-4xl">
        <header className="border-b pb-8" style={{ borderColor: RULE }}>
          <p className="text-xs font-bold uppercase tracking-[0.24em]" style={{ color: BRASS }}>
            {[formatDay(startDate), venue].filter(Boolean).join(" · ") || "Results"}
          </p>
          <h1 className="font-display mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            {eventName || "Results"}
          </h1>

          {!loaded ? (
            <p className="mt-3 text-base" style={{ color: MUTED }}>
              Reading the results…
            </p>
          ) : totalPlayers === 0 ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed" style={{ color: MUTED }}>
              No games have been recorded yet. Standings appear here as soon as the first round is
              finished, and update as the day goes on.
            </p>
          ) : (
            <p className="mt-3 max-w-2xl text-base leading-relaxed" style={{ color: MUTED }}>
              {source ? "Final standings. " : ""}
              {totalPlayers} players, {gamesPlayed} game{gamesPlayed === 1 ? "" : "s"} played. Each
              category is ranked on wins, then on spread — the points scored less the points
              conceded across every game. Open your name for your certificate.
            </p>
          )}
        </header>

        {divisions.map(({ division, players }) => (
          <section key={division} className="mt-12">
            <h2 className="font-display text-2xl font-black tracking-tight">
              {DIVISION_LABEL[division] ?? division}
              <span className="ml-2 text-base font-semibold" style={{ color: FAINT }}>
                {players.length} player{players.length === 1 ? "" : "s"}
              </span>
            </h2>

            <ul className="mt-4 overflow-hidden rounded-xl border bg-white" style={{ borderColor: "rgba(199,154,91,0.4)" }}>
              {players.map((player, i) => {
                const place = i + 1;
                /*
                 * A field of one has a leader in the arithmetic and not in any sense worth
                 * marking in gold.
                 */
                const podium = players.length > 1 && place <= 3;

                return (
                  <li
                    key={player.name + place}
                    style={{ borderTop: i === 0 ? "none" : "1px solid rgba(199,154,91,0.22)" }}
                  >
                    {/*
                      The whole row is the link. A player looking for their certificate is
                      looking for their own name, so the name is what they press.
                    */}
                    <Link
                      href={`/results/event/${slug}/${slugFor(player.name)}`}
                      className="flex items-center gap-3 px-3 py-3 transition hover:bg-[#FBF3E4] sm:gap-4 sm:px-4"
                    >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-extrabold tabular-nums"
                      style={
                        podium
                          ? { background: GILT, color: "#FFFDF7" }
                          : { background: "#F3EADA", color: "#7A6558" }
                      }
                    >
                      {place}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{player.name}</span>
                      {podium ? (
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: BRASS }}>
                          {place === 1 ? "1st place" : place === 2 ? "2nd place" : "3rd place"}
                        </span>
                      ) : null}
                    </span>

                    <span className="shrink-0 text-right text-sm tabular-nums" style={{ color: "#7A6558" }}>
                      <span className="block font-bold" style={{ color: INK }}>
                        {player.wins}–{player.losses}
                        {player.draws > 0 ? `–${player.draws}` : ""}
                      </span>
                      <span className="block text-xs">
                        {player.spread > 0 ? `+${player.spread}` : player.spread}
                      </span>
                    </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {loaded && totalPlayers > 0 ? (
          <p className="mt-12 border-t pt-6 text-sm leading-relaxed" style={{ borderColor: RULE, color: MUTED }}>
            Wins–losses{rows.some((r) => r.draws > 0) ? "–draws" : ""}, then spread. Categories play
            separately, so a placing is a placing within its own category.{" "}
            {/*
              Where the figures came from. An official table was published by the software
              that ran the pairings; nothing here is recomputed, so this page and the ranking
              report cannot disagree.
            */}
            {source ? `Published by ${source}.` : "This page updates as results are recorded."}
          </p>
        ) : null}
      </div>
    </main>
  );
}

/** "23 August 2026" — the event's own date, or nothing when it has none recorded. */
function formatDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** The same slug the certificate page resolves: lowercase, words joined by hyphens. */
function slugFor(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
