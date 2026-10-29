"use client";

import * as React from "react";
/* eslint-disable @next/next/no-img-element -- fixed-size logos from /public; no optimisation needed */
import { CheckCircle2, Clock, MapPin, UtensilsCrossed } from "lucide-react";

import { eventTimeLine } from "@/lib/domain/eventTime";
import { MAFIA_FEE, tidyName } from "@/lib/domain/mafia";
import { readPublicEvent, type StoredEvent } from "@/lib/supabase/events";
import {
  saveMafiaEntry,
  MAFIA_EVENT_ID,
  MAFIA_SLUG,
} from "@/lib/supabase/mafia";
import { uploadPaymentProof } from "@/lib/supabase/paymentProof";
import { formatDate } from "@/lib/utils";

import { MafiaForm, type MafiaSubmission } from "./MafiaForm";
import { NOIR } from "./noir";

/**
 * The Mafia Wars page.
 *
 * Its own route and its own look: a social game night, not a Scrabble tournament, and the
 * poster's dark newsprint-and-cigar mood is most of what makes people want to come. A sign-up is
 * stored apart from the tournament's registrations (see `0096_mafia_wars_and_event_hosts.sql`),
 * so nobody on this list can be seated at a Scrabble board.
 *
 * What it states — the date, the time, the price, the bank account, the terms — is read from the
 * event row, so changing any of it is an edit to one row and not a deploy.
 */
export default function MafiaPage() {
  const [event, setEvent] = React.useState<StoredEvent | null>(null);
  const [resolved, setResolved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<MafiaSubmission | null>(null);

  /* A second tap, refused before React re-renders; state would let both through. */
  const submitting = React.useRef(false);

  React.useEffect(() => {
    let live = true;
    void readPublicEvent(MAFIA_SLUG).then((stored) => {
      if (!live) return;
      setEvent(stored);
      setResolved(true);
    });
    return () => {
      live = false;
    };
  }, []);

  /* Declared before `submit`, which closes over them. */
  const details = event?.details;
  const fee = details?.fee ?? MAFIA_FEE;
  const currency = details?.currency ?? "PKR";
  const dateLabel = details?.startDate ? formatDate(details.startDate) : "";
  const timeLabel = eventTimeLine(details?.startTime, details?.endTime);
  const money = `${currency} ${fee.toLocaleString("en-PK")}`;

  const submit = async (entry: MafiaSubmission) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);

    try {
      /* The receipt goes up first: if it fails nothing is written. */
      let proof = null;
      if (entry.proofFile) {
        const upload = await uploadPaymentProof({
          eventId: MAFIA_EVENT_ID,
          file: entry.proofFile,
        });
        if (!upload.ok) {
          setError(upload.message);
          return;
        }
        proof = upload.proof;
      }

      const saved = await saveMafiaEntry({
        fullName: tidyName(entry.fullName),
        age: Number(entry.age),
        phone: entry.phone.trim(),
        payment: "online",
        /*
         * The claim they made, never a verdict. The database decides whether a stored receipt
         * counts as paid; the insert policy refuses anything stronger than this.
         */
        paymentStatus: "receipt-uploaded",
        amountDue: fee,
        currency,
        ...(proof ? { paymentProof: proof } : {}),
        mediaConsent: entry.mediaConsent === true,
        termsAccepted: entry.termsAccepted,
        signedUpAt: new Date().toISOString(),
      });

      if (!saved.ok) {
        setError(saved.message);
        return;
      }
      setDone(entry);
    } finally {
      setSaving(false);
      submitting.current = false;
    }
  };

  if (!resolved) {
    return (
      <Shell>
        <p
          className="py-24 text-center text-[15px]"
          style={{ color: NOIR.muted }}
        >
          Opening the form…
        </p>
      </Shell>
    );
  }

  if (!event) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <p className="text-[18px] font-bold" style={{ color: NOIR.cream }}>
            Sign-ups are not open
          </p>
          <p className="mt-1 text-[14px]" style={{ color: NOIR.muted }}>
            This link is not live yet. Please check with the organisers.
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-[520px] pt-6 text-center">
          <span
            className="inline-grid size-14 place-items-center rounded-full"
            style={{ background: `${NOIR.red}33`, color: NOIR.redBright }}
          >
            <CheckCircle2 className="size-7" />
          </span>
          <h1
            className="mt-4 text-[28px] font-bold leading-tight"
            style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
          >
            You&rsquo;re in
          </h1>
          <p
            className="mt-2 text-[15px] leading-relaxed"
            style={{ color: NOIR.soft }}
          >
            Thank you, {tidyName(done.fullName).split(" ")[0]}. Your place at
            Mafia Wars is recorded.
          </p>

          <div
            className="mt-6 space-y-3 rounded-[18px] border p-4 text-left sm:p-5"
            style={{ background: NOIR.card, borderColor: NOIR.line }}
          >
            <Line label="Name" value={tidyName(done.fullName)} />
            <Line label="Age" value={done.age.trim()} />
            {dateLabel ? (
              <Line
                label="When"
                value={[dateLabel, timeLabel].filter(Boolean).join(" · ")}
              />
            ) : null}
            {details?.venueName ? (
              <Line
                label="Where"
                value={
                  details.mapsUrl ? (
                    <a
                      href={details.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-4"
                    >
                      {details.venueName}
                    </a>
                  ) : (
                    details.venueName
                  )
                }
              />
            ) : null}
            {details?.venueAddress ? (
              <Line label="Address" value={details.venueAddress} />
            ) : null}
            <Line label="We will call" value={done.phone.trim()} />
            <Line label="Paid online" value={money} />
          </div>

          <p
            className="mt-5 text-[13.5px] leading-relaxed"
            style={{ color: NOIR.muted }}
          >
            We have your receipt and food is included. The organisers will be in
            touch on the number above if anything changes.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto w-full max-w-[560px]">
        <header className="text-center">
          {/* The poster's lettering: a tall serif, and the second word in red italics. */}
          <h1 className="mt-6 leading-[0.9]" aria-label="Mafia Wars">
            <span
              aria-hidden
              className="block text-[58px] font-bold tracking-[-0.02em] sm:text-[84px]"
              style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
            >
              MAFIA
            </span>
            <span
              aria-hidden
              className="-mt-1 block text-[52px] font-black italic tracking-[-0.01em] sm:text-[76px]"
              style={{
                color: NOIR.redBright,
                fontFamily: NOIR.serif,
                transform: "skewX(-6deg)",
              }}
            >
              WARS
            </span>
          </h1>

          <p
            className="mt-3 text-[17px] italic"
            style={{ color: NOIR.soft, fontFamily: NOIR.serif }}
          >
            Will <span style={{ color: NOIR.redBright }}>you</span> be joining
            us?
          </p>

          <div
            className="mt-5 flex items-center justify-center gap-4 text-[13.5px] font-semibold"
            style={{ color: NOIR.cream }}
          >
            <span className="h-px w-8" style={{ background: NOIR.line }} />
            <span className="tracking-[0.12em]">
              {dateLabel || "22 Nov 2026"}
            </span>
            <span className="h-px w-8" style={{ background: NOIR.line }} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
            {timeLabel ? (
              <Fact icon={<Clock className="size-3.5" />}>{timeLabel}</Fact>
            ) : null}
            {details?.venueName ? (
              <Fact
                icon={<MapPin className="size-3.5" />}
                href={details.mapsUrl}
              >
                {details.venueName}
              </Fact>
            ) : null}
          </div>
          {details?.venueAddress ? (
            <p className="mt-1.5 text-[12.5px]" style={{ color: NOIR.muted }}>
              {details.venueAddress}
            </p>
          ) : null}
        </header>

        <div
          className="mt-6 flex items-center justify-center gap-2.5 rounded-[14px] border px-4 py-3 text-[14px] font-semibold"
          style={{
            background: NOIR.card,
            borderColor: NOIR.line,
            color: NOIR.cream,
          }}
        >
          <UtensilsCrossed
            className="size-4"
            style={{ color: NOIR.redBright }}
          />
          <span>
            {money} per head <span style={{ color: NOIR.muted }}>·</span> food
            included
          </span>
        </div>

        <div
          className="mt-4 rounded-[18px] border p-4 sm:p-6"
          style={{ background: NOIR.card, borderColor: NOIR.line }}
        >
          <MafiaForm
            fee={fee}
            currency={currency}
            paymentInstructions={details?.paymentInstructions ?? ""}
            terms={details?.terms ?? ""}
            saving={saving}
            error={error}
            onSubmit={(entry) => void submit(entry)}
          />
        </div>
      </div>
    </Shell>
  );
}

