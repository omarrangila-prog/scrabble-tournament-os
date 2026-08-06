"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, Copy, Mail, MapPin } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { GameOnForm } from "./GameOnForm";
import {
  registrationStatusOf,
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import {
  CampaignReduction,
  GameOnRegistration,
  quoteFee,
} from "@/lib/domain/gameOn";
import { isInterested, TRACK_LABEL } from "@/lib/firebase/schema";
import { PlayerCategory } from "@/lib/domain/identity";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { formatDate } from "@/lib/utils";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const BROWN = "#3E2F23";
const GOLD = "#C89B3C";

/**
 * GAME ON! registration.
 *
 * No account, no password, no app. The participant fills four short steps and
 * receives a personal link. Internal record ids are never shown or placed in a
 * URL — the token in the confirmation is opaque and carries nothing about them.
 */
export default function RegisterPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);
  const registrations = event ? selectRegistrations(store, event.id) : [];

  /*
   * No cross-event picker on the registration form.
   *
   * The form is opened from one event's own link, and offering to add a second
   * event there turned a single decision into a shopping basket — someone
   * registering for 23 August was asked about 8 August mid-form. Each event is
   * registered for through its own link.
   *
   * The form still accepts `otherEvents` and prices a bundle correctly; nothing
   * is passed, so the block does not render.
   */

  const [submitted, setSubmitted] = React.useState<{
    token: string;
    registration: GameOnRegistration;
  } | null>(null);
  const [campaign, setCampaign] = React.useState<CampaignReduction | undefined>();
  const [codeError, setCodeError] = React.useState<string | null>(null);

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState
            title="Event not found"
            description="This registration link is no longer valid."
          />
        </Card>
      </div>
    );
  }

  const status = registrationStatusOf(event, registrations.length);

  const applyCode = (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;

    const found = store.discounts.find(
      (d) => d.eventId === event.id && d.active && d.code === code,
    );
    if (!found) {
      setCodeError("That code is not recognised for this event.");
      setCampaign(undefined);
      return;
    }
    if (found.maxRedemptions > 0 && found.redemptions >= found.maxRedemptions) {
      setCodeError("This code has reached its limit.");
      setCampaign(undefined);
      return;
    }

    setCodeError(null);
    setCampaign({
      code: found.code,
      label: found.label,
      percentOff: found.kind === "percentage" ? found.value : 0,
      amountOff:
        found.kind === "free-entry" ? event.fee : found.kind === "fixed" ? found.value : 0,
    });
  };

  const submit = (reg: GameOnRegistration) => {
    const quote = quoteFee(reg.membershipStatus, campaign, event.fee, event.currency);

    /*
     * The registration is created, and the Jamming Session interest is stored
     * separately. It is a different event with its own consent, and someone
     * must be able to withdraw from it without touching their GAME ON! entry.
     */
    const token = store.submitRegistration({
      eventId: event.id,
      fullName: reg.fullName,
      email: reg.email,
      mobile: reg.mobile,
      dateOfBirth: reg.dateOfBirth ?? "",
      city: reg.city,
      club: reg.affiliation || "Unaffiliated",
      participationTrack: reg.track,
      experience: reg.playedCompetitiveScrabble ? "Played competitively" : "New to competition",
      selfRating: reg.typicalScore,
      preferredDivision: (reg.requestedLevel ?? "beginner") as PlayerCategory,
      previousEvents: reg.previousTournaments,
      answers: {
        ...(reg.favouriteGames ? { favouriteGames: reg.favouriteGames } : {}),
        ...(reg.attendingWith ? { attendingWith: reg.attendingWith } : {}),
        ...(reg.membershipNumber ? { membershipNumber: reg.membershipNumber } : {}),
        ...(reg.jammingSessionInterest
          ? { jammingSessionInterest: reg.jammingSessionInterest }
          : {}),
      },
      // No payment method is configured until the organizer sets one, so the
      // participant is not asked to choose one that does not exist yet.
      paymentMethod: event.paymentMethods[0] ?? "cash",
      receiptFileName: reg.receiptFileName,
      // The bundle total when they added another event, so the payment queue
      // shows what they were actually quoted.
      amountDue: reg.bundleTotal ?? quote.payable,
      discountCode: campaign?.code,
      discountAmount: quote.totalOff,
      currency: event.currency,
    });

    setSubmitted({ token, registration: reg });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submitted) {
    const quote = quoteFee(
      submitted.registration.membershipStatus,
      campaign,
      event.fee,
      event.currency,
    );
    return (
      <GameOnConfirmation
        token={submitted.token}
        registration={submitted.registration}
        event={event}
        payable={quote.payable}
      />
    );
  }

  if (!status.open) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState title={status.label} description={status.detail} />
        </Card>
      </div>
    );
  }

  return (
    <main className="relative min-h-dvh px-4 py-8 sm:py-12" style={{ background: CREAM }}>
      {/* Diamond grid, echoing the poster's texture. Behind everything. */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${BROWN}0A 0 1px, transparent 1px 22px),
                            repeating-linear-gradient(-45deg, ${BROWN}0A 0 1px, transparent 1px 22px)`,
        }}
        aria-hidden
      />

      {/* A soft wash behind the header, so the page has a focal point. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
        style={{
          background: `radial-gradient(60% 100% at 50% 0%, ${FOREST}14, transparent 70%)`,
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[600px]">
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          {event.collaborators?.length ? (
            <p
              // Wide letter-spacing on three joined names overruns a 320px
              // screen, so it tightens and wraps on the narrowest phones.
              className="text-[10.5px] font-bold uppercase tracking-[0.08em] sm:tracking-[0.16em]"
              style={{ color: `${BROWN}99` }}
            >
              {event.collaborators.join("  ×  ")}
            </p>
          ) : null}

          {/* Scales from the smallest phone rather than starting at 34px. */}
          <h1
            className="mt-2 text-[27px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[40px]"
            style={{ color: BROWN }}
          >
            {event.name}
          </h1>

          {event.subtitle ? (
            <p className="mt-1.5 text-[14px] font-semibold" style={{ color: FOREST }}>
              {event.subtitle}
            </p>
          ) : null}

          {/* The three facts someone checks before deciding to fill this in. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            {[
              { icon: <CalendarDays className="size-3.5" />, text: formatDate(event.startDate) },
              { icon: <Clock className="size-3.5" />, text: event.timeDisplay ?? event.startTime },
              { icon: <MapPin className="size-3.5" />, text: event.venueName },
            ].map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-[12.5px]"
                style={{ color: `${BROWN}CC` }}
              >
                <span style={{ color: GOLD }}>{item.icon}</span>
                {item.text}
              </span>
            ))}
          </div>
        </motion.header>

        <div className="mt-7">
          <GameOnForm
            event={event}
            onSubmit={submit}
            campaign={campaign}
            onCampaignCode={applyCode}
          />
          {codeError ? (
            <p className="mt-2 text-center text-[12.5px] text-critical">{codeError}</p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-[12px]" style={{ color: `${BROWN}88` }}>
          <Link
            href={`/events/${event.slug}`}
            className="underline underline-offset-2"
          >
            Back to event details
          </Link>
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What a participant sees after submitting.
 *
 * States what they joined, what they owe and where to be. The token shown is
 * the opaque participant token, never an internal record id.
 */
function GameOnConfirmation({
  token,
  registration,
  event,
  payable,
}: {
  token: string;
  registration: GameOnRegistration;
  event: ReturnType<typeof selectEventBySlug>;
  payable: number;
}) {
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  if (!event) return null;

  const personalUrl = origin ? `${origin}/r/${token}` : "";
  const money = (n: number) => `${event.currency} ${n.toLocaleString("en-PK")}`;

  return (
    <main className="min-h-dvh px-4 py-10 sm:py-16" style={{ background: CREAM }}>
      <div className="mx-auto w-full max-w-[560px] text-center">
        <span
          className="inline-grid size-14 place-items-center rounded-full"
          style={{ background: `${FOREST}1A`, color: FOREST }}
        >
          <CheckCircle2 className="size-7" />
        </span>

        <h1 className="mt-4 text-[26px] font-extrabold" style={{ color: BROWN }}>
          Registration received
        </h1>
        <p className="mt-1 text-[15px] font-semibold" style={{ color: BROWN }}>
          {registration.fullName}
        </p>

        <Card className="mt-6 text-left">
          <div className="space-y-2.5 p-5">
            {[
              ["Event", event.name],
              ["Date", formatDate(event.startDate)],
              ["Time", event.timeDisplay ?? event.startTime],
              ["Venue", `${event.venueName}, ${event.city}`],
              ["Joining", TRACK_LABEL[registration.track]],
              ["Amount due", money(payable)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-[12.5px] text-muted">{label}</span>
                <span className="text-right text-[13.5px] font-semibold text-ink">{value}</span>
              </div>
            ))}

            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
              <span className="shrink-0 text-[12.5px] text-muted">Payment</span>
              <Badge tone="warning">
                {event.paymentMethods.length ? "Awaiting payment" : "Details to follow"}
              </Badge>
            </div>
          </div>
        </Card>

        {registration.membershipStatus !== "not-claimed" ? (
          <p className="mt-3 rounded-control px-4 py-3 text-[12.5px] leading-relaxed"
             style={{ background: "#C89B3C22", color: "#8A6A1F" }}>
            Your Alliance Française member discount is applied above and confirmed once we have
            checked your membership number.
          </p>
        ) : null}

        {registration.jammingSessionInterest &&
        isInterested(registration.jammingSessionInterest) ? (
          <p className="mt-3 text-[12.5px]" style={{ color: `${BROWN}99` }}>
            We will send you the Jamming Session details when 23 August is confirmed.
          </p>
        ) : null}

        {/* Personal link and QR — the participant's way back in. */}
        {personalUrl ? (
          <Card className="mt-4">
            <div className="flex flex-col items-center gap-3 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrToDataUri(personalUrl, { size: 160 })}
                alt="Your personal registration QR code"
                width={160}
                height={160}
                className="rounded-compact bg-white p-2"
              />
              <p className="text-[12px] text-muted">
                Save this. Scan it at the venue to check in.
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={<Copy className="size-3.5" />}
                onClick={() => navigator.clipboard?.writeText(personalUrl)}
              >
                Copy my link
              </Button>
            </div>
          </Card>
        ) : null}

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[12.5px]"
           style={{ color: `${BROWN}99` }}>
          <Mail className="size-3.5" />
          A confirmation has been sent to {registration.email}
        </p>

        <Link href={`/events/${event.slug}`}>
          <Button variant="secondary" className="mt-6">
            Back to event details
          </Button>
        </Link>
      </div>
    </main>
  );
}
