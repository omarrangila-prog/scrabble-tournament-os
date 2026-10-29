"use client";

/* eslint-disable @next/next/no-img-element -- fixed-size logos from /public; no optimisation needed */
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarPlus, CheckCircle2, Clock, MapPin } from "lucide-react";

import { eventTimeLine } from "@/lib/domain/eventTime";
import {
  MAFIA_FEE,
  calendarLink,
  posterDate,
  tidyName,
} from "@/lib/domain/mafia";
import { readPublicEvent, type StoredEvent } from "@/lib/supabase/events";
import {
  saveMafiaEntry,
  MAFIA_EVENT_ID,
  MAFIA_SLUG,
} from "@/lib/supabase/mafia";
import { uploadPaymentProof } from "@/lib/supabase/paymentProof";
import { formatDate } from "@/lib/utils";

import { Hat } from "./Hat";
import { MafiaForm, type MafiaSubmission } from "./MafiaForm";
import styles from "./mafia.module.css";
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
          className="py-28 text-center text-[15px]"
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
        <div className="py-28 text-center">
          <p
            className="text-[22px] font-bold"
            style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
          >
            Sign-ups are not open
          </p>
          <p className="mt-1.5 text-[14px]" style={{ color: NOIR.muted }}>
            This link is not live yet. Please check with the organisers.
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Confirmation
          entry={done}
          money={money}
          whenLabel={[dateLabel, timeLabel].filter(Boolean).join(" · ")}
          venueName={details?.venueName ?? ""}
          venueAddress={details?.venueAddress ?? ""}
          mapsUrl={details?.mapsUrl ?? ""}
          calendar={calendarLink({
            title: "Mafia Wars",
            date: details?.startDate,
            start: details?.startTime,
            end: details?.endTime,
            location: [details?.venueName, details?.venueAddress]
              .filter(Boolean)
              .join(", "),
            details:
              "Hosted by Blufy's Alphabattle and Upstairs. Food included.",
          })}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Hero
        date={posterDate(details?.startDate)}
        year={details?.startDate?.slice(0, 4) ?? ""}
        time={timeLabel}
        venue={details?.venueName ?? ""}
        mapsUrl={details?.mapsUrl}
        address={details?.venueAddress ?? ""}
      />

      <Ticket money={money} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className={`${styles.card} mt-6 p-5 sm:p-7`}
      >
        {/* A suit badge sitting on the card's top edge, as the pip on a playing card does. */}
        <span className={styles.medallion} aria-hidden>
          ♠
        </span>

        <MafiaForm
          fee={fee}
          currency={currency}
          paymentInstructions={details?.paymentInstructions ?? ""}
          terms={details?.terms ?? ""}
          saving={saving}
          error={error}
          onSubmit={(entry) => void submit(entry)}
        />
      </motion.div>

      <footer className="mt-8 text-center">
        <p
          className="text-[19px]"
          style={{ color: NOIR.soft, fontFamily: NOIR.script }}
        >
          The underworld never sleeps.
        </p>
        <p
          className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: NOIR.muted }}
        >
          Blufy&rsquo;s Alphabattle{" "}
          <span style={{ color: NOIR.redBright }}>♠</span> Upstairs
        </p>
      </footer>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The poster's frame: a dark room with light through blinds, grain over everything, and both
 * organisers' marks across the top as the poster has them. The room is fixed behind the page so
 * it stays put while the form scrolls.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="relative min-h-dvh overflow-x-clip px-4 pb-16 pt-5 sm:pt-8"
      style={{ color: NOIR.cream, background: NOIR.bg }}
    >
      {/*
        The page behind the page. The app's own background is light, and a phone's rubber-band
        scroll or a very tall window would show it past the edge of the room.
      */}
      <style>{`html, body { background: ${NOIR.bg}; }`}</style>
      <div className={styles.backdrop} aria-hidden>
        <div className={styles.glow} />
        <div className={styles.slats} />
        <div className={styles.smoke} />
        <div className={styles.smokeTwo} />
        <div className={styles.grain} />
        <div className={styles.vignette} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[560px]">
        <div className="flex items-center justify-between">
          <img
            src="/mafia/blufys-alphabattle.png"
            alt="Blufy's Alphabattle"
            width={135}
            height={34}
            className={`${styles.softEdges} h-[34px] w-auto sm:h-[42px]`}
            /* The crop's own dark ground drops out against the room instead of showing as a box. */
            style={{ mixBlendMode: "lighten" }}
          />
          <img
            src="/mafia/upstairs.png"
            alt="Upstairs — see you upstairs"
            width={56}
            height={56}
            className="size-[56px] rounded-full sm:size-[66px]"
            style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.55)" }}
          />
        </div>
        {children}
      </div>
    </main>
  );
}

