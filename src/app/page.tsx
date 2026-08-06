"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  MapPin,
  Ticket,
  Trophy,
} from "lucide-react";
import { PublicEvent, splitEventsForPublic, registrationStatusOf } from "@/lib/domain/events";
import { selectRegistrations, useEventStore } from "@/lib/store/useEventStore";
import { formatDate } from "@/lib/utils";

/* Poster palette, shared with the event and registration pages. */
const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/**
 * The public homepage.
 *
 * This used to be an organizer sign-in form, which meant the first thing a
 * player saw was a password field for an account they will never have. The
 * events are the product; sign-in moved to /signin and is linked from the
 * footer.
 *
 * Everything here is read from real event records. Nothing is invented — an
 * organization with no past events shows no past section rather than filler.
 */
export default function HomePage() {
  const store = useEventStore();
  const { upcoming, past } = splitEventsForPublic(store.events);

  return (
    <main className="min-h-dvh" style={{ background: CREAM }}>
      {/* The poster's diamond weave, behind everything. */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${BROWN}0A 0 1px, transparent 1px 22px),
                            repeating-linear-gradient(-45deg, ${BROWN}0A 0 1px, transparent 1px 22px)`,
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1040px] px-5 py-12 sm:py-16">
        <Hero count={upcoming.length} />

        {upcoming.length ? (
          <section className="mt-14">
            <SectionHeading
              title="Upcoming events"
              sub={
                upcoming.length === 1
                  ? "One event open now."
                  : `${upcoming.length} events open now.`
              }
            />
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {upcoming.map((e, i) => (
                <EventCard key={e.id} event={e} index={i} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-14">
            <div
              className="rounded-3xl border bg-white/70 p-10 text-center"
              style={{ borderColor: `${BROWN}1A` }}
            >
              <CalendarDays className="mx-auto size-6" style={{ color: GOLD }} />
              <p className="mt-3 text-[17px] font-extrabold" style={{ color: BROWN }}>
                No events announced yet
              </p>
              <p className="mt-1.5 text-[13.5px]" style={{ color: `${BROWN}99` }}>
                The next one will appear here as soon as it opens.
              </p>
            </div>
          </section>
        )}

        {past.length ? (
          <section className="mt-16">
            <SectionHeading title="Past events" sub="What we have run before." />
            <div className="mt-5 space-y-3">
              {past.map((e) => (
                <PastRow key={e.id} event={e} />
              ))}
            </div>
          </section>
        ) : null}

        <Footer />
      </div>
    </main>
  );
}

function Hero({ count }: { count: number }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="text-center"
    >
      <p
        className="text-[11px] font-bold uppercase tracking-[0.16em] sm:tracking-[0.22em]"
        style={{ color: `${BROWN}99` }}
      >
        Karachi · Board games &amp; Scrabble
      </p>

      <h1
        className="mt-4 text-[40px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[64px]"
        style={{ color: BROWN }}
      >
        Come for the words
        <span style={{ color: FOREST }}>.</span>
        <br />
        Stay for the people
        <span style={{ color: GOLD }}>.</span>
      </h1>

      <p
        className="mx-auto mt-5 max-w-[46ch] text-[15px] leading-relaxed sm:text-[16px]"
        style={{ color: `${BROWN}CC` }}
      >
        Friendly, well-run evenings of Scrabble and board games. Newcomers and
        regulars play in their own categories, so everyone gets a real game.
      </p>

      {count > 0 ? (
        <a
          href="#events"
          className="mt-7 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold text-white transition-transform hover:scale-[1.02]"
          style={{ background: FOREST }}
        >
          See what&rsquo;s on
          <ArrowRight className="size-4" />
        </a>
      ) : null}
    </motion.header>
  );
}

function SectionHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div id="events">
      <h2
        className="text-[24px] font-extrabold tracking-[-0.02em] sm:text-[28px]"
        style={{ color: BROWN }}
      >
        {title}
      </h2>
      <p className="mt-1 text-[13.5px]" style={{ color: `${BROWN}99` }}>
        {sub}
      </p>
    </div>
  );
}

/**
 * One upcoming event.
 *
 * The registration state is read rather than assumed: an event that is open
 * gets a working button, and one that is not says so plainly instead of
 * offering a link that leads to a closed door.
 */
function EventCard({ event, index }: { event: PublicEvent; index: number }) {
  const store = useEventStore();
  const status = registrationStatusOf(event, selectRegistrations(store, event.id).length);

  const facts = [
    { icon: <CalendarDays className="size-3.5" />, text: formatDate(event.startDate) },
    { icon: <Clock className="size-3.5" />, text: event.timeDisplay ?? event.startTime },
    { icon: <MapPin className="size-3.5" />, text: event.venueName },
    {
      icon: <Ticket className="size-3.5" />,
      text: `${event.currency} ${event.fee.toLocaleString("en-PK")}`,
    },
  ];

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.06 * index, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col overflow-hidden rounded-3xl border bg-white/75"
      style={{ borderColor: `${BROWN}1A` }}
    >
      {/* A woven band standing in for a photograph nobody has taken yet. */}
      <div
        className="relative h-[104px] shrink-0"
        style={{
          background: `linear-gradient(135deg, ${FOREST} 0%, ${FOREST}D9 55%, ${GOLD} 100%)`,
        }}
      >
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, #FFFFFF22 0 1px, transparent 1px 14px),
                              repeating-linear-gradient(-45deg, #FFFFFF22 0 1px, transparent 1px 14px)`,
          }}
          aria-hidden
        />
        <span
          className="absolute left-5 top-5 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em]"
          style={{ background: CREAM, color: BROWN }}
        >
          {status.open ? "Registration open" : status.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3
          className="text-[22px] font-extrabold leading-tight tracking-[-0.02em]"
          style={{ color: BROWN }}
        >
          {event.name}
        </h3>
        {event.subtitle ? (
          <p className="mt-1 text-[13px] font-semibold" style={{ color: FOREST }}>
            {event.subtitle}
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {facts.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0" style={{ color: GOLD }}>
                {f.icon}
              </span>
              <dd className="min-w-0 truncate text-[12.5px]" style={{ color: `${BROWN}CC` }}>
                {f.text}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2.5 pt-1">
          {status.open ? (
            <Link
              href={`/events/${event.slug}/register`}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-bold text-white transition-transform hover:scale-[1.02]"
              style={{ background: FOREST }}
            >
              Register
              <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <span
              className="inline-flex items-center rounded-full px-4 py-2.5 text-[12.5px] font-semibold"
              style={{ background: `${GOLD}26`, color: BROWN }}
            >
              {status.detail}
            </span>
          )}

          <Link
            href={`/events/${event.slug}`}
            className="inline-flex items-center rounded-full border px-5 py-2.5 text-[13.5px] font-bold transition-colors hover:bg-white"
            style={{ borderColor: `${BROWN}26`, color: BROWN }}
          >
            Details
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

/** A past event: a record, not an invitation. No register button. */
function PastRow({ event }: { event: PublicEvent }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex flex-col gap-2 rounded-2xl border bg-white/55 p-4 transition-colors hover:bg-white/80 sm:flex-row sm:items-center sm:gap-4"
      style={{ borderColor: `${BROWN}14` }}
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full"
        style={{ background: `${GOLD}26`, color: BROWN }}
      >
        <Trophy className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold" style={{ color: BROWN }}>
          {event.name}
        </span>
        <span className="block text-[12.5px]" style={{ color: `${BROWN}99` }}>
          {formatDate(event.startDate)} · {event.venueName}
        </span>
      </span>

      <span
        className="shrink-0 text-[12.5px] font-semibold sm:text-right"
        style={{ color: FOREST }}
      >
        View results
      </span>
    </Link>
  );
}

function Footer() {
  return (
    <footer
      className="mt-20 border-t pt-8 text-center"
      style={{ borderColor: `${BROWN}1A` }}
    >
      <p className="text-[12.5px]" style={{ color: `${BROWN}99` }}>
        Bluffy Alphabattle · Karachi
      </p>
      <Link
        href="/signin"
        className="mt-2 inline-block text-[12px] underline underline-offset-2"
        style={{ color: `${BROWN}80` }}
      >
        Organizer sign in
      </Link>
    </footer>
  );
}
