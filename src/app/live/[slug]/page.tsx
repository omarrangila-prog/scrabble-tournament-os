"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  Clock,
  MapPin,
  Trophy,
  UserCheck,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import {
  selectEventBySlug,
  useEventStore,
} from "@/lib/store/useEventStore";
import { EVENT_STATE_LABEL, STATE_DESTINATION, type EventState } from "@/lib/domain/events";
import { BoardList } from "@/components/public/BoardList";
import { useEventState } from "@/lib/supabase/useEventState";
import { formatDate } from "@/lib/utils";

/**
 * The phase-aware participant entry point.
 *
 * One stable URL printed on the venue QR. What it shows depends entirely on the
 * event's current state, so a participant who scans at 09:00 sees check-in and
 * the same scan at 14:00 shows their result submission — without the organizer
 * reprinting anything.
 */
export default function LiveEventPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);

  /*
   * The phase comes from the database, not from this phone.
   *
   * Reading it from browser storage meant every device had its own copy, seeded to
   * `registration-open` and never changed by anything the director did — so this
   * page showed "Register now" all day, to people who had already registered.
   *
   * Called above the not-found guard because a hook has to run on every render.
   */
  const phase = useEventState(event?.id ?? "");

  if (!event) {
    return (
      <Shell>
        <EmptyState title="Event not found" description="Check the link, or ask a volunteer." />
      </Shell>
    );
  }

  const state = phase.state ?? event.state;
  const destination = STATE_DESTINATION[state];

  /*
   * No identity gate.
   *
   * This page used to demand an email or mobile before showing anything, matched
   * against registrations in browser storage — which is empty, so nobody could ever
   * be identified and the page was a dead end for every participant.
   *
   * Nothing here needs to know who you are. The board list is a pairing sheet, and
   * checking in has its own page where a code or a personal link proves identity
   * against the database.
   */

  /* ---- Phase views ---------------------------------------------------- */

  return (
    <Shell>
      <EventHeading event={event} state={state} />

      {destination === "closed" ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Clock className="size-5" />}
            title={EVENT_STATE_LABEL[state]}
            description="Nothing to do here just yet. Check back closer to the start."
          />
        </Card>
      ) : null}

      {destination === "register" ? (
        <Card className="mt-6">
          <div className="p-6 text-center">
            <Trophy className="mx-auto size-8 text-primary" />
            <p className="mt-3 text-[17px] font-bold text-ink">Registration is open</p>
            <p className="mt-1 text-[13.5px] text-muted">
              Secure your place — it takes about two minutes.
            </p>
            <Link href={`/events/${event.slug}/register`}>
              <Button variant="primary" size="lg" className="mt-4 w-full">
                Register now
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {/*
        * Check-in is a database operation, and it lives on its own page where a
        * participant can use their code or personal link. The version that used to
        * be here wrote to this browser's storage, so the arrival was invisible to
        * the desk and to the counter on the wall.
        */}
      {destination === "check-in" ? (
        <Card className="mt-6">
          <div className="p-6 text-center">
            <UserCheck className="mx-auto size-8 text-primary" />
            <p className="mt-3 text-[17px] font-bold text-ink">Check-in is open</p>
            <p className="mt-1 text-[13.5px] text-muted">
              Use the link we sent you, or enter your six-digit code.
            </p>
            <Link href={`/events/${event.slug}/check-in`}>
              <Button variant="primary" size="lg" className="mt-4 w-full">
                Check in
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {/*
        * The board list, read from the database. This is the question a participant
        * actually has between rounds, and it is answered without an account, a
        * password or an app.
        */}
      {destination === "pairing" || destination === "submit-result" ? (
        <Card className="mt-6">
          <CardHeader
            title="Find your board"
            subtitle="Type your name. This list updates itself as results come in."
          />
          <div className="px-5 pb-5 text-ink">
            <BoardList eventId={event.id} />
          </div>
        </Card>
      ) : null}

      {/*
        * Scores are entered by the desk, not here.
        *
        * There used to be a form on this page for participants to submit their own
        * result. Two people typing the same game from opposite sides of a table
        * produces two answers and no way to tell which is official, so the official
        * score is the one a scorekeeper records.
        */}
      {destination === "submit-result" ? (
        <Card className="mt-4">
          <div className="px-5 py-4">
            <p className="text-[13.5px] leading-relaxed text-muted">
              Take your result slip to the scoring desk. Your score appears above once it has
              been recorded.
            </p>
          </div>
        </Card>
      ) : null}

      {destination === "standings" || destination === "results" ? (
        <Card className="mt-6">
          <CardHeader
            title={destination === "results" ? "Final results" : "Standings"}
            subtitle={
              destination === "results"
                ? "The tournament is complete."
                : "Updated as results are verified."
            }
          />
          <div className="px-5 pb-5">
            <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] text-muted">
              Standings appear on the venue screen and on the public site.
            </p>
            <Link href="/live" className="mt-3 block">
              <Button variant="secondary" className="w-full">
                Open live standings
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-lg px-5 py-8 sm:py-12">{children}</div>;
}

function EventHeading({
  event,
  state,
}: {
  event: { name: string; startDate: string; venueName: string };
  /** The phase from the database, not this device's copy of it. */
  state: EventState;
}) {
  // Pulses only while a round is running, rather than in every phase.
  const running = state === "round-active";

  return (
    <div>
      <Badge tone={running ? "success" : "neutral"} dot={running} pulse={running}>
        {EVENT_STATE_LABEL[state]}
      </Badge>
      <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
        {event.name}
      </h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {formatDate(event.startDate)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {event.venueName}
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

