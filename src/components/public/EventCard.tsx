"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { PublicEvent, registrationStatusOf } from "@/lib/domain/events";
import { cn } from "@/lib/utils";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface Badge {
  label: string;
  tone: "open" | "offer" | "included" | "closed";
}

/**
 * The badges an event genuinely warrants, capped at three.
 *
 * Five badges on one card is noise — the eye stops reading them and the one that
 * matters is lost. Order is deliberate: registration status first, because it
 * decides whether the card is actionable at all.
 */
export function badgesFor(event: PublicEvent, registrationCount: number, now = new Date()): Badge[] {
  const status = registrationStatusOf(event, registrationCount, now);
  const out: Badge[] = [];

  if (event.state === "completed" || event.state === "archived") {
    out.push({ label: "Completed", tone: "closed" });
  } else if (event.state === "draft") {
    out.push({ label: "Coming soon", tone: "offer" });
  } else if (status.open) {
    out.push({ label: status.label, tone: "open" });
  } else {
    out.push({ label: status.label, tone: "closed" });
  }

  /*
   * An early-bird badge only where the offer can still be taken. Advertising a
   * closed offer invites somebody to ask for a price they cannot have.
   */
  const earlyBird = event.priceRules?.coupons.find((c) => /early/i.test(c.label));
  if (earlyBird) {
    const until = earlyBird.availableUntil ? new Date(earlyBird.availableUntil).getTime() : Infinity;
    if (now.getTime() <= until) out.push({ label: "Early bird", tone: "offer" });
  }

  if (event.highTeaIncluded) out.push({ label: "High tea included", tone: "included" });
  else if (event.complimentaryFood) out.push({ label: "Complimentary lunch", tone: "included" });

  return out.slice(0, 3);
}

const TONE: Record<Badge["tone"], { bg: string; fg: string }> = {
  open: { bg: `${FOREST}1A`, fg: FOREST },
  offer: { bg: `${GOLD}2E`, fg: "#8A6A1F" },
  included: { bg: `${BROWN}12`, fg: BROWN },
  closed: { bg: `${BROWN}0F`, fg: `${BROWN}99` },
};

/**
 * One event, as a ticket listing rather than a dashboard card.
 *
 * A visitor should get what, when, where, how much and whether they can book —
 * in one glance, without reading. Everything else belongs on the event page.
 *
 * The date block is the anchor: people scan for a date first, so it is the
 * largest thing on the card after the name.
 */
export function EventCard({
  event,
  registrationCount,
  fromPrice,
  index = 0,
}: {
  event: PublicEvent;
  registrationCount: number;
  /** Lowest price anyone can actually pay, so "from" is honest. */
  fromPrice: number;
  index?: number;
}) {
  const day = new Date(event.startDate);
  const valid = !Number.isNaN(day.getTime());
  const status = registrationStatusOf(event, registrationCount);
  const badges = badgesFor(event, registrationCount);
  const completed = event.state === "completed" || event.state === "archived";

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay: 0.06 * index, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-[26px] border bg-white/80 transition-shadow duration-200 hover:shadow-[0_18px_46px_rgba(62,47,35,0.13)]"
      style={{ borderColor: `${BROWN}1F` }}
    >
      {/*
        A woven band stands in for a photograph. It carries the poster's texture
        rather than a stock image, and swaps for `cardImage` when the organizer
        supplies one — an invented photo of an event nobody shot would misrepresent it.
      */}
      <div
        className="relative h-[128px] shrink-0 overflow-hidden"
        style={{
          background: completed
            ? `linear-gradient(135deg, ${BROWN}CC 0%, ${BROWN}99 100%)`
            : `linear-gradient(135deg, ${FOREST} 0%, ${FOREST}E6 54%, ${GOLD} 100%)`,
        }}
      >
        {event.cardImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cardImage}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 opacity-[0.22]"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, #FFF3 0 1px, transparent 1px 13px),
                                repeating-linear-gradient(-45deg, #FFF3 0 1px, transparent 1px 13px)`,
            }}
            aria-hidden
          />
        )}

        {/* Date block: what people scan for first. */}
        {valid ? (
          <div
            className="absolute left-5 top-5 rounded-2xl px-3 py-2 text-center"
            style={{ background: CREAM }}
          >
            <p className="num text-[20px] font-extrabold leading-none" style={{ color: BROWN }}>
              {day.getDate()}
            </p>
            <p
              className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: `${BROWN}99` }}
            >
              {MONTHS[day.getMonth()]}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3
          className="text-[21px] font-extrabold leading-[1.1] tracking-[-0.02em]"
          style={{ color: BROWN }}
        >
          {event.name}
        </h3>
        {event.subtitle ? (
          <p className="mt-1 text-[13px] font-semibold" style={{ color: FOREST }}>
            {event.subtitle}
          </p>
        ) : null}

        <p
          className="mt-3 flex items-center gap-1.5 text-[13px]"
          style={{ color: `${BROWN}B3` }}
        >
          <MapPin className="size-3.5 shrink-0" style={{ color: GOLD }} aria-hidden />
          <span className="min-w-0 truncate">
            {event.venueName} · {event.city}
          </span>
        </p>

        {!completed ? (
          <p className="mt-3 text-[15px] font-extrabold" style={{ color: BROWN }}>
            <span className="text-[12px] font-semibold" style={{ color: `${BROWN}99` }}>
              From{" "}
            </span>
            {event.currency} {fromPrice.toLocaleString("en-PK")}
          </p>
        ) : null}

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b.label}
              className="rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em]"
              style={{ background: TONE[b.tone].bg, color: TONE[b.tone].fg }}
            >
              {b.label}
            </span>
          ))}
        </div>

        {/* Pushed to the bottom so cards of different heights align. */}
        <div className="mt-auto pt-5">
          <Link
            href={`/events/${event.slug}`}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold transition-all",
              "hover:gap-3",
            )}
            style={
              completed
                ? { border: `1px solid ${BROWN}26`, color: BROWN }
                : { background: FOREST, color: "white" }
            }
          >
            {completed ? "View recap" : status.open ? "View event" : "Event details"}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