/** The poster's frame: dark, with both organisers' marks across the top as it has them. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-dvh px-4 pb-14 pt-5 sm:pt-8"
      style={{
        background: `radial-gradient(120% 60% at 50% 0%, #2b1f16 0%, ${NOIR.bg} 62%)`,
        color: NOIR.cream,
      }}
    >
      <div className="mx-auto flex w-full max-w-[560px] items-center justify-between">
        <img
          src="/mafia/blufys-alphabattle.png"
          alt="Blufy's Alphabattle"
          width={135}
          height={34}
          className="h-[34px] w-auto sm:h-[42px]"
        />
        <img
          src="/mafia/upstairs.png"
          alt="Upstairs — see you upstairs"
          width={56}
          height={56}
          className="size-[56px] rounded-full sm:size-[66px]"
        />
      </div>
      {children}
    </main>
  );
}

function Fact({
  icon,
  href,
  children,
}: {
  icon: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <span style={{ color: NOIR.redBright }}>{icon}</span>
      {children}
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 text-[13.5px] font-semibold underline decoration-dotted underline-offset-4"
      style={{ color: NOIR.cream }}
    >
      {body}
    </a>
  ) : (
    <span
      className="flex items-center gap-1.5 text-[13.5px] font-semibold"
      style={{ color: NOIR.cream }}
    >
      {body}
    </span>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-0 last:pb-0"
      style={{ borderColor: NOIR.line }}
    >
      <span
        className="text-[12.5px] font-semibold uppercase tracking-wide"
        style={{ color: NOIR.muted }}
      >
        {label}
      </span>
      <span
        className="min-w-0 text-right text-[14.5px] font-semibold"
        style={{ color: NOIR.cream }}
      >
        {value}
      </span>
    </div>
  );
}
