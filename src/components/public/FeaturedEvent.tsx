"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, Clock, MapPin, Ticket } from "lucide-react";
import { badgesFor } from "@/components/public/EventCard";
import { Tile } from "@/components/public/Tile";
import { PublicEvent, registrationStatusOf } from "@/lib/domain/events";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const TONE: Record<string, { bg: string; fg: string }> = {
  open: { bg: "rgba(255,255,255,0.92)", fg: FOREST },
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

  const facts = [
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
    },
  ];

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[32px]"
      style={{
        background: `linear-gradient(152deg, ${FOREST} 0%, #26492E 58%, #1E3A25 100%)`,
        boxShadow: "0 30px 80px rgba(30,58,37,0.32)",
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
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-[320px] rounded-full blur-3xl"
        style={{ background: `${GOLD}33` }}
        aria-hidden
      />

      <div className="relative grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12 lg:p-12">
        <div className="min-w-0">
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

          <h3
            className="mt-5 text-[34px] font-extrabold leading-[0.98] tracking-[-0.03em] text-white sm:text-[52px] lg:text-[60px]"
          >
            {event.name}
          </h3>
          {event.subtitle ? (
            <p className="mt-2 text-[15px] font-semibold sm:text-[18px]" style={{ color: `${CREAM}B3` }}>
              {event.subtitle}
            </p>
          ) : null}

          <dl className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {facts.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="shrink-0" style={{ color: GOLD }} aria-hidden>
                  {f.icon}
                </span>
                <dd className="min-w-0 text-[14px] font-medium text-white/90 sm:text-[15px]">
                  {f.label}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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

        {/* The date, as a physical thing. Tiles instead of a photograph. */}
        {valid ? (
          <div className="flex items-end gap-3 lg:flex-col lg:items-end">
            <div
              className="rounded-[24px] px-6 py-5 text-center"
              style={{ background: CREAM }}
            >
              <p
                className="num text-[52px] font-extrabold leading-none tracking-[-0.04em] sm:text-[68px]"
                style={{ color: BROWN }}
              >
                {day.getDate()}
              </p>
              <p
                className="mt-1 text-[12px] font-bold uppercase tracking-[0.2em]"
                style={{ color: `${BROWN}A6` }}
              >
                {MONTHS[day.getMonth()]} {day.getFullYear()}
              </p>
            </div>

            <div className="hidden gap-1.5 lg:flex">
              {["W", "I", "N"].map((l, i) => (
                <Tile key={l} letter={l} size={38} rotate={i % 2 ? 2.5 : -2.5} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}
