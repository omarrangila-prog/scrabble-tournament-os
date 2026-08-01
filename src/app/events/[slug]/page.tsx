"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Mail,
  MapPin,
  Phone,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import {
  registrationStatusOf,
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { CATEGORY_LABEL } from "@/lib/domain/identity";
import { LetterTile } from "@/components/art/ScrabbleArt";
import { cn, formatDate } from "@/lib/utils";

/**
 * Public event page.
 *
 * Reachable without any account. Shows exactly what a prospective player needs
 * to decide whether to enter, and nothing about how the tournament is run.
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
            icon={<Trophy className="size-5" />}
            title="Event not found"
            description="This link may have expired, or the event may not have been published yet."
          />
        </Card>
      </div>
    );
  }

  const status = registrationStatusOf(event, registrations.length);
  const placesLeft = Math.max(0, event.capacity - registrations.length);

  return (
    <div className="min-h-dvh">
      {/* Banner ---------------------------------------------------------- */}
      <header className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(104deg, rgba(115,87,246,0.20) 0%, rgba(57,135,248,0.14) 48%, rgba(85,201,232,0.12) 100%)",
          }}
          aria-hidden
        />
        <div className="board-motif absolute inset-0 opacity-35" aria-hidden />

        <div className="relative mx-auto max-w-[1080px] px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <Badge tone={status.tone === "neutral" ? "neutral" : status.tone} dot pulse={status.open}>
                {status.label}
              </Badge>

              <h1 className="mt-4 text-[32px] font-extrabold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[44px]">
                {event.name}
              </h1>
              <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">
                {event.shortDescription}
              </p>

              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="size-4 text-primary" />
                  {formatDate(event.startDate)} · {event.startTime}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  {event.venueName}, {event.city}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Ticket className="size-4 text-primary" />
                  {event.currency} {event.fee.toLocaleString("en-PK")}
                </span>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {status.open ? (
                  <Link href={`/events/${event.slug}/register`}>
                    <Button variant="primary" size="xl" icon={<ArrowRight className="size-5" />}>
                      Register Now
                    </Button>
                  </Link>
                ) : (
                  <Button variant="secondary" size="xl" disabled>
                    {status.label}
                  </Button>
                )}
                <p className="text-[13px] text-muted">{status.detail}</p>
              </div>
            </div>

            <div className="hidden shrink-0 items-end gap-2 xl:flex" aria-hidden>
              <LetterTile letter="P" size={56} className="float-soft-slow" />
              <LetterTile letter="L" size={56} className="float-soft" style={{ animationDelay: "300ms" }} />
              <LetterTile letter="A" size={56} className="float-soft-slow" style={{ animationDelay: "600ms" }} />
              <LetterTile letter="Y" size={56} tone="gold" className="float-soft" style={{ animationDelay: "900ms" }} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 pb-16 sm:px-8">
        {/* Key figures */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Rounds" value={String(event.rounds)} sub={`${event.roundMinutes} min each`} />
          <Figure label="Divisions" value={String(event.divisions.length)} sub="All levels welcome" />
          <Figure label="Places left" value={String(placesLeft)} sub={`of ${event.capacity}`} />
          <Figure
            label="Entry"
            value={`${event.currency} ${event.fee.toLocaleString("en-PK")}`}
            sub="Discounts available"
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* About */}
          <Card className="lg:col-span-2">
            <CardHeader title="About this tournament" />
            <div className="px-5 pb-5">
              <p className="text-[14.5px] leading-relaxed text-ink">{event.description}</p>

              <h3 className="mt-6 text-[14px] font-bold text-ink">Divisions</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {event.divisions.map((d) => (
                  <span
                    key={d}
                    className="rounded-full border border-line bg-[rgb(var(--c-surface-strong))] px-3.5 py-1.5 text-[13px] font-semibold text-ink"
                  >
                    {CATEGORY_LABEL[d]}
                  </span>
                ))}
              </div>

              <h3 className="mt-6 text-[14px] font-bold text-ink">Format</h3>
              <ul className="mt-2 space-y-1.5 text-[13.5px] text-muted">
                <li>· {event.rounds} rounds of {event.roundMinutes} minutes per player</li>
                <li>· {event.breakMinutes}-minute break between rounds</li>
                <li>· Swiss pairing within each division</li>
                <li>· Doors open {event.startTime}, expected finish {event.expectedFinish}</li>
              </ul>
            </div>
          </Card>

          {/* Prizes + venue */}
          <div className="space-y-4">
            <Card>
              <CardHeader title="Prizes" icon={<Trophy className="size-4.5" />} />
              <ul className="space-y-1.5 px-5 pb-5">
                {event.prizes.map((p) => (
                  <li
                    key={p.place}
                    className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-muted">{p.place}</span>
                    <span className="text-[13.5px] font-bold text-ink">{p.award}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Venue" icon={<MapPin className="size-4.5" />} />
              <div className="space-y-2 px-5 pb-5 text-[13.5px]">
                <p className="font-semibold text-ink">{event.venueName}</p>
                <p className="text-muted">{event.address}, {event.city}</p>
                {event.mapsUrl ? (
                  <a
                    href={event.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-600 hover:underline"
                  >
                    Open in Maps
                    <ArrowRight className="size-3.5" />
                  </a>
                ) : null}
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-[13px] text-muted">
                  <p className="inline-flex items-center gap-2">
                    <Phone className="size-3.5" />
                    {event.contactPhone}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <Mail className="size-3.5" />
                    {event.contactEmail}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Closing call to action */}
        <Card className="mt-5">
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <Clock className="size-6 text-primary" />
            <div>
              <p className="text-[18px] font-bold text-ink">
                Registration closes {formatDate(event.registrationClosesAt)}
              </p>
              <p className="mt-1 text-[13.5px] text-muted">{status.detail}</p>
            </div>
            {status.open ? (
              <Link href={`/events/${event.slug}/register`}>
                <Button variant="primary" size="lg" icon={<Users className="size-4" />}>
                  Register for this tournament
                </Button>
              </Link>
            ) : null}
          </div>
        </Card>
      </main>

      <footer className="border-t border-line px-5 py-8 text-center sm:px-8">
        <p className="text-[12.5px] text-muted">
          {event.organizer} · Organized with Bluffy Alphabattle
        </p>
      </footer>
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass rounded-card p-4">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className={cn("num mt-0.5 text-[24px] font-extrabold tracking-[-0.025em] text-ink")}>
        {value}
      </p>
      <p className="text-[11.5px] text-muted">{sub}</p>
    </div>
  );
}
