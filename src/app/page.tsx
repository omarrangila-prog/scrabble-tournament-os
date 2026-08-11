"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Camera, Mail } from "lucide-react";
import { EventCard } from "@/components/public/EventCard";
import { PublicEvent, splitEventsForPublic } from "@/lib/domain/events";
import { FeaturedEvent } from "@/components/public/FeaturedEvent";
import { WordScorer } from "@/components/public/WordScorer";
import { ScrabbleTile, TileRack, TileWord, wordScore } from "@/components/public/ScrabbleTile";
import { LINEN_GRAIN, PAPER_GRAIN, ScrabbleBoard } from "@/components/public/ScrabbleBoard";
import {
  BRASS,
  BRASS_EDGE,
  BRASS_FOIL,
  EMERALD,
  EMERALD_LIT,
  FELT,
  foilText,
  IVORY,
  IVORY_FAINT,
  IVORY_SOFT,
  liftVars,
  NIGHT,
  NIGHT_DEEP,
  raised,
} from "@/lib/design/palette";
import { lowestPrice } from "@/lib/seo";
import { selectRegistrations, useEventStore } from "@/lib/store/useEventStore";

/*
 * The old four (cream, forest, gold, brown) all sat in a narrow band of light values, so
 * nothing on the page could be bright and no edge could catch light. These map the same
 * roles onto the deeper palette: text, the living green, the metal, and the ground.
 */
