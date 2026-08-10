"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  MapPin,
  Trophy,
  UserCheck,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input } from "@/components/ui";
import {
  GuestRegistration,
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { EVENT_STATE_LABEL, STATE_DESTINATION } from "@/lib/domain/events";
import { useLiveStore } from "@/lib/store/useLiveStore";
import { BoardList } from "@/components/public/BoardList";
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
  const live = useLiveStore();
  const event = selectEventBySlug(store, slug);
  const registrations = event ? selectRegistrations(store, event.id) : [];

  /** The device remembers who it belongs to, so identity is asked once. */
  const [identity, setIdentity] = React.useState<GuestRegistration | null>(null);
  const [lookup, setLookup] = React.useState("");
  const [lookupError, setLookupError] = React.useState<string | null>(null);

  // Restore a previous session on this device.
  const remembered = live.sessionFor(event?.id ?? "");
  const [restored, setRestored] = React.useState(false);
  if (!restored && remembered && !identity) {
    setRestored(true);
    const found = registrations.find((r) => r.id === remembered);
    if (found) setIdentity(found);
  }

  if (!event) {
    return (
      <Shell>
        <EmptyState title="Event not found" description="Check the link, or ask a volunteer." />
      </Shell>
    );
  }

  const destination = STATE_DESTINATION[event.state];

  const identify = () => {
    const q = lookup.trim().toLowerCase();
    if (!q) return;
    const found = registrations.find(
      (r) =>
        r.email.toLowerCase() === q ||
        r.mobile.replace(/\D/g, "").endsWith(q.replace(/\D/g, "")) ||
        r.token.toLowerCase() === q ||
        r.fullName.toLowerCase() === q,
    );
    if (!found) {
      setLookupError("We could not find that entry. Try your email, or ask a volunteer.");
      return;
    }
    setLookupError(null);
    setIdentity(found);
    live.rememberSession(event.id, found.id);
  };

  /* ---- Identity gate ------------------------------------------------- */

  if (!identity && destination !== "register" && destination !== "closed") {
    return (
      <Shell>
        <EventHeading event={event} />
        <Card className="mt-6">
          <CardHeader
            title="Let's find you"
            subtitle="Enter the email or phone number you registered with."
          />
          <div className="space-y-3 px-5 pb-5">
            <Field label="Email or mobile number" error={lookupError ?? undefined}>
              <Input
                autoFocus
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && identify()}
                placeholder="you@example.com"
                invalid={!!lookupError}
              />
            </Field>
            <Button variant="primary" size="lg" className="w-full" onClick={identify}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
            <p className="text-center text-[12.5px] text-muted">
              No password needed. This device will remember you for the rest of the event.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  /* ---- Phase views ---------------------------------------------------- */

  return (
    <Shell>
      <EventHeading event={event} />

      {destination === "closed" ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Clock className="size-5" />}
            title={EVENT_STATE_LABEL[event.state]}
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

      {identity ? (
        <p className="mt-6 text-center text-[12px] text-faint">
          Signed in as {identity.fullName} ·{" "}
          <button
            onClick={() => {
              live.forgetSession(event.id);
              setIdentity(null);
            }}
            className="underline underline-offset-2 hover:text-muted"
          >
            not you?
          </button>
        </p>
      ) : null}
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-lg px-5 py-8 sm:py-12">{children}</div>;
}

function EventHeading({ event }: { event: { name: string; state: string; startDate: string; venueName: string } }) {
  return (
    <div>
      <Badge tone="success" dot pulse>
        {EVENT_STATE_LABEL[event.state as keyof typeof EVENT_STATE_LABEL]}
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

