"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Camera, Mail } from "lucide-react";
import { EventCard } from "@/components/public/EventCard";
import { PublicEvent, splitEventsForPublic } from "@/lib/domain/events";
import { FeaturedEvent } from "@/components/public/FeaturedEvent";
import { Tile } from "@/components/public/Tile";
import { lowestPrice } from "@/lib/seo";
import { selectRegistrations, useEventStore } from "@/lib/store/useEventStore";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/**
 * Navigation, built from what the page actually contains.
 *
 * "Past Events" only appears once there are past events. A link to a section
 * that is not on the page scrolls nowhere, and a nav item that does nothing is
 * worse than one absence nobody notices.
 */
function navFor(hasPast: boolean) {
  return [
    { href: "#events", label: "Events" },
    ...(hasPast ? [{ href: "#past", label: "Past Events" }] : []),
    { href: "#community", label: "Community" },
    { href: "#about", label: "About" },
  ];
}

/**
 * The public homepage.
 *
 * An event-discovery page, not software. Somebody arriving from Instagram has one
 * question — what is on and can I come — so upcoming events sit directly under
 * the hero and everything else is subordinate to them.
 *
 * Deliberately absent: any organizer link. Sign-in lives at /organizer and is
 * given out privately; advertising it here would put an administration door on a
 * page meant for guests.
 *
 * Every figure and date is read from the event records. Nothing is invented to
 * make the page look busier than the events warrant.
 */
export default function HomePage() {
  const store = useEventStore();
  const { upcoming, past } = splitEventsForPublic(store.events);

  return (
    <div className="min-h-dvh overflow-x-hidden" style={{ background: CREAM }}>
      <Texture />
      <Header hasPast={past.length > 0} />

      <main className="relative mx-auto w-full max-w-[1120px] px-5 pb-20 sm:px-8">
        <Hero hasEvents={upcoming.length > 0} hasPast={past.length > 0} />

        <Section
          id="events"
          eyebrow="What's on"
          title="Upcoming experiences"
          sub=""
        >
          {upcoming.length ? (
            <div className="space-y-6">
              <FeaturedFor event={upcoming[0]} />

              {/*
                A grid of one leaves two empty cells and reads as unfinished, so
                the rest only appears when there is a rest.
              */}
              {upcoming.length > 1 ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.slice(1).map((e) => (
                    <EventCardFor key={e.id} event={e} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <Empty
              title="No events announced yet"
              body="The next experience will appear here as soon as registration opens."
            />
          )}
        </Section>

        <Community />

        {past.length ? (
          <Section
            id="past"
            eyebrow="Archive"
            title="Past experiences"
            sub="Where we have played before."
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((e) => (
                <EventCardFor key={e.id} event={e} />
              ))}
            </div>
          </Section>
        ) : null}

        <Collaborations />
        <About />
      </main>

      <Footer hasPast={past.length > 0} />
    </div>
  );
}

/**
 * A card wired to its event's real numbers.
 *
 * "From" is the cheapest price anybody can actually pay, resolved through the
 * pricing rules rather than assumed — quoting a headline fee when a code beats
 * it would overstate the cost, and quoting a coupon price everyone cannot get
 * would understate it.
 */
function EventCardFor({ event }: { event: PublicEvent }) {
  const store = useEventStore();
  const count = selectRegistrations(store, event.id).length;

  return (
    <EventCard event={event} registrationCount={count} fromPrice={lowestPrice(event)} />
  );
}

/** The soonest event, given the full width. */
function FeaturedFor({ event }: { event: PublicEvent }) {
  const store = useEventStore();
  const count = selectRegistrations(store, event.id).length;
  return (
    <FeaturedEvent event={event} registrationCount={count} fromPrice={lowestPrice(event)} />
  );
}

/* -------------------------------------------------------------------------- */

/** The poster's weave, plus a wash behind the hero. */
function Texture() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.32]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${BROWN}0A 0 1px, transparent 1px 24px),
                            repeating-linear-gradient(-45deg, ${BROWN}0A 0 1px, transparent 1px 24px)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[620px]"
        style={{
          background: `radial-gradient(72% 100% at 50% -12%, ${FOREST}1F, transparent 66%)`,
        }}
        aria-hidden
      />
    </>
  );
}