const CREAM = IVORY;
const GOLD = BRASS;
const BROWN = IVORY;

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

  /*
   * `relative` on the wrapper below is load-bearing, not decoration. The board in
   * `Texture` is positioned off the right edge; with no positioned ancestor it resolves
   * against the viewport, and `overflow-x-hidden` then does not clip it — the whole page
   * scrolls sideways by the width of the board.
   */
  return (
    <div
      className="relative min-h-dvh overflow-x-hidden"
      style={{
        /* Deepest at the edges, warmer where the hero sits — a table under one lamp. */
        background: `radial-gradient(120% 80% at 50% -8%, ${NIGHT} 0%, ${NIGHT_DEEP} 78%)`,
        backgroundColor: NIGHT_DEEP,
      }}
    >
      <Texture />
      <Header hasPast={past.length > 0} />

      <main className="relative mx-auto w-full max-w-[1120px] px-5 pb-20 sm:px-8">
        <section className="grid items-center gap-10 pt-4 sm:pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-12">
          <Hero hasEvents={upcoming.length > 0} hasPast={past.length > 0} />

          {upcoming.length ? (
            <FeaturedFor event={upcoming[0]} />
          ) : (
            <Empty
              title="No events announced yet"
              body="The next experience will appear here as soon as registration opens."
            />
          )}
        </section>

        {/* The rest only when there is a rest — a lone card in a grid of three
            leaves two empty cells and reads as unfinished. */}
        {upcoming.length > 1 ? (
          <Section id="events" eyebrow="What's on" title="More upcoming experiences" sub="">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.slice(1).map((e) => (
                <EventCardFor key={e.id} event={e} />
              ))}
            </div>
          </Section>
        ) : null}

        <Community />
        <WordScorer />

        {past.length ? (
          <Section
            id="past"
            eyebrow="Archive"
            title="Past experiences"
            sub="Where we have played before."
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

/**
 * The surface the page sits on.
 *
 * Four layers, bottom to top: the felt of a table, a board laid on it behind the hero,
 * paper grain over everything, and a vignette that darkens the edges the way light falls
 * off across a real table.
 *
 * The grain is fixed rather than scrolling. Texture that scrolls with the content reads as
 * a pattern printed on the page; texture that stays still reads as the surface the page is
 * lying on, which is the whole point.
 */
function Texture() {
  return (
    <>
      {/* Felt: a warm weave, darker towards the edges. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: LINEN_GRAIN,
          backgroundSize: "260px 260px",
          /*
           * `overlay`, not `multiply`. Multiplying grain into a near-black ground removes
           * light that is not there and the texture simply vanishes; overlay lets the weave
           * catch a little of it, which is what a felt table does.
           */
          mixBlendMode: "overlay",
          opacity: 0.5,
        }}
        aria-hidden
      />

      {/*
        A board on the table behind the hero. Off the right edge and rotated, because a
        board squared up to the viewport reads as a diagram — one at an angle, partly out
        of frame, reads as an object someone put down.

        Hidden below `lg`: on a phone it would sit under the headline and fight it.
      */}
      <div
        className="pointer-events-none absolute right-[-14%] top-[2%] hidden lg:block"
        style={{
          transform: "rotate(-11deg)",
          opacity: 0.17,
          /*
           * Dissolved into the ground rather than cropped by it. On a dark page the board's
           * reds and blues are loud enough to read as a stray graphic pasted over the
           * corner; a radial mask turns the same object into something the light is only
           * just catching, and removes the hard edge where it leaves the frame.
           */
          maskImage: "radial-gradient(68% 68% at 34% 40%, #000 0%, transparent 82%)",
          WebkitMaskImage: "radial-gradient(68% 68% at 34% 40%, #000 0%, transparent 82%)",
        }}
        aria-hidden
      >
        <ScrabbleBoard size="min(52vw, 640px)" />
      </div>

      {/*
        A few tiles left on the table, below the board.

        Loose pieces at odd angles are what stops a page reading as a diagram of a game and
        starts it reading as a game somebody is in the middle of. Deliberately few, and
        deliberately out at the edges where there is no text.

        Desktop only: on a narrow screen there is no margin to leave them in.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[760px] lg:block" aria-hidden>
        <ScrabbleTile letter="Q" size={44} rotate={-14} drift="13s" settleDelay={620} style={{ position: "absolute", left: "3%", top: "58%", opacity: 0.9 }} />
        <ScrabbleTile letter="I" size={38} rotate={9} drift="17s" settleDelay={780} style={{ position: "absolute", left: "8.5%", top: "66%", opacity: 0.85 }} />
        <ScrabbleTile letter="Z" size={40} rotate={22} drift="21s" settleDelay={900} style={{ position: "absolute", left: "1.5%", top: "72%", opacity: 0.8 }} />
      </div>

      {/* Paper grain, over everything. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: PAPER_GRAIN,
          backgroundSize: "180px 180px",
          mixBlendMode: "overlay",
          opacity: 0.16,
        }}
        aria-hidden
      />

      {/* Light falling off towards the edges, and a warm pool behind the hero. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[720px]"
        style={{
          background: `radial-gradient(64% 100% at 42% -14%, rgba(39,154,96,0.20), transparent 62%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(118% 86% at 50% 38%, transparent 46%, rgba(0,0,0,0.55) 100%)`,
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
        {/*
          The mark is one tile. A logo made of the same material as the hero is what ties
          the page together — and a single B reads at 26px where a whole word would not.
        */}
        <Link
          href="/"
          className="tap-target flex items-center gap-2.5 text-[14px] font-extrabold uppercase tracking-[0.14em]"
          style={{ color: BROWN }}
        >
          <ScrabbleTile letter="B" size={26} rotate={-2} hideValue />
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
          className="lp-sheen ml-auto shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-extrabold transition-transform hover:scale-[1.03] md:ml-2"
          /* Brass with dark type on it: the metal reads as the expensive thing on the page. */
          style={{ background: BRASS_FOIL, color: "#20180A", boxShadow: raised(0.3) }}
        >
          Explore events
        </a>
      </div>
    </header>
  );
}

function Hero({ hasEvents, hasPast }: { hasEvents: boolean; hasPast: boolean }) {
  return (
    <section className="min-w-0">
      <p
        className="text-[10.5px] font-bold uppercase tracking-[0.2em] sm:text-[11.5px] sm:tracking-[0.2em]"
        style={{ color: IVORY_FAINT }}
      >
        Karachi&rsquo;s social game experiences
      </p>

      {/*
        The word itself, in tiles on a rack.

        The headline said "Scrabble nights" in a serif; a page about Scrabble can show the
        thing rather than name it. The sentence continues underneath, so the tiles carry
        the word and the type carries the meaning — and the accessible name on the rack is
        the word, so a screen reader hears the sentence in full.

        Sized in `clamp` against the viewport, so it fills the column on a desktop and sits
        on two rows on a phone without a media query.
      */}
      <h1
        className="font-display mt-5 leading-[1.05] tracking-[-0.02em]"
        style={{ color: IVORY, fontWeight: 600 }}
      >
        <TileRack word="SCRABBLE" maxTile={62} className="block max-w-full" />
        {/*
          What the tiles above are worth, counted from the same table the tiles are drawn
          from rather than typed in. A detail only a player will check — which is exactly
          who it is for, and why it has to be right.
        */}
        <span
          className="mt-3.5 block text-[11.5px] font-bold uppercase tracking-[0.18em]"
          style={{ color: BRASS }}
        >
          {wordScore("SCRABBLE")} points, before the board
        </span>

        <span className="mt-5 block text-[34px] sm:mt-6 sm:text-[46px] lg:text-[54px]">
          nights worth
          <br />
          turning up for
          <span style={{ color: GOLD }}>.</span>
        </span>
      </h1>

      <p
        className="mt-5 max-w-[46ch] text-[16px] leading-[1.6] sm:text-[19px]"
        style={{ color: IVORY_SOFT }}
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
            className="lp-sheen inline-flex w-full items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-[15px] font-bold text-white transition-all hover:gap-3.5 sm:w-auto"
            style={{
              background: `linear-gradient(180deg, ${EMERALD_LIT} 0%, ${EMERALD} 100%)`,
              boxShadow: `${raised(0.6)}, 0 12px 34px rgba(30,122,76,0.34)`,
            }}
          >
            Explore upcoming events
            <ArrowRight className="size-4" aria-hidden />
          </a>
        ) : null}

        {hasPast ? (
          <a
            href="#past"
            className="inline-flex w-full items-center justify-center rounded-full border px-7 py-3.5 text-[15px] font-bold transition-colors hover:bg-white/70 sm:w-auto"
            style={{ borderColor: BRASS_EDGE, color: BRASS }}
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
        className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ color: GOLD }}
      >
        {eyebrow}
      </p>
      <h2
        className="font-display lp-foil mt-2.5 text-[28px] leading-[1.08] tracking-[-0.02em] sm:text-[38px]"
        style={{ ...foilText, fontWeight: 600 }}
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
      {/*
        The panel is a surface, so it gets the weave of one. A flat wash of colour sitting
        beside wooden tiles reads as a different material from everything around it.
      */}
      <div
        className="lp-lift lp-rise relative overflow-hidden rounded-[20px] border px-6 py-11 sm:px-11 sm:py-14"
        style={{
          background: `linear-gradient(168deg, ${FELT} 0%, ${NIGHT} 100%)`,
          borderColor: BRASS_EDGE,
          ...liftVars(0.8),
          boxShadow: "var(--sh)",
        }}
      >
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: LINEN_GRAIN,
            backgroundSize: "200px 200px",
            mixBlendMode: "overlay",
            opacity: 0.4,
          }}
          aria-hidden
        />
        <span className="relative block">
        <h2
          className="font-display lp-foil text-[28px] leading-[1.08] tracking-[-0.02em] sm:text-[38px]"
          style={{ ...foilText, fontWeight: 600 }}
        >
          More than a game.
        </h2>
        <p
          className="mt-4 max-w-[52ch] text-[15px] leading-[1.65] sm:text-[16.5px]"
          style={{ color: IVORY_SOFT }}
        >
          Blufy&rsquo;s AlphaBattle brings people together through words,
          competition, conversation and memorable social experiences.
        </p>

        <div className="mt-9 grid grid-cols-1 gap-6 border-t pt-8 sm:grid-cols-3" style={{ borderColor: `${BROWN}1A` }}>
          {pillars.map((p) => (
            <div key={p.title}>
              <TileWord word={p.title} size={24} gap="0.12em" />
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: IVORY_SOFT }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>
        </span>
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
        className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ color: GOLD }}
      >
        Events &amp; collaborations
      </p>
      <h2
        className="font-display lp-foil mt-2.5 text-[24px] leading-[1.12] tracking-[-0.02em] sm:text-[32px]"
        style={{ ...foilText, fontWeight: 600 }}
      >
        We&rsquo;ve brought people together with
      </h2>

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {COLLABORATORS.map((c) => (
          <li
            key={c.name}
            className="lp-lift lp-rise flex items-start gap-3.5 rounded-2xl border px-5 py-6"
            style={{
              background: `linear-gradient(168deg, rgba(24,64,44,0.55) 0%, rgba(10,24,17,0.5) 100%)`,
              borderColor: BRASS_EDGE,
              ...liftVars(0.35),
              boxShadow: "var(--sh)",
            }}
          >
            {/*
              The initial as a tile. It gives each card a mark without inventing a logo
              nobody supplied — the letter is simply their own name's first letter.
            */}
            <ScrabbleTile letter={c.name[0]} size={30} rotate={-2.5} hideValue />
            <span className="min-w-0 block">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ color: IVORY_FAINT }}
            >
              {c.relationship}
            </p>
            <p className="mt-1.5 text-[15px] font-bold leading-snug" style={{ color: BROWN }}>
              {c.name}
            </p>
            </span>
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
          className="font-display lp-foil mt-2.5 text-[26px] leading-[1.12] tracking-[-0.02em] sm:text-[36px]"
          style={{ ...foilText, fontWeight: 600 }}
        >
          Everyone plays someone their own level
        </h2>
        <p
          className="mt-4 text-[16px] leading-[1.7] sm:text-[17px]"
          style={{ color: IVORY_SOFT }}
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
      className="relative mt-4 overflow-hidden border-t"
      style={{ background: NIGHT_DEEP, borderColor: BRASS_EDGE }}
    >
      {/* Grain, so the darkest block on the page reads as timber rather than as a bar. */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: LINEN_GRAIN,
          backgroundSize: "220px 220px",
          mixBlendMode: "overlay",
          opacity: 0.35,
        }}
        aria-hidden
      />
      <div className="mx-auto w-full max-w-[1120px] px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {/*
              The name in tiles, closing the page the way it opened. Small enough to read as
              a signature rather than as a second headline, and it carries the accessible
              name so the footer still announces who this is.
            */}
            <TileWord word="ALPHABATTLE" size={21} gap="0.12em" />
            <p className="mt-3 text-[13px]" style={{ color: `${CREAM}8C` }}>
              Blufy&rsquo;s AlphaBattle &middot; Karachi, Pakistan
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="tap-target text-[13.5px] font-semibold transition-opacity hover:opacity-70"
                style={{ color: `${CREAM}CC` }}
              >
                {item.label}
              </a>
            ))}
            <a
              href="https://instagram.com"
              className="tap-target inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: `${CREAM}CC` }}
            >
              <Camera className="size-3.5" aria-hidden />
              Instagram
            </a>
            <a
              href="mailto:info@blufysalphabattle.com"
              className="tap-target inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: `${CREAM}CC` }}
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