/** The hat, the title and the three facts: when, what time, where. As the poster stacks them. */
function Hero({
  date,
  year,
  time,
  venue,
  mapsUrl,
  address,
}: {
  date: string;
  year: string;
  time: string;
  venue: string;
  mapsUrl?: string;
  address: string;
}) {
  const reduce = useReducedMotion();
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.55,
            delay,
            ease: [0.2, 0.7, 0.2, 1] as const,
          },
        };

  return (
    <header className="text-center">
      <div className="relative mx-auto mt-3 w-[150px] sm:w-[190px]">
        <Hat />
      </div>

      {/*
        MAFIA in tall cream capitals with WARS in red brush script cutting across its foot, the
        way the poster overlaps them. The real words are on the heading for a screen reader; the
        two painted words are hidden from it so it does not read the title twice.
      */}
      <h1 className="relative -mt-4 sm:-mt-6" aria-label="Mafia Wars">
        <motion.span
          aria-hidden
          {...rise(0.1)}
          className={`${styles.mafia} block leading-[0.88]`}
          style={{
            fontFamily: NOIR.serif,
            fontWeight: 900,
            fontSize: "clamp(66px, 22vw, 124px)",
            letterSpacing: "-0.015em",
          }}
        >
          MAFIA
        </motion.span>
        <motion.span
          aria-hidden
          {...rise(0.22)}
          className={`${styles.wars} relative -mt-[0.2em] block leading-[0.9]`}
          style={{
            fontFamily: NOIR.brush,
            fontSize: "clamp(58px, 19.5vw, 108px)",
            letterSpacing: "0.02em",
            transform: "rotate(-5deg) translateX(7%)",
          }}
        >
          WARS
        </motion.span>
      </h1>

      <motion.p
        {...rise(0.36)}
        className="mt-3 text-[30px] leading-none sm:text-[36px]"
        style={{ color: NOIR.cream, fontFamily: NOIR.script }}
      >
        Will <span style={{ color: NOIR.redBright }}>You</span> Be Joining Us?
      </motion.p>

      <motion.div {...rise(0.46)} className="mt-7">
        <div className="flex items-center justify-center gap-4">
          <span
            className="h-px w-12 sm:w-20"
            style={{ background: `${NOIR.gold}88` }}
          />
          <span
            className="text-[24px] font-semibold tracking-[0.1em] sm:text-[28px]"
            style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
          >
            {date || "22ND NOV"}
          </span>
          <span
            className="h-px w-12 sm:w-20"
            style={{ background: `${NOIR.gold}88` }}
          />
        </div>
        {year ? (
          <p
            className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.34em]"
            style={{ color: NOIR.muted }}
          >
            {year}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col items-center gap-3">
          {time ? (
            <Fact icon={<Clock className="size-[15px]" />}>{time}</Fact>
          ) : null}
          {venue ? (
            <Fact icon={<MapPin className="size-[15px]" />} href={mapsUrl}>
              {venue}
            </Fact>
          ) : null}
        </div>
        {address ? (
          <p className="mt-2.5 text-[12.5px]" style={{ color: NOIR.muted }}>
            {address}
          </p>
        ) : null}
      </motion.div>
    </header>
  );
}

