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
import {
  PublicEvent,
  registrationStatusOf,
  splitEventsForPublic,
} from "@/lib/domain/events";
import { selectRegistrations, useEventStore } from "@/lib/store/useEventStore";
import { TileWord } from "@/components/public/Tiles";
import { formatDate } from "@/lib/utils";

/* Poster palette, shared with the event and registration pages. */
const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/**
 * The public homepage.
 *
 * This was an organizer sign-in form, so the first thing a player saw was a
 * password field for an account they will never have. The events are the
 * product; sign-in lives at /signin.
 *
 * Every fact on this page is read from a real event record. Where the organizer
 * has not supplied something it is absent, not filled in — a page claiming an
 * invented venue or attendance figure is worse than one that says less.
 *
 * The `overflow-x-hidden` below contains the gold wash in `Texture`, which is
 * positioned deliberately off-canvas to bleed off the right edge. It is not
 * masking a layout overflow: the content itself fits from 320px up.
 */
export default function HomePage() {
  const store = useEventStore();
  const { upcoming, past } = splitEventsForPublic(store.events);

  return (
    <main className="min-h-dvh overflow-x-hidden" style={{ background: CREAM }}>
      <Texture />

      <div className="relative mx-auto w-full max-w-[1080px] px-5 py-12 sm:py-20">
        <Hero hasEvents={upcoming.length > 0} />

        <section id="events" className="mt-16 sm:mt-24">
          {upcoming.length ? (
            <>
              <SectionHead
                eyebrow="What's on"
                title="Upcoming events"
                sub={
                  upcoming.length === 1
                    ? "One event is open for registration."
                    : `${upcoming.length} events are open for registration.`
                }
              />
              <div className="mt-7 grid gap-5 md:grid-cols-2">
                {upcoming.map((e, i) => (
                  <EventCard key={e.id} event={e} index={i} />
                ))}
              </div>
            </>
          ) : (
            <NoEvents />
          )}
        </section>

        <HowItWorks />

        {past.length ? (
          <section className="mt-16 sm:mt-24">
            <SectionHead
              eyebrow="Archive"
              title="Past events"
              sub="Results stay online after the day."
            />
            <div className="mt-7 space-y-3">
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

/** The poster's diamond weave, plus two soft washes for depth. */
function Texture() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${BROWN}0A 0 1px, transparent 1px 22px),
                            repeating-linear-gradient(-45deg, ${BROWN}0A 0 1px, transparent 1px 22px)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{
          background: `radial-gradient(70% 100% at 50% -10%, ${FOREST}1F, transparent 68%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-120px] top-[220px] h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ background: `${GOLD}1A` }}
        aria-hidden
      />
    </>
  );
}

function Hero({ hasEvents }: { hasEvents: boolean }) {
  return (
    <header className="text-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ borderColor: `${BROWN}26`, color: `${BROWN}B3`, background: "#FFFFFF66" }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: FOREST }}
            aria-hidden
          />
          Karachi
        </span>
      </motion.div>

      {/* The name in tiles: the asset and the wordmark in one. */}
      <div className="mt-7 flex justify-center sm:mt-8">
        <TileWord
          word="ALPHABATTLE"
          className="max-w-full"
          size={38}
          gap={5}
        />
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="font-display mx-auto mt-8 max-w-[20ch] text-[42px] leading-[0.92] tracking-[-0.02em] sm:text-[68px] lg:text-[80px]"
        style={{ color: BROWN, fontWeight: 900 }}
      >
        Come for the words.
        <br />
        <span style={{ color: FOREST }}>Stay for the people.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mx-auto mt-6 max-w-[52ch] text-[16px] leading-[1.65] sm:text-[17.5px]"
        style={{ color: `${BROWN}C9` }}
      >
        Scrabble and board-game evenings in Karachi. Beginners, casual players
        and regulars each play in their own category, so every game is a fair
        one.
      </motion.p>

      {hasEvents ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.42 }}
          className="mt-9"
        >
          <a
            href="#events"
            className="group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-[15px] font-bold text-white transition-all hover:gap-3.5"
            style={{ background: FOREST, boxShadow: `0 10px 30px ${FOREST}40` }}
          >
            See upcoming events
            <ArrowRight className="size-4" />
          </a>
        </motion.div>
      ) : null}
    </header>
  );
}

function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div>
      <p
        className="text-[11px] font-bold uppercase tracking-[0.16em]"
        style={{ color: GOLD }}
      >
        {eyebrow}
      </p>
      <h2
        className="font-display mt-2 text-[30px] leading-[1.05] tracking-[-0.02em] sm:text-[40px]"
        style={{ color: BROWN, fontWeight: 900 }}
      >
        {title}
      </h2>
      <p className="mt-2 text-[14.5px]" style={{ color: `${BROWN}A6` }}>
        {sub}
      </p>
    </div>
  );
}

/**
 * One upcoming event.
 *
 * The registration state is read, never assumed: an open event gets a working
 * button, and a closed one says why rather than offering a link to a closed
 * door.
 */
function EventCard({ event, index }: { event: PublicEvent; index: number }) {
  const store = useEventStore();
  const status = registrationStatusOf(event, selectRegistrations(store, event.id).length);

  const day = new Date(event.startDate);
  const weekday = Number.isNaN(day.getTime())
    ? ""
    : day.toLocaleDateString("en-GB", { weekday: "long" });

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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08 * index, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-[28px] border bg-white/80 transition-shadow hover:shadow-[0_18px_50px_rgba(62,47,35,0.13)]"
      style={{ borderColor: `${BROWN}1F` }}
    >
      {/* A woven band standing in for a photograph nobody has taken yet. */}
      <div
        className="relative h-[120px] shrink-0 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${FOREST} 0%, ${FOREST}E6 52%, ${GOLD} 100%)`,
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, #FFF3 0 1px, transparent 1px 13px),
                              repeating-linear-gradient(-45deg, #FFF3 0 1px, transparent 1px 13px)`,
          }}
          aria-hidden
        />

        <span
          className="absolute left-5 top-5 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em]"
          style={{ background: CREAM, color: status.open ? FOREST : BROWN }}
        >
          {status.open ? "Registration open" : status.label}
        </span>

        {weekday ? (
          <span
            className="absolute bottom-4 right-5 font-display text-[13px] uppercase tracking-[0.14em] text-white/85"
            style={{ fontWeight: 700 }}
          >
            {weekday}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3
          className="font-display text-[26px] leading-[1.05] tracking-[-0.02em] sm:text-[30px]"
          style={{ color: BROWN, fontWeight: 900 }}
        >
          {event.name}
        </h3>
        {event.subtitle ? (
          <p className="mt-1.5 text-[13.5px] font-semibold" style={{ color: FOREST }}>
            {event.subtitle}
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
          {facts.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0" style={{ color: GOLD }} aria-hidden>
                {f.icon}
              </span>
              <dd className="min-w-0 truncate text-[13px]" style={{ color: `${BROWN}CC` }}>
                {f.text}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-2.5 pt-1">
          {status.open ? (
            <Link
              href={`/events/${event.slug}/register`}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-bold text-white transition-transform hover:scale-[1.03]"
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
            Full details
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

/**
 * How it works.
 *
 * Three steps, each one true of the software as built: you register from a
 * link, you check in with a QR code, and results are published as they are
 * verified.
 */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Register from a link",
      body: "No app and no account. Four short steps on your phone, and you can pay by bank transfer or EasyPaisa.",
    },
    {
      n: "02",
      title: "Check in at the door",
      body: "Scan the QR code at the venue to check in. You are told your category, your board and who you are playing.",
    },
    {
      n: "03",
      title: "Play, and watch it count",
      /*
       * Stated precisely. Both players confirm the score and the scorekeeper
       * verifies it — saying "verified by both players" would skip the person
       * who actually makes it official, and standings are derived only from
       * verified games.
       */
      body: "Both players confirm the score, the scorekeeper verifies it, and the standings follow from there.",
    },
  ];

  return (
    <section className="mt-16 sm:mt-24">
      <SectionHead
        eyebrow="How it works"
        title="Turning up is easy"
        sub="From the link to the last game."
      />

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.07 * i, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border bg-white/65 p-5 sm:p-6"
            style={{ borderColor: `${BROWN}1A` }}
          >
            <span
              className="font-display text-[15px] tracking-[0.08em]"
              style={{ color: GOLD, fontWeight: 900 }}
            >
              {s.n}
            </span>
            <p
              className="font-display mt-2.5 text-[20px] leading-[1.15]"
              style={{ color: BROWN, fontWeight: 700 }}
            >
              {s.title}
            </p>
            <p className="mt-2 text-[13.5px] leading-[1.6]" style={{ color: `${BROWN}B3` }}>
              {s.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function NoEvents() {
  return (
    <div
      className="rounded-[28px] border bg-white/70 px-6 py-14 text-center"
      style={{ borderColor: `${BROWN}1F` }}
    >
      <div className="flex justify-center">
        <TileWord word="SOON" size={44} gap={5} />
      </div>
      <p
        className="font-display mt-6 text-[24px] leading-tight"
        style={{ color: BROWN, fontWeight: 900 }}
      >
        No events announced yet
      </p>
      <p className="mx-auto mt-2 max-w-[36ch] text-[14px]" style={{ color: `${BROWN}A6` }}>
        The next one will appear here as soon as registration opens.
      </p>
    </div>
  );
}

/** A past event: a record, not an invitation. No Register button. */
function PastRow({ event }: { event: PublicEvent }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex flex-col gap-2.5 rounded-3xl border bg-white/55 p-4 transition-colors hover:bg-white/85 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
      style={{ borderColor: `${BROWN}14` }}
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-2xl"
        style={{ background: `${GOLD}26`, color: BROWN }}
        aria-hidden
      >
        <Trophy className="size-4.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="font-display block text-[19px] leading-tight"
          style={{ color: BROWN, fontWeight: 700 }}
        >
          {event.name}
        </span>
        <span className="mt-0.5 block text-[13px]" style={{ color: `${BROWN}A6` }}>
          {formatDate(event.startDate)} · {event.venueName}
        </span>
      </span>

      <span
        className="shrink-0 text-[13px] font-bold sm:text-right"
        style={{ color: FOREST }}
      >
        View results →
      </span>
    </Link>
  );
}

function Footer() {
  return (
    <footer
      className="mt-20 border-t pt-9 text-center sm:mt-28"
      style={{ borderColor: `${BROWN}1F` }}
    >
      <p
        className="font-display text-[17px]"
        style={{ color: BROWN, fontWeight: 700 }}
      >
        Bluffy Alphabattle
      </p>
      <p className="mt-1 text-[12.5px]" style={{ color: `${BROWN}8C` }}>
        Karachi, Pakistan
      </p>
      <Link
        href="/signin"
        className="mt-4 inline-block text-[12px] underline underline-offset-4 transition-colors hover:opacity-70"
        style={{ color: `${BROWN}80` }}
      >
        Organizer sign in
      </Link>
    </footer>
  );
}
