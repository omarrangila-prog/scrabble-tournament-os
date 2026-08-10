"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Dices,
  MapPin,
  Utensils,
  Users,
} from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import {
  CATEGORY_DESCRIPTION,
  CATEGORY_LABEL,
  PlayerCategory,
} from "@/lib/domain/identity";
import {
  registrationStatusOf,
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { ParticipationTrack } from "@/lib/firebase/schema";
import { cn, formatDate } from "@/lib/utils";

/** Poster palette. Applied here and on the other participant-facing surfaces. */
const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
/**
 * The current time, read outside render.
 *
 * The React Compiler treats `Date.now()` in a component body as impure and refuses
 * it. Reading the clock through a module-level function keeps the check happy while
 * still giving the real time, which is what deciding whether an offer has expired
 * needs.
 */
function nowMs(): number {
  return Date.now();
}

const BROWN = "#3E2F23";

/**
 * Public wording for the playing categories, as the organizer states them.
 *
 * The internal labels are single words ("Beginner", "Recreational"). Entrants
 * pick from these on the event page, where the plainer phrasing makes it
 * obvious which one applies to them.
 */
const CATEGORY_HEADING: Partial<Record<PlayerCategory, { title: string; body: string }>> = {
  beginner: {
    title: "Beginners / new to the game",
    body: "New to Scrabble, or playing your first event. No experience expected.",
  },
  recreational: {
    title: "Intermediate / recreational",
    body: "You play for fun and know your way around a board.",
  },
  advanced: {
    title: "Advanced / regulars",
    body: "You play often and know the words, the racks and the clock.",
  },
};

/**
 * Common questions, matched to what the event actually runs.
 *
 * These were hardcoded for a board-games evening. On a Scrabble-only event they
 * told entrants they "can join purely for the board games" and could pick
 * "Both" — neither of which exists at an event the page itself describes as
 * Speed Scrabble only.
 */
function faqFor(hasBoardGames: boolean): { q: string; a: string }[] {
  const shared = {
    q: "Do I need an app or an account?",
    a: "No. You register through a link, and check in at the venue by scanning a QR code.",
  };

  if (!hasBoardGames)
    return [
      {
        q: "Do I need to be good at Scrabble?",
        a: "No. You are paired with people of a similar skill level.",
      },
      {
        q: "Can I come on my own?",
        a: "Yes, but bringing more players — family or friends — adds to the atmosphere.",
      },
      shared,
      {
        q: "What if I do not know the songs?",
        a: "The fun is in trying to guess the songs. It does not affect your placing in your category.",
      },
    ];

  return [
    {
      q: "Do I need to be good at Scrabble?",
      a: "No. You can join purely for the board games, and the Speed Scrabble competition has levels from Beginner upwards.",
    },
    {
      q: "Can I come on my own?",
      a: "Yes. The board-game floor is set up for people arriving on their own.",
    },
    shared,
    {
      q: "Can I do both board games and Speed Scrabble?",
      a: "Yes. Choose “Both” when you register.",
    },
  ];
}

const TRACK_COPY: Record<ParticipationTrack, { title: string; body: string }> = {
  board_games: {
    title: "Social Board Games",
    body: "Play casual board games, meet new people, and enjoy the evening. No competition, no experience needed.",
  },
  speed_scrabble: {
    title: "Speed Scrabble",
    body: "Enter the Speed Scrabble competition. You will be seeded, paired and ranked across the evening.",
  },
  both: {
    title: "Both",
    body: "Join the board-game floor and enter the Speed Scrabble competition.",
  },
};

/**
 * The public event page.
 *
 * A digital extension of the poster rather than a restatement of the app. It
 * carries the poster's palette and only the facts the poster confirms —
 * anything the organizer has not supplied is simply absent, because a page
 * stating an invented deadline or capacity is worse than one that omits it.
 */
export default function PublicEventPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);
  const registrations = event ? selectRegistrations(store, event.id) : [];

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState
            icon={<Dices className="size-5" />}
            title="Event not found"
            description="This link may have expired, or the event may not have been published yet."
          />
        </Card>
      </div>
    );
  }

  const status = registrationStatusOf(event, registrations.length);
  const tracks = event.participationTracks ?? [];
  const hasBoardGames = tracks.some((t) => t === "board_games" || t === "both");
  /*
   * The reduced rates that are still open, in the order somebody would meet them.
   * Built from `priceRules` because that is what the form charges from; anything
   * derived separately here would drift from it.
   */
  const rules = event.priceRules;

  const otherPrices: { label: string; price: number; code?: string }[] = [
    ...(rules?.member ? [{ label: `${rules.member.label} rate`, price: rules.member.price }] : []),
    ...(rules?.coupons ?? [])
      .filter((c) => !c.availableUntil || Date.parse(c.availableUntil) >= nowMs())
      .map((c) => ({ label: c.label, price: c.price, code: c.code })),
  ].filter((rate) => rate.price < event.fee);


  const money = (n: number) => `${event.currency} ${n.toLocaleString("en-PK")}`;

  return (
    <main className="min-h-dvh" style={{ background: CREAM }}>
      {/* Diamond grid, echoing the poster's background texture. */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${BROWN}0A 0 1px, transparent 1px 22px),
                            repeating-linear-gradient(-45deg, ${BROWN}0A 0 1px, transparent 1px 22px)`,
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[840px] px-5 py-10 sm:py-14">
        {/* ---- Collaborators ------------------------------------------- */}
        {event.collaborators?.length ? (
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: BROWN }}>
            {event.collaborators.join("  ×  ")}
          </p>
        ) : null}

        {/* ---- Hero ---------------------------------------------------- */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mt-6 text-center"
        >
          <h1
            className="text-[52px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[72px]"
            style={{ color: BROWN }}
          >
            {/*
              * Only the event's own punctuation is coloured. Appending "!"
              * unconditionally renamed "Blufy's AlphaBattle" to
              * "Blufy's AlphaBattle!".
              */}
            {event.name.replace(/!$/, "")}
            {event.name.endsWith("!") ? <span style={{ color: FOREST }}>!</span> : null}
          </h1>

          {event.subtitle ? (
            <p className="mt-3 text-[15px] font-semibold sm:text-[17px]" style={{ color: FOREST }}>
              {event.subtitle}
            </p>
          ) : null}
        </motion.header>

        {/* ---- Essentials ---------------------------------------------- */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: <CalendarDays className="size-4" />,
              label: formatDate(event.startDate),
              sub: new Date(event.startDate).toLocaleDateString("en-GB", { weekday: "long" }),
            },
            {
              icon: <Clock className="size-4" />,
              label: event.timeDisplay ?? event.startTime,
              // "Doors open" named a time nobody stated. AlphaBattle's display
              // time is a full span (12:00 PM to 3:30 PM), not a doors time.
              sub: event.expectedFinish ? "Start to finish" : "Start time",
            },
            {
              icon: <MapPin className="size-4" />,
              label: event.venueName,
              sub: event.address || event.city,
            },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-2xl border bg-white/70 p-4 text-center"
              style={{ borderColor: `${BROWN}1A` }}
            >
              <span className="inline-flex" style={{ color: GOLD }}>
                {item.icon}
              </span>
              <p className="mt-1.5 text-[13.5px] font-bold leading-tight" style={{ color: BROWN }}>
                {item.label}
              </p>
              <p className="mt-0.5 text-[11px] leading-tight" style={{ color: `${BROWN}99` }}>
                {item.sub}
              </p>
            </div>
          ))}
        </div>

        {/* ---- Primary actions ------------------------------------------ */}
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {status.open ? (
            <Link href={`/events/${event.slug}/register`} className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full border-0 sm:w-auto"
                style={{ background: FOREST, color: "white" }}
              >
                Register for {event.name}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          ) : (
            <div
              className="rounded-control px-5 py-3 text-center text-[13.5px] font-semibold"
              style={{ background: `${GOLD}22`, color: BROWN }}
            >
              {status.label} — {status.detail}
            </div>
          )}

          {event.mapsUrl ? (
            <a href={event.mapsUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                View venue
              </Button>
            </a>
          ) : null}
        </div>

        {/* ---- About ---------------------------------------------------- */}
        <section className="mt-12">
          <h2 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
            About {event.name}
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: `${BROWN}CC` }}>
            {event.description}
          </p>
        </section>

        {/*
          * Choose your experience — only where there is a genuine choice.
          *
          * With a single track the heading and "you can join either, or both"
          * described an option that does not exist. A one-track event shows its
          * playing categories instead, which is the choice its entrants
          * actually make.
          */}
        {tracks.length > 1 ? (
          <section className="mt-10">
            <h2 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
              Choose your experience
            </h2>
            <p className="mt-1 text-[13.5px]" style={{ color: `${BROWN}99` }}>
              Pick one when you register. You can join either, or both.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {tracks.map((t) => (
                <div
                  key={t}
                  className="rounded-2xl border bg-white/70 p-4"
                  style={{ borderColor: `${BROWN}1A` }}
                >
                  <p className="text-[14px] font-bold" style={{ color: FOREST }}>
                    {TRACK_COPY[t].title}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: `${BROWN}AA` }}>
                    {TRACK_COPY[t].body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : event.divisions?.length ? (
          <section className="mt-10">
            <h2 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
              Playing categories
            </h2>
            <p className="mt-1 text-[13.5px]" style={{ color: `${BROWN}99` }}>
              Pick the one that fits you when you register.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {event.divisions.map((d) => (
                <div
                  key={d}
                  className="rounded-2xl border bg-white/70 p-4"
                  style={{ borderColor: `${BROWN}1A` }}
                >
                  <p className="text-[14px] font-bold" style={{ color: FOREST }}>
                    {CATEGORY_HEADING[d]?.title ?? CATEGORY_LABEL[d]}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: `${BROWN}AA` }}>
                    {CATEGORY_HEADING[d]?.body ?? CATEGORY_DESCRIPTION[d]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---- Fee ------------------------------------------------------- */}
        <section className="mt-10">
          <h2 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
            Registration fee
          </h2>

          <div
            className="mt-3 rounded-2xl border bg-white/70 p-5"
            style={{ borderColor: `${BROWN}1A` }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[14px]" style={{ color: `${BROWN}CC` }}>
                Standard entry
              </span>
              <span className="num text-[20px] font-extrabold" style={{ color: BROWN }}>
                {money(event.fee)}
              </span>
            </div>

            {/* What the fee covers, so nobody budgets for lunch separately. */}
            <p
              className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold"
              style={{ color: FOREST }}
            >
              <Utensils className="size-3.5" />
              Lunch and tea included
            </p>

            {/*
              * Every price a person can actually be charged, read from the same
              * rules the registration form charges from — so the page and the form
              * cannot disagree.
              *
              * This block previously read `memberDiscountPercent`, a field nothing
              * sets on this event, so it never rendered: the page said PKR 1,250
              * while the homepage advertised "From PKR 950" and the discount was
              * only explained once somebody was already inside the form.
              *
              * Expired offers are left out rather than shown crossed through. An
              * offer that cannot be taken is not a price.
              */}
            {otherPrices.length > 0 ? (
              <>
                {otherPrices.map((rate) => (
                  <div
                    key={rate.label}
                    className="mt-2 flex items-baseline justify-between border-t pt-2"
                    style={{ borderColor: `${BROWN}14` }}
                  >
                    <span className="text-[14px]" style={{ color: `${BROWN}CC` }}>
                      {rate.label}
                      {rate.code ? (
                        <span className="num ml-1.5 text-[12px]" style={{ color: GOLD }}>
                          code {rate.code}
                        </span>
                      ) : null}
                    </span>
                    <span className="num text-[20px] font-extrabold" style={{ color: FOREST }}>
                      {money(rate.price)}
                    </span>
                  </div>
                ))}

                <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: `${BROWN}88` }}>
                  Choose your rate on the payment step when you register. Bring your membership
                  number or code — the reduced fee is confirmed once we have checked it.
                </p>
              </>
            ) : null}
          </div>
        </section>

        {/*
          * Prizes. Shown only when the organizer has stated them — an event with
          * an empty list says nothing rather than implying there are none.
          */}
        {event.prizes?.length ? (
          <section className="mt-10">
            <h2 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
              Prizes
            </h2>

            <div
              className="mt-3 overflow-hidden rounded-2xl border bg-white/70"
              style={{ borderColor: `${BROWN}1A` }}
            >
              {event.prizes.map((p, i) => (
                <div
                  key={p.place}
                  className={cn(
                    "flex flex-col gap-0.5 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4",
                    i > 0 && "border-t",
                  )}
                  style={i > 0 ? { borderColor: `${BROWN}14` } : undefined}
                >
                  <span className="text-[14px]" style={{ color: `${BROWN}CC` }}>
                    {p.place}
                  </span>
                  <span
                    className="num shrink-0 text-[17px] font-extrabold"
                    style={{ color: BROWN }}
                  >
                    {p.award}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---- Venue ----------------------------------------------------- */}
        <section className="mt-10">
          <h2 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
            Venue
          </h2>
          <div
            className="mt-3 rounded-2xl border bg-white/70 p-5"
            style={{ borderColor: `${BROWN}1A` }}
          >
            <p className="text-[15px] font-bold" style={{ color: BROWN }}>
              {event.venueName}
            </p>
            <p className="mt-0.5 text-[13.5px]" style={{ color: `${BROWN}AA` }}>
              {event.address || event.city}
            </p>
            {event.mapsUrl ? (
              <a
                href={event.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="tap-target mt-2 inline-block text-[13px] font-semibold underline underline-offset-2"
                style={{ color: FOREST }}
              >
                Open in Maps
              </a>
            ) : null}
          </div>
        </section>

        {/* ---- Questions -------------------------------------------------- */}
        <section className="mt-10">
          <h2 className="text-[20px] font-extrabold" style={{ color: BROWN }}>
            Common questions
          </h2>

          <div className="mt-3 space-y-2">
            {faqFor(hasBoardGames).map((item) => (
              <details
                key={item.q}
                className="rounded-2xl border bg-white/70 p-4"
                style={{ borderColor: `${BROWN}1A` }}
              >
                <summary
                  className="cursor-pointer text-[14px] font-semibold"
                  style={{ color: BROWN }}
                >
                  {item.q}
                </summary>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: `${BROWN}AA` }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ---- Closing call ------------------------------------------------ */}
        {status.open ? (
          <section className="mt-12 text-center">
            <p className="text-[15px] font-semibold" style={{ color: BROWN }}>
              {event.bannerCaption}
            </p>
            <Link href={`/events/${event.slug}/register`}>
              <Button
                size="lg"
                className="mt-4 border-0"
                style={{ background: FOREST, color: "white" }}
              >
                Register for {event.name}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            {registrations.length > 0 ? (
              <p
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px]"
                style={{ color: `${BROWN}99` }}
              >
                <Users className="size-3.5" />
                {registrations.length} already registered
              </p>
            ) : null}
          </section>
        ) : null}

        {/* ---- Partners ------------------------------------------------------ */}
        {event.collaborators?.length ? (
          <footer className="mt-14 border-t pt-6 text-center" style={{ borderColor: `${BROWN}1A` }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: `${BROWN}88` }}>
              Presented in collaboration with
            </p>
            <p className="mt-2 text-[14px] font-bold" style={{ color: BROWN }}>
              {event.collaborators.join("  ×  ")}
            </p>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