/** One line of the poster's fact list: a thin ringed icon, then the words in spaced capitals. */
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
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full border"
        style={{ borderColor: `${NOIR.cream}55`, color: NOIR.cream }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="text-[15px] font-semibold uppercase tracking-[0.16em]">
        {children}
      </span>
    </>
  );
  const common = "flex items-center gap-3";
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${common} ${styles.link} underline decoration-dotted underline-offset-[6px]`}
      style={{ color: NOIR.cream }}
    >
      {body}
    </a>
  ) : (
    <span className={common} style={{ color: NOIR.cream }}>
      {body}
    </span>
  );
}

/** The price as an admission ticket: a stub on the left, the amount on the right of the tear. */
function Ticket({ money }: { money: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.18 }}
      className={`${styles.ticket} mt-8 flex`}
      style={{ ["--tear" as string]: "50%" }}
    >
      <div className="flex w-[34%] flex-col items-center justify-center px-3 py-4 text-center">
        <span
          className="text-[9.5px] font-bold uppercase tracking-[0.3em]"
          style={{ color: NOIR.gold }}
        >
          Admit
        </span>
        <span
          className="text-[26px] leading-none"
          style={{ color: NOIR.redBright, fontFamily: NOIR.serif }}
        >
          ♠
        </span>
        <span
          className="text-[9.5px] font-bold uppercase tracking-[0.3em]"
          style={{ color: NOIR.gold }}
        >
          One
        </span>
      </div>
      <div
        className={`${styles.tear} flex flex-1 flex-col items-center justify-center px-4 py-4 text-center`}
      >
        <span
          className="text-[34px] font-black leading-none sm:text-[40px]"
          style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
        >
          {money}
        </span>
        <span
          className="mt-1.5 text-[11.5px] font-bold uppercase tracking-[0.2em]"
          style={{ color: NOIR.muted }}
        >
          per head · food included
        </span>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What somebody sees after signing up: their admission ticket.
 *
 * Built to be screenshotted, because that is what happens to it. It states what they need on the
 * night — when, where, who is on the list and what they paid — and claims a receipt was received,
 * not that the money was checked. The stamp is the one moment of flourish.
 */
function Confirmation({
  entry,
  money,
  whenLabel,
  venueName,
  venueAddress,
  mapsUrl,
  calendar,
}: {
  entry: MafiaSubmission;
  money: string;
  whenLabel: string;
  venueName: string;
  venueAddress: string;
  mapsUrl: string;
  calendar: string;
}) {
  const name = tidyName(entry.fullName);

  return (
    <div className="pt-8 text-center">
      <span
        className="inline-grid size-14 place-items-center rounded-full"
        style={{ background: `${NOIR.red}33`, color: NOIR.redBright }}
      >
        <CheckCircle2 className="size-7" />
      </span>
      <h1
        className="mt-4 text-[34px] font-bold leading-tight sm:text-[42px]"
        style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
      >
        You&rsquo;re in
      </h1>
      <p
        className="mt-1 text-[24px]"
        style={{ color: NOIR.soft, fontFamily: NOIR.script }}
      >
        Welcome to the family, {name.split(" ")[0]}.
      </p>

      <div
        className={`${styles.ticket} relative mt-7 text-left`}
        style={{ ["--tear" as string]: "76px" }}
      >
        <div className="flex h-[76px] items-center justify-between gap-3 px-5">
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.3em]"
              style={{ color: NOIR.gold }}
            >
              Admit one
            </p>
            <p
              className="text-[24px] font-black leading-none"
              style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
            >
              Mafia{" "}
              <span
                style={{
                  color: NOIR.redBright,
                  fontFamily: NOIR.brush,
                  fontWeight: 400,
                }}
              >
                Wars
              </span>
            </p>
          </div>
          <span
            className={`${styles.stamp} rounded-[6px] border-2 px-2.5 py-1 text-[12px] font-black uppercase tracking-[0.18em]`}
            style={{ color: NOIR.redBright, borderColor: NOIR.redBright }}
          >
            Confirmed
          </span>
        </div>

        <div
          className="border-t-2 border-dashed px-5 py-5"
          style={{ borderColor: "rgba(201,164,106,0.4)" }}
        >
          <dl className="space-y-3.5">
            <Row label="Name" value={`${name}, ${entry.age.trim()}`} />
            {whenLabel ? <Row label="When" value={whenLabel} /> : null}
            {venueName ? (
              <Row
                label="Where"
                value={
                  mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${styles.link} underline decoration-dotted underline-offset-4`}
                    >
                      {venueName}
                    </a>
                  ) : (
                    venueName
                  )
                }
              />
            ) : null}
            {venueAddress ? <Row label="Address" value={venueAddress} /> : null}
            <Row label="We will call" value={entry.phone.trim()} />
            <Row label="Paid online" value={money} />
          </dl>
        </div>
      </div>

      {calendar ? (
        <a
          href={calendar}
          target="_blank"
          rel="noreferrer"
          className={`${styles.choice} ${styles.link} mt-5 inline-flex items-center gap-2 rounded-[12px] border px-4 py-2.5 text-[14px] font-semibold`}
          style={{
            borderColor: NOIR.line,
            color: NOIR.cream,
            background: "rgba(20,14,11,0.6)",
          }}
        >
          <CalendarPlus className="size-4" style={{ color: NOIR.redBright }} />
          Add to my calendar
        </a>
      ) : null}

      <p
        className="mx-auto mt-5 max-w-[420px] text-[13.5px] leading-relaxed"
        style={{ color: NOIR.muted }}
      >
        We have your receipt and food is included. Screenshot this ticket. The
        organisers will be in touch on the number above if anything changes.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-5">
      <dt
        className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em]"
        style={{ color: NOIR.muted }}
      >
        {label}
      </dt>
      <dd
        className="min-w-0 text-right text-[15px] font-semibold"
        style={{ color: NOIR.cream }}
      >
        {value}
      </dd>
    </div>
  );
}
