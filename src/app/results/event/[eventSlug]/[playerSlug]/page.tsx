"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Certificate } from "@/components/results/Certificate";
import { readPublicEvent } from "@/lib/supabase/events";
import { officialOrDerivedStandings, type PublicStanding } from "@/lib/supabase/submitResult";

/**
 * One player's certificate, from the event's official standings.
 *
 * The August event has a page like this per player, built from a file at compile time. This
 * is the same page for an event whose results live in the database — so a player opens their
 * own name from the results list and gets the organiser's designed certificate with their
 * placing on it, and a button that saves it as a PDF.
 *
 * The certificate design, its paper and both signatures come from `Certificate`. Nothing is
 * drawn here: an invented gold border would hand somebody a document that looks nothing like
 * the one the organiser thought they were giving out.
 *
 * The round-by-round table the August certificate carries is left empty. These standings were
 * published by tsh as final positions and records; the individual boards were never entered
 * here, and printing a games table this application cannot substantiate would be a document
 * making a claim nobody checked.
 */

const PAPER = "#FBF7EE";
const INK = "#4A2E2A";
const MUTED = "#6B5A50";
const BRASS = "#A97B3F";
const RULE = "rgba(199,154,91,0.35)";

const DIVISION_LABEL: Record<string, string> = {
  beginner: "Beginner",
  recreational: "Recreational",
  advanced: "Advanced",
  masters: "Masters",
};

/** The same slug the results list links with: lowercase, words joined by hyphens. */
export function slugFor(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PlayerCertificatePage() {
  const params = useParams<{ eventSlug: string; playerSlug: string }>();
  const eventSlug = decodeURIComponent(params.eventSlug ?? "");
  const playerSlug = decodeURIComponent(params.playerSlug ?? "");

  const [eventName, setEventName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [venue, setVenue] = React.useState("");
  const [rows, setRows] = React.useState<PublicStanding[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const event = await readPublicEvent(eventSlug);
      if (!live) return;
      if (!event) {
        setLoaded(true);
        return;
      }
      setEventName(event.name);
      setStartDate(event.details.startDate ?? "");
      setVenue(event.details.venueName ?? "");

      const table = await officialOrDerivedStandings(event.id);
      if (!live) return;
      setRows(table.rows);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, [eventSlug]);

  const me = rows.find((r) => slugFor(r.name) === playerSlug);

  /* Their placing within their own category, from the order the table is already in. */
  const field = me ? rows.filter((r) => r.division === me.division) : [];
  const place = me ? (me.rank ?? field.indexOf(me) + 1) : 0;
  const division = me ? DIVISION_LABEL[me.division] ?? me.division : "";

  if (!loaded) {
    return (
      <main className="grid min-h-dvh place-items-center px-5" style={{ background: PAPER, color: MUTED }}>
        <p className="text-base">Finding your certificate…</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="grid min-h-dvh place-items-center px-5" style={{ background: PAPER, color: INK }}>
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl font-black">Not on this list</h1>
          <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>
            No player by that name appears in the final standings for this event.
          </p>
          <Link
            href={`/results/event/${eventSlug}`}
            className="mt-6 inline-block rounded-lg px-5 py-3 text-sm font-bold text-white"
            style={{ background: INK }}
          >
            Back to the results
          </Link>
        </div>
      </main>
    );
  }

  /*
   * Only a placing is printed as a placement. Fourth in a field of nineteen is a real
   * achievement and not a title, and putting "4th place" in the award line of a certificate
   * designed for winners would read as one.
   */
  const placement = field.length > 1 && place <= 3 ? `${ordinal(place)} place, ${division} division` : undefined;

  return (
    <main className="min-h-dvh px-5 py-10 sm:px-8 sm:py-16" style={{ background: PAPER, color: INK }}>
      <div className="mx-auto max-w-4xl">
        <header className="border-b pb-6" style={{ borderColor: RULE }}>
          <Link
            href={`/results/event/${eventSlug}`}
            className="text-xs font-bold uppercase tracking-[0.24em]"
            style={{ color: BRASS }}
          >
            ← {eventName || "Results"}
          </Link>
          <h1 className="font-display mt-3 text-3xl font-black tracking-tight sm:text-4xl">{me.name}</h1>
          <p className="mt-2 text-base" style={{ color: MUTED }}>
            {ordinal(place)} of {field.length} in {division} · {me.wins}–{me.losses}
            {me.draws > 0 ? `–${me.draws}` : ""} · spread {me.spread > 0 ? `+${me.spread}` : me.spread}
          </p>
        </header>

        <div className="mt-8">
          <Certificate
            name={me.name}
            placement={placement}
            /* This event's own venue and date, not the ones the template was written for. */
            venue={venue || undefined}
            dateLabel={formatDay(startDate)}
            document={{
              name: me.name,
              division,
              placement,
              /* The downloaded file carries the same venue and date as the page. */
              venue: venue || undefined,
              dateLabel: formatDay(startDate) || undefined,
              position: `${ordinal(place)} of ${field.length}`,
              record: `${me.wins}–${me.losses}${me.draws > 0 ? `–${me.draws}` : ""}`,
              spread: me.spread > 0 ? `+${me.spread}` : String(me.spread),
              /* Left empty on purpose — see the note at the top of this file. */
              rounds: [],
            }}
          />
        </div>

        <p className="mt-8 border-t pt-6 text-sm leading-relaxed" style={{ borderColor: RULE, color: MUTED }}>
          {formatDay(startDate)} · Final standings published by the tournament software. Placings
          are within each category, which play separately.
        </p>
      </div>
    </main>
  );
}

/** "1st", "2nd", "3rd", "4th" — including the teens, which catch people out. */
function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** "20 September 2026", or nothing when the event records no date. */
function formatDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