function Header({ hasPast }: { hasPast: boolean }) {
  const nav = navFor(hasPast);
  return (
    <header className="relative">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-5 sm:px-8 sm:py-6">
        <Link
          href="/"
          className="text-[14px] font-extrabold uppercase tracking-[0.14em]"
          style={{ color: BROWN }}
        >
          Blufy&rsquo;s AlphaBattle
        </Link>

        <nav
          className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto md:order-none md:ml-auto md:w-auto md:overflow-visible"
          aria-label="Sections"
        >
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors hover:bg-white/70 sm:px-3.5 sm:text-[13.5px]"
              style={{ color: `${BROWN}CC` }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a
          href="#events"
          className="ml-auto shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold text-white transition-transform hover:scale-[1.03] md:ml-2"
          style={{ background: FOREST }}
        >
          Explore events
        </a>
      </div>
    </header>
  );
}

function Hero({ hasEvents, hasPast }: { hasEvents: boolean; hasPast: boolean }) {
  return (
    <section className="pt-6 sm:pt-12">
      {/*
        Tiles as accent, not wallpaper. They give the hero something to look at
        that belongs to the subject, rather than a stock photograph of strangers.
      */}
      <div className="flex gap-1.5" aria-hidden>
        {["B", "L", "U", "F", "Y"].map((l, i) => (
          <Tile key={l} letter={l} size={40} rotate={i % 2 ? 3 : -3} />
        ))}
      </div>

      <p
        className="mt-6 text-[10.5px] font-bold uppercase tracking-[0.2em] sm:text-[11.5px] sm:tracking-[0.26em]"
        style={{ color: `${BROWN}99` }}
      >
        Karachi&rsquo;s social game experiences
      </p>

      <h1
        className="mt-5 text-[46px] font-extrabold leading-[0.9] tracking-[-0.035em] sm:mt-5 sm:text-[74px] lg:text-[88px]"
        style={{ color: BROWN }}
      >
        Play.
        <br />
        Meet.
        <br />
        <span style={{ color: FOREST }}>Compete.</span>
      </h1>

      <p
        className="mt-5 max-w-[46ch] text-[16px] leading-[1.6] sm:text-[19px]"
        style={{ color: `${BROWN}C9` }}
      >
        Discover Scrabble tournaments, board-game nights and social experiences
        designed to bring great people together.
      </p>

      {/*
        Not animated. A faded or delayed primary action is a button somebody
        cannot use, and if the animation stalls the page has no way in at all.
      */}
      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        {hasEvents ? (
          <a
            href="#events"
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-[15px] font-bold text-white transition-all hover:gap-3.5 sm:w-auto"
            style={{ background: FOREST, boxShadow: `0 10px 30px ${FOREST}40` }}
          >
            Explore upcoming events
            <ArrowRight className="size-4" aria-hidden />
          </a>
        ) : null}

        {hasPast ? (
          <a
            href="#past"
            className="inline-flex w-full items-center justify-center rounded-full border px-7 py-3.5 text-[15px] font-bold transition-colors hover:bg-white/70 sm:w-auto"
            style={{ borderColor: `${BROWN}26`, color: BROWN }}
          >
            See past events
          </a>
        ) : null}
      </div>
    </section>
  );
}

function Section({
  id,
  eyebrow,
  title,
  sub,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 pt-16 sm:pt-24">
      <p
        className="text-[10.5px] font-bold uppercase tracking-[0.18em]"
        style={{ color: GOLD }}
      >
        {eyebrow}
      </p>
      <h2
        className="mt-2.5 text-[30px] font-extrabold leading-[1.04] tracking-[-0.025em] sm:text-[44px]"
        style={{ color: BROWN }}
      >
        {title}
      </h2>
      {sub ? (
        <p className="mt-2 text-[14.5px] sm:text-[16px]" style={{ color: `${BROWN}A6` }}>
          {sub}
        </p>
      ) : null}

      <div className="mt-8">{children}</div>
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-[26px] border bg-white/70 px-6 py-14 text-center"
      style={{ borderColor: `${BROWN}1F` }}
    >
      <p className="text-[19px] font-extrabold" style={{ color: BROWN }}>
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-[40ch] text-[14px]" style={{ color: `${BROWN}A6` }}>
        {body}
      </p>
    </div>
  );
}

/** One restrained section on why the events exist. No statistics. */
function Community() {
  const pillars = [
    { title: "Play", body: "Challenge yourself across five timed games." },
    { title: "Connect", body: "Meet people who enjoy the same things you do." },
    { title: "Return", body: "Come back for the next experience." },
  ];

  return (
    <section id="community" className="scroll-mt-8 pt-16 sm:pt-24">
      <div
        className="rounded-[30px] px-6 py-12 text-center sm:px-12 sm:py-16"
        style={{ background: `${GOLD}18` }}
      >
        <h2
          className="text-[28px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[40px]"
          style={{ color: BROWN }}
        >
          More than a game.
        </h2>
        <p
          className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-[1.65] sm:text-[16.5px]"
          style={{ color: `${BROWN}C9` }}
        >
          Blufy&rsquo;s AlphaBattle brings people together through words,
          competition, conversation and memorable social experiences.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title}>
              <p
                className="text-[12px] font-bold uppercase tracking-[0.18em]"
                style={{ color: GOLD }}
              >
                {p.title}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: `${BROWN}B3` }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Who we have worked with.
 *
 * Named in text rather than as logos. Publishing a logo nobody supplied
 * misrepresents an endorsement, and a grey wall of marks nobody recognises adds
 * nothing — the relationship is the credible part.
 *
 * The labels are deliberately specific. Calling a venue a "sponsor" claims money
 * changed hands in a direction it may not have.
 */
const COLLABORATORS = [
  { name: "Chai Chatt, Habitt City", relationship: "Venue partner" },
  { name: "Alliance Française de Karachi", relationship: "Hosted at" },
  { name: "Boardgame Baithak", relationship: "In collaboration with" },
];

function Collaborations() {
  return (
    <section className="scroll-mt-8 pt-16 sm:pt-24">
      <p
        className="text-center text-[10.5px] font-bold uppercase tracking-[0.18em]"
        style={{ color: GOLD }}
      >
        Events &amp; collaborations
      </p>
      <h2
        className="mt-2.5 text-center text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[32px]"
        style={{ color: BROWN }}
      >
        We&rsquo;ve brought people together with
      </h2>

      <ul className="mx-auto mt-8 grid max-w-[900px] gap-4 sm:grid-cols-3">
        {COLLABORATORS.map((c) => (
          <li
            key={c.name}
            className="rounded-2xl border bg-white/60 px-5 py-6 text-center"
            style={{ borderColor: `${BROWN}14` }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ color: `${BROWN}80` }}
            >
              {c.relationship}
            </p>
            <p className="mt-2 text-[15px] font-bold leading-snug" style={{ color: BROWN }}>
              {c.name}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="scroll-mt-8 pt-16 sm:pt-24">
      <div className="max-w-[62ch]">
        <p
          className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: GOLD }}
        >
          About
        </p>
        <h2
          className="mt-2.5 text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-[36px]"
          style={{ color: BROWN }}
        >
          Everyone plays someone their own level
        </h2>
        <p
          className="mt-4 text-[16px] leading-[1.7] sm:text-[17px]"
          style={{ color: `${BROWN}C9` }}
        >
          Entrants pick a category — beginner, intermediate or advanced — and are
          paired within it, so a first event is a real game rather than a
          formality. Registration takes a few minutes from a link, and you check
          in on your own phone at the door.
        </p>
      </div>
    </section>
  );
}

/**
 * The footer.
 *
 * No organizer link. That route is private, and putting it here would turn a
 * guest page into a door into administration.
 */
function Footer({ hasPast }: { hasPast: boolean }) {
  const nav = navFor(hasPast);
  return (
    <footer
      className="relative mt-4 border-t"
      style={{ borderColor: `${BROWN}1F`, background: `${BROWN}06` }}
    >
      <div className="mx-auto w-full max-w-[1120px] px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p
              className="text-[14px] font-extrabold uppercase tracking-[0.14em]"
              style={{ color: BROWN }}
            >
              Blufy&rsquo;s AlphaBattle
            </p>
            <p className="mt-1.5 text-[13px]" style={{ color: `${BROWN}99` }}>
              Karachi, Pakistan
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-[13.5px] font-semibold transition-opacity hover:opacity-70"
                style={{ color: `${BROWN}CC` }}
              >
                {item.label}
              </a>
            ))}
            <a
              href="https://instagram.com"
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: `${BROWN}CC` }}
            >
              <Camera className="size-3.5" aria-hidden />
              Instagram
            </a>
            <a
              href="mailto:info@blufysalphabattle.com"
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: `${BROWN}CC` }}
            >
              <Mail className="size-3.5" aria-hidden />
              Contact
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
