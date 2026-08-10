"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, Copy, Mail, MapPin } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { GameOnForm } from "./GameOnForm";
import {
  GuestPaymentStatus,
  registrationStatusOf,
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import {
  CampaignReduction,
  GameOnRegistration,
  paymentSummary,
  quoteFee,
} from "@/lib/domain/gameOn";
import { redeemDiscount } from "@/lib/domain/events";
import { isInterested, TRACK_LABEL } from "@/lib/firebase/schema";
import { PlayerCategory } from "@/lib/domain/identity";
import { saveRegistration } from "@/lib/supabase/registrations";
import { emailConfirmation } from "@/lib/email/client";
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

  /*
   * Whether the confirmation email was actually accepted by the provider. Starts
   * unknown, so the page never claims a send before one has happened.
   */
  const [emailed, setEmailed] = React.useState<boolean | null>(null);

  const [submitted, setSubmitted] = React.useState<{
    token: string;
    registration: GameOnRegistration;
  } | null>(null);
  const [campaign, setCampaign] = React.useState<CampaignReduction | undefined>();
  const [codeError, setCodeError] = React.useState<string | null>(null);

  /*
   * Whether the record reached the database, and why not.
   *
   * Declared here with the other hooks rather than beside the submit handler:
   * hooks must run in the same order on every render, and there is an early
   * return below for an unknown event.
   */
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

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

    /*
     * Validated in the domain, so expiry is actually enforced. The old check
     * read `active` and the redemption count but never `expiresAt`, so a dated
     * code stayed usable for ever — an early bird the organizer could not close.
     */
    const outcome = redeemDiscount(store.discounts, code, event.id);
    if ("refusal" in outcome) {
      setCodeError(outcome.message);
      setCampaign(undefined);
      return;
    }
    const found = outcome.discount;

    setCodeError(null);
    setCampaign({
      code: found.code,
      label: found.label,
      percentOff: found.kind === "percentage" ? found.value : 0,
      amountOff:
        found.kind === "free-entry" ? event.fee : found.kind === "fixed" ? found.value : 0,
    });
  };

  const submit = async (reg: GameOnRegistration) => {
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
        ...(reg.membershipNumber ? { membershipNumber: reg.membershipNumber } : {}),
        // Stored so the organizer can see where entrants travel from.
        ...(reg.area ? { area: reg.area } : {}),
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
      /*
       * The reduction the participant was actually shown.
       *
       * This used `quote.totalOff`, computed here from the older percentage path,
       * while the amount came from the form's priority pricing. The two disagreed:
       * one registration was stored owing PKR 1,000 with PKR 125 off a PKR 1,250
       * fee — three figures that cannot all be true. The money charged was right;
       * the record of why was not.
       */
      discountAmount: reg.quotedDiscountAmount ?? quote.totalOff,
      currency: event.currency,
    });

    /*
     * The record goes to the database, not just this browser.
     *
     * Until now a registration lived in localStorage, so it existed only on the
     * phone that made it: the organizer never saw it and clearing the browser
     * destroyed it. The local store is still written, so the confirmation screen
     * has something to render immediately, but the database is the record.
     *
     * A failed save must not show a confirmation. Somebody who has already
     * transferred money and is told "registration received" when nothing was
     * saved has no way of knowing anything is wrong.
     */
    /*
     * Read from the live store, not the snapshot this render closed over.
     *
     * `store` is the value captured when the component rendered, so it does not
     * contain the registration created on the line above. Reading it gave
     * undefined, and the row that reached the database held almost nothing — no
     * name, no mobile, no check-in code. The confirmation still said "received",
     * so the failure was invisible from the outside.
     */
    const local = useEventStore
      .getState()
      .registrations.find((r) => r.token === token);
    setSaving(true);
    setSaveError(null);

    if (!local) {
      setSaving(false);
      setSaveError("We could not save your registration. Please try again.");
      return;
    }

    const saved = await saveRegistration({
      eventId: event.id,
      organizationId: event.organizationId,
      checkInCode: local.checkInCode ?? "",
      data: {
        ...local,
        // Sent as the claim actually made. The database decides whether a
        // receipt-backed claim becomes verified; the browser may not.
        paymentStatus: reg.receiptFileName ? "receipt-uploaded" : local.paymentStatus,
      },
    });

    setSaving(false);

    if (!saved.ok) {
      setSaveError(saved.message);
      return;
    }

    setSubmitted({ token, registration: reg });
    window.scrollTo({ top: 0, behavior: "smooth" });

    /*
     * The confirmation email, after the record is safe and never before it.
     *
     * Deliberately not awaited: the participant already has their code on screen, and
     * a slow mail provider must not hold up the page that carries it. The outcome is
     * recorded so the page can say whether it actually went — anything else is a
     * promise nobody checked.
     */
    void emailConfirmation(token).then((outcome) => setEmailed(outcome.ok));
  };

  if (submitted) {
    /*
     * The amount that was recorded, not a fresh calculation.
     *
     * Recomputing here called quoteFee with the participant's membership status,
     * which applies a hardcoded 10% Alliance Française discount and ignores the
     * event's own rate table — so an AlphaBattle entrant priced at PKR 450 by
     * the form was told they had paid PKR 1,125. The confirmation must report
     * the figure the payment queue holds, or the two disagree about money.
     */
    const stored = store.registrations.find((r) => r.token === submitted.token);

    return (
      <GameOnConfirmation
        emailed={emailed}
        token={submitted.token}
        registration={submitted.registration}
        event={event}
        payable={stored?.amountDue ?? submitted.registration.bundleTotal ?? event.fee}
        /*
         * The status actually recorded, not an assumption. The confirmation used
         * to say "Amount due" and badge "Awaiting payment" unconditionally,
         * which contradicted the record it had just written: a receipt is
         * required now, so every submission arrives with one.
         */
        paymentStatus={
          store.registrations.find((r) => r.token === submitted.token)?.paymentStatus ??
          "not-submitted"
        }
        checkInCode={
          store.registrations.find((r) => r.token === submitted.token)?.checkInCode ?? ""
        }
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

          {/*
            * Saving, and failing to save.
            *
            * Somebody who has already transferred money must never be shown a
            * confirmation for a registration that was not stored. The message
            * says what to do next rather than what went wrong technically.
            */}
          {saving ? (
            <p
              className="mt-3 text-center text-[12.5px] font-semibold"
              style={{ color: FOREST }}
              role="status"
            >
              Saving your registration…
            </p>
          ) : null}

          {saveError ? (
            <div
              className="mt-3 rounded-2xl px-4 py-3 text-center"
              style={{ background: "rgba(200,60,60,0.08)" }}
              role="alert"
            >
              <p className="text-[13px] font-semibold text-critical">{saveError}</p>
              <p className="mt-1 text-[12px]" style={{ color: `${BROWN}A6` }}>
                Your details are still on this page. Press Submit to try again, or
                contact {event.contactPhone || "the organizer"} if it keeps failing.
              </p>
            </div>
          ) : null}
        </div>

        <p className="mt-6 text-center text-[12px]" style={{ color: `${BROWN}88` }}>
          <Link
            href={`/events/${event.slug}`}
            className="tap-target underline underline-offset-2"
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
  paymentStatus,
  checkInCode,
  emailed,
}: {
  token: string;
  registration: GameOnRegistration;
  event: ReturnType<typeof selectEventBySlug>;
  payable: number;
  paymentStatus: GuestPaymentStatus;
  /** The six digits they will type at the venue. */
  checkInCode: string;
  /**
   * Whether the confirmation email was accepted by the provider: null while the
   * answer is still outstanding. Three states, because the page must not claim a
   * send before one has happened nor deny one that did.
   */
  emailed: boolean | null;
}) {
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  if (!event) return null;

  const personalUrl = origin ? `${origin}/r/${token}` : "";
  /*
   * The one-tap check-in link. Points straight at the check-in page with the
   * personal token, so on the day it is a single tap rather than a page to read
   * and a code to find.
   */
  const checkInUrl = origin
    ? `${origin}/events/${event.slug}/check-in?t=${token}`
    : "";
  const money = (n: number) => `${event.currency} ${n.toLocaleString("en-PK")}`;

  /*
   * Wording follows the recorded status — see paymentSummary. Saying a fee is
   * due after it has been paid invites a second transfer.
   */
  const pay = paymentSummary(paymentStatus, event.paymentMethods.length > 0);

  /** The body this event actually discounts for, if any. */
  const memberBody =
    event.rates?.find((r) => r.id === "member")?.label.replace(/ member$/i, "") ?? "";

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
              [pay.amountLabel, money(payable)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-[12.5px] text-muted">{label}</span>
                <span className="text-right text-[13.5px] font-semibold text-ink">{value}</span>
              </div>
            ))}

            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
              <span className="shrink-0 text-[12.5px] text-muted">Payment</span>
              <Badge tone={pay.tone}>{pay.badge}</Badge>
            </div>
          </div>
        </Card>

        {/*
          * The check-in code, given the prominence it needs.
          *
          * This is the one thing they must still have on the day, and it was
          * missing entirely — the database held it but the confirmation never
          * showed it, so nobody would have known their code. Large, spaced and
          * copyable, because it gets read off a phone in a doorway.
          */}
        {checkInCode ? (
          <div
            className="mt-4 rounded-[20px] p-5 text-center"
            style={{ background: FOREST }}
          >
            <p
              className="text-[10.5px] font-bold uppercase tracking-[0.18em]"
              style={{ color: GOLD }}
            >
              Your check-in code
            </p>
            <p
              className="num mt-2 text-[40px] font-extrabold leading-none tracking-[0.16em]"
              style={{ color: CREAM }}
            >
              {checkInCode}
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: `${CREAM}B3` }}>
              Bring this on {formatDate(event.startDate)}. Scan the code at the venue
              and enter these six digits.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <Button
                size="sm"
                className="w-full border-0"
                style={{ background: CREAM, color: BROWN }}
                onClick={() => navigator.clipboard?.writeText(checkInCode)}
              >
                Copy code
              </Button>
              {checkInUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  style={{ color: CREAM }}
                  onClick={() => navigator.clipboard?.writeText(checkInUrl)}
                >
                  Copy one-tap check-in link
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/*
          * Named from the event, not hardcoded. An AlphaBattle entrant was told
          * about an Alliance Française discount belonging to the other event.
          */}
        {registration.membershipStatus !== "not-claimed" && memberBody ? (
          <p className="mt-3 rounded-control px-4 py-3 text-[12.5px] leading-relaxed"
             style={{ background: "#C89B3C22", color: "#8A6A1F" }}>
            Your {memberBody} member discount is applied above and confirmed once we have
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

        {/*
          * Says what actually happened, in three states.
          *
          * This once read "A confirmation has been sent to <email>" while no mail
          * provider existed, so somebody who trusted it and closed the page had
          * nothing — no code, no link, no way to check in without finding a
          * volunteer. It then said email is never sent, which stopped being true
          * once sending was built.
          *
          * `emailed` is null until the provider answers, so the page never claims a
          * send before one has happened, and never denies one that did.
          */}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[12.5px]"
           style={{ color: `${BROWN}99` }}>
          <Mail className="size-3.5 shrink-0" />
          {emailed === true
            ? `A copy has been emailed to ${registration.email}. Keep your code either way.`
            : emailed === false
              ? "We could not email you a copy — save your code before closing this page."
              : "Save your code before closing this page."}
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
