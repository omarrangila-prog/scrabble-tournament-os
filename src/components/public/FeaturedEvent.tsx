"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, MapPin, Ticket } from "lucide-react";
import { badgesFor } from "@/components/public/EventCard";
import { PublicEvent, registrationStatusOf } from "@/lib/domain/events";

import {
  BRASS,
  BRASS_EDGE,
  FELT,
  FELT_LIT,
  foilText,
  IVORY,
  NIGHT,
  raised,
} from "@/lib/design/palette";

/* The card's own names for the shared palette. */
const CREAM = IVORY;
const GOLD = BRASS;
const BROWN = "#3E2F23";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const TONE: Record<string, { bg: string; fg: string }> = {
  open: { bg: "rgba(255,255,255,0.92)", fg: "#12301F" },
  offer: { bg: "rgba(200,155,60,0.28)", fg: "#FFF3D6" },
  included: { bg: "rgba(255,255,255,0.16)", fg: "#FFFFFF" },
  closed: { bg: "rgba(255,255,255,0.16)", fg: "#FFFFFF" },
};

/**
 * The next event, given the whole width.
 *
 * A single event in a three-column grid leaves two empty cells, and a page that
 * looks two-thirds unfinished reads as a product that is. The soonest event is
 * the one thing a visitor came to find, so it gets the room — and the grid below
 * only appears when there is genuinely more than one.
 *
 * The panel is deep green rather than another cream card: it has to be the first
 * thing the eye lands on after the headline, and contrast does that without
 * needing a photograph nobody has taken.
 */
export function FeaturedEvent({
  event,
  registrationCount,
  fromPrice,
}: {
  event: PublicEvent;
  registrationCount: number;
  fromPrice: number;
}) {
  const day = new Date(event.startDate);
  const valid = !Number.isNaN(day.getTime());
  const status = registrationStatusOf(event, registrationCount);
  const badges = badgesFor(event, registrationCount);

  const facts: { icon: React.ReactNode; label: string; emphasis?: boolean }[] = [
    {
      icon: <CalendarDays className="size-4" />,
      label: valid
        ? day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
        : event.startDate,
    },
    { icon: <Clock className="size-4" />, label: event.timeDisplay ?? event.startTime },
    { icon: <MapPin className="size-4" />, label: `${event.venueName}, ${event.city}` },
    {
      icon: <Ticket className="size-4" />,
      label: `From ${event.currency} ${fromPrice.toLocaleString("en-PK")}`,
      // The number people look for, so it carries the accent colour.
      emphasis: true,
    },
  ];

  return (
    <article
      className="relative overflow-hidden rounded-[20px]"
      style={{
        /*
         * The brightest object on a dark page, and the only one with a metal edge — this
         * is the thing a visitor is meant to act on, so it is lit like a card under glass.
         */
        background: `linear-gradient(165deg, ${FELT_LIT} 0%, ${FELT} 46%, ${NIGHT} 100%)`,
        border: `1px solid ${BRASS_EDGE}`,
        boxShadow: `${raised(1)}, 0 0 0 1px rgba(0,0,0,0.4)`,
      }}
    >
      {/* The poster's weave, faint, so the panel is not a flat slab. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, #FFF6 0 1px, transparent 1px 20px),
                            repeating-linear-gradient(-45deg, #FFF6 0 1px, transparent 1px 20px)`,
        }}
        aria-hidden
      />
      <div className="relative p-7 sm:p-9">
        <div className="min-w-0">
          {/* The date leads, as on a ticket. */}
          {valid ? (
            <div className="mb-6 flex items-baseline gap-2.5">
              <span
                className="num text-[46px] font-extrabold leading-none tracking-[-0.04em]"
                style={foilText}
              >
                {day.getDate()}
              </span>
              <span
                className="text-[13px] font-bold uppercase tracking-[0.18em]"
                style={{ color: GOLD }}
              >
                {MONTHS[day.getMonth()]} {day.getFullYear()}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em]"
              style={{ background: GOLD, color: "#3A2B12" }}
            >
              Next event
            </span>
            {badges.map((b) => (
              <span
                key={b.label}
                className="rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ background: TONE[b.tone].bg, color: TONE[b.tone].fg }}
              >
                {b.label}
              </span>
            ))}
          </div>

          <h3 className="font-display mt-4 text-[30px] leading-[1.06] tracking-[-0.02em] text-white sm:text-[36px]" style={{ fontWeight: 600 }}>
            {event.name}
          </h3>
          {event.subtitle ? (
            <p className="mt-2 text-[15px] font-semibold sm:text-[18px]" style={{ color: `${CREAM}B3` }}>
              {event.subtitle}
            </p>
          ) : null}

          <dl className="mt-6 space-y-2.5 border-t pt-5" style={{ borderColor: "rgba(255,255,255,0.16)" }}>
            {facts.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="shrink-0" style={{ color: GOLD }} aria-hidden>
                  {f.icon}
                </span>
                <dd
                  className={
                    f.emphasis
                      ? "min-w-0 text-[15px] font-bold sm:text-[16px]"
                      : "min-w-0 text-[14px] font-medium text-white/90 sm:text-[15px]"
                  }
                  style={f.emphasis ? { color: "#F0D89B" } : undefined}
                >
                  {f.label}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 flex flex-col gap-2.5">
            {status.open ? (
              <Link
                href={`/events/${event.slug}/register`}
                className="inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-[15px] font-bold transition-all hover:gap-3.5"
                style={{ background: CREAM, color: BROWN }}
              >
                Register now
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span
                className="inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[14px] font-semibold"
                style={{ background: "rgba(255,255,255,0.16)", color: CREAM }}
              >
                {status.detail}
              </span>
            )}

            <Link
              href={`/events/${event.slug}`}
              className="inline-flex items-center justify-center rounded-full border px-7 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
              style={{ borderColor: "rgba(255,255,255,0.3)" }}
            >
              Event details
            </Link>
          </div>
        </div>

      </div>
    </article>
  );
}
