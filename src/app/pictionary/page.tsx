"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Trophy,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { Card, EmptyState } from "@/components/ui";
import { eventTimeLine } from "@/lib/domain/eventTime";
import {
  AGE_MAX,
  AGE_MIN,
  INDIVIDUAL_FEE,
  MAX_PLAYERS,
  TEAM_FEE,
  entryTotal,
  spotsLeft,
  type PictionaryRules,
} from "@/lib/domain/pictionary";
import { readPublicEvent, type StoredEvent } from "@/lib/supabase/events";
import { uploadPaymentProof } from "@/lib/supabase/paymentProof";
import {
  PICTIONARY_EVENT_ID,
  PICTIONARY_SLUG,
  countSpotsTaken,
  saveEntry,
} from "@/lib/supabase/pictionary";
import { formatDate } from "@/lib/utils";

import { PictionaryForm, type PictionarySubmission } from "./PictionaryForm";

/* The poster's own colours, for the title and the small marks. The page is cream like it. */
const CREAM = "#FCF3DC";
const BROWN = "#3E2F23";
const BLUE = "#3F78AE";
const ORANGE = "#CC5A3E";
const YELLOW = "#E0A32A";
const GREEN = "#5E8A4A";
const TITLE_COLOURS = [
  BLUE,
  ORANGE,
  YELLOW,
  GREEN,
  ORANGE,
  YELLOW,
  GREEN,
  BLUE,
  ORANGE,
  YELLOW,
];

/**
 * The Speed Pictionary page.
 *
 * Its own route, not an event page: a team has no Scrabble category, rating or player number,
 * and everything under /events/[slug] assumes it does. Teams are stored apart from the
 * tournament's registrations (see `0094_pictionary_teams.sql`), so a team can never be seated
 * at a Scrabble board.
 *
 * What it states — the date, the fee, the venue, the prizes, the bank account — is read from
 * the event row, so changing any of it is an edit to one row and not a deploy.
 */
export default function PictionaryPage() {
  const [event, setEvent] = React.useState<StoredEvent | null>(null);
  const [resolved, setResolved] = React.useState(false);
  const [taken, setTaken] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<PictionarySubmission | null>(null);
  /* Set when the database says the last place has gone, whatever the count said earlier. */
  const [soldOut, setSoldOut] = React.useState(false);

  /* A second tap, refused before React re-renders; state would let both through. */
  const submitting = React.useRef(false);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const [stored, count] = await Promise.all([
        readPublicEvent(PICTIONARY_SLUG),
        countSpotsTaken(),
      ]);
      if (!live) return;
      setEvent(stored);
      setTaken(count);
      setResolved(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  /* Declared before `submit`, which closes over all of them. */
  const details = event?.details;
  const currency = details?.currency ?? "PKR";
  const individualFee = details?.individualFee ?? INDIVIDUAL_FEE;
  const teamFee = details?.teamFee ?? TEAM_FEE;
  const ageMin = details?.ageMin ?? AGE_MIN;
  const ageMax = details?.ageMax ?? AGE_MAX;
  const maxPlayers = details?.maxPlayers ?? MAX_PLAYERS;
  const terms = details?.terms ?? "";
  const rules: PictionaryRules = {
    individualFee,
    teamFee,
    ageMin,
    ageMax,
    termsOffered: terms.trim() !== "",
  };
  const dateLabel = details?.startDate ? formatDate(details.startDate) : "";
  const timeLabel = eventTimeLine(details?.startTime, details?.endTime);
  const left = spotsLeft(taken, maxPlayers);
  const full = soldOut || left === 0;

  const submit = async (entry: PictionarySubmission) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);

    try {
      /*
       * The count again, before any money moves. The page may have been open for an hour, and
       * somebody who has transferred their fee must not be told it is too late.
       */
      const now = await countSpotsTaken();
      if (now !== null) {
        setTaken(now);
        const needed = entry.players.length;
        if (now >= maxPlayers) {
          setSoldOut(true);
          return;
        }
        if (now + needed > maxPlayers) {
          setError(
            "Only one spot is left, which is not enough for a team of two. Please sign up as an individual.",
          );
          return;
        }
      }

      /* The receipt goes up first: if it fails nothing is written. */
      let proof = null;
      if (entry.proofFile) {
        const upload = await uploadPaymentProof({
          eventId: PICTIONARY_EVENT_ID,
          file: entry.proofFile,
        });
        if (!upload.ok) {
          setError(upload.message);
          return;
        }
        proof = upload.proof;
      }

      const players = entry.players.map((p) => p.name);
      const saved = await saveEntry({
        organizationId: "org-federation",
        data: {
          entryType: entry.type,
          players,
          ages: entry.players.map((p) => Number(p.age)),
          playerCount: players.length,
          contactName: players[0],
          phone: entry.phone,
          email: entry.email,
          payment: entry.payment,
          /*
           * The claim they made, never a verdict. The database decides whether a stored
           * receipt counts as paid; the insert policy refuses anything stronger than these.
           */
          paymentStatus:
            entry.payment === "online" ? "receipt-uploaded" : "cash-at-venue",
          amountDue: entryTotal(entry.type, rules),
          currency,
          ...(proof ? { paymentProof: proof } : {}),
          termsAccepted: entry.termsAccepted,
          signedUpAt: new Date().toISOString(),
        },
      });

      if (!saved.ok) {
        if (saved.full) setSoldOut(true);
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
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState title="Opening the form" description="One moment." />
        </Card>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState
            title="Registration is not open"
            description="This link is not live yet. Please check with the organisers."
          />
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <Confirmation
        entry={done}
        total={entryTotal(done.type, rules)}
        currency={currency}
        whenLabel={[dateLabel, timeLabel].filter(Boolean).join(" · ")}
        venueName={details?.venueName ?? ""}
        venueAddress={details?.venueAddress ?? ""}
        mapsUrl={details?.mapsUrl ?? ""}
      />
    );
  }

  const prizes = details?.prizes ?? [];

  return (
    <main
      className="relative min-h-dvh px-4 py-8 sm:py-12"
      style={{ background: CREAM }}
    >
      <div className="relative mx-auto w-full max-w-[600px]">
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <p
            className="text-[12px] font-bold uppercase tracking-[0.22em]"
            style={{ color: `${BROWN}B3` }}
          >
            Blufy&rsquo;s Alphabattle presents
          </p>

          {/* The poster's lettering, one colour a letter, with the real name for a screen reader. */}
          <h1
            className="mt-2 text-[44px] font-black leading-none tracking-[-0.03em] sm:text-[68px]"
            aria-label="Speed Pictionary"
          >
            <span aria-hidden>
              {"PICTIONARY".split("").map((ch, i) => (
                <span
                  key={i}
                  style={{ color: TITLE_COLOURS[i % TITLE_COLOURS.length] }}
                >
                  {ch}
                </span>
              ))}
            </span>
          </h1>
          <p
            className="mt-1 text-[13px] font-extrabold uppercase tracking-[0.32em]"
            style={{ color: BROWN }}
          >
            Speed round
          </p>

          {event.subtitle ? (
            <p
              className="mt-3 text-[16px] italic leading-snug"
              style={{ color: `${BROWN}CC` }}
            >
              {event.subtitle}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            {[
              ...(dateLabel
                ? [
                    {
                      icon: <CalendarDays className="size-3.5" />,
                      text: dateLabel,
                    },
                  ]
                : []),
              ...(timeLabel
                ? [{ icon: <Clock className="size-3.5" />, text: timeLabel }]
                : []),
              ...(details?.venueName
                ? [
                    {
                      icon: <MapPin className="size-3.5" />,
                      text: details.venueName,
                      href: details.mapsUrl,
                    },
                  ]
                : []),
            ].map((item) => {
              const body = (
                <>
                  <span style={{ color: ORANGE }}>{item.icon}</span>
                  {item.text}
                </>
              );
              const href = "href" in item ? item.href : undefined;
              return href ? (
                <a
                  key={item.text}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[13.5px] font-semibold underline decoration-dotted underline-offset-4"
                  style={{ color: BROWN }}
                >
                  {body}
                </a>
              ) : (
                <span
                  key={item.text}
                  className="flex items-center gap-1.5 text-[13.5px] font-semibold"
                  style={{ color: BROWN }}
                >
                  {body}
                </span>
              );
            })}
          </div>
          {details?.venueAddress ? (
            <p
              className="mt-1.5 text-[12.5px] leading-relaxed"
              style={{ color: `${BROWN}AA` }}
            >
              {details.venueAddress}
            </p>
          ) : null}
        </motion.header>

        {/* ---- What it is, in the order somebody decides --------------------- */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06 }}
          className="mt-6 grid gap-3 sm:grid-cols-2"
        >
          <InfoCard
            colour={BLUE}
            icon={<Users className="size-4" />}
            title="Who can play"
            lines={[
              `Ages ${ageMin} to ${ageMax}`,
              "Sign up alone or with a partner",
              "Round 1, semi-finals, then the final",
            ]}
          />
          <InfoCard
            colour={YELLOW}
            icon={<Trophy className="size-4" />}
            title="Cash prize"
            lines={prizes.map((p) => `${p.place}: ${p.award}`)}
          />
          <InfoCard
            colour={GREEN}
            icon={<UtensilsCrossed className="size-4" />}
            title="Lunch included"
            lines={[
              `Individual: ${currency} ${individualFee.toLocaleString("en-PK")} per person`,
              `Team of 2: ${currency} ${teamFee.toLocaleString("en-PK")} for both`,
            ]}
            wide
          />
        </motion.section>

        {/* ---- Spots ------------------------------------------------------- */}
        {left !== null ? (
          <p
            className="mt-4 text-center text-[13.5px] font-bold"
            style={{ color: full ? ORANGE : BROWN }}
          >
            {full
              ? "All spots are taken"
              : left === 1
                ? "Only 1 spot left"
                : `Limited spots: ${left} of ${maxPlayers} left`}
          </p>
        ) : null}

        {full ? (
          <div className="mt-4 rounded-[18px] border border-line bg-[rgb(var(--c-surface))] p-5 text-center shadow-sm">
            <p className="text-[16px] font-bold text-ink">
              Registration is full
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              Every spot has been taken. Please check with the organisers about
              a waiting list.
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-4 rounded-[18px] border border-line bg-[rgb(var(--c-surface))] p-4 shadow-sm sm:p-6"
          >
            <PictionaryForm
              rules={rules}
              currency={currency}
              spotsLeft={left}
              paymentInstructions={details?.paymentInstructions ?? ""}
              terms={terms}
              saving={saving}
              error={error}
              onSubmit={(entry) => void submit(entry)}
            />
          </motion.div>
        )}
      </div>
    </main>
  );
}

function InfoCard({
  colour,
  icon,
  title,
  lines,
  wide,
}: {
  colour: string;
  icon: React.ReactNode;
  title: string;
  lines: string[];
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-[16px] border bg-white/70 p-4 ${wide ? "sm:col-span-2" : ""}`}
      style={{ borderColor: `${colour}55` }}
    >
      <p
        className="flex items-center gap-2 text-[14px] font-extrabold"
        style={{ color: BROWN }}
      >
        <span
          className="grid size-7 place-items-center rounded-full text-white"
          style={{ background: colour }}
        >
          {icon}
        </span>
        {title}
      </p>
      <ul
        className="mt-2 space-y-1 text-[13.5px] leading-snug"
        style={{ color: `${BROWN}CC` }}
      >
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What a team sees after registering.
 *
 * No player number or check-in code, because neither exists for a team. What it states is what
 * somebody screenshots and comes back to: that the place is recorded, what is owed, when and
 * where. It claims a receipt was received, not that the money was checked.
 */
function Confirmation({
  entry,
  total,
  currency,
  whenLabel,
  venueName,
  venueAddress,
  mapsUrl,
}: {
  entry: PictionarySubmission;
  total: number;
  currency: string;
  whenLabel: string;
  venueName: string;
  venueAddress: string;
  mapsUrl: string;
}) {
  const money = `${currency} ${total.toLocaleString("en-PK")}`;
  const first = entry.players[0]?.name.split(" ")[0] ?? "";

  return (
    <main
      className="min-h-dvh px-4 py-10 sm:py-16"
      style={{ background: CREAM }}
    >
      <div className="mx-auto w-full max-w-[560px] text-center">
        <span
          className="inline-grid size-14 place-items-center rounded-full"
          style={{ background: `${GREEN}22`, color: GREEN }}
        >
          <CheckCircle2 className="size-7" />
        </span>

        <h1
          className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]"
          style={{ color: BROWN }}
        >
          {entry.type === "team" ? "Your team is in" : "You\u2019re in"}
        </h1>
        <p
          className="mt-2 text-[15px] leading-relaxed"
          style={{ color: `${BROWN}CC` }}
        >
          Thank you, {first}. Your {entry.type === "team" ? "places" : "place"}{" "}
          in Speed Pictionary {entry.type === "team" ? "are" : "is"} recorded.
        </p>

        <div className="mt-6 space-y-3 rounded-[18px] border border-line bg-[rgb(var(--c-surface))] p-4 text-left sm:p-5">
          <Line
            label="Signed up"
            value={entry.type === "team" ? "Team of 2" : "Individual"}
          />
          <Line
            label={entry.players.length > 1 ? "Players" : "Player"}
            value={entry.players.map((p) => `${p.name} (${p.age})`).join(", ")}
          />
          {whenLabel ? <Line label="When" value={whenLabel} /> : null}
          {venueName ? (
            <Line
              label="Where"
              value={
                mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-4"
                  >
                    {venueName}
                  </a>
                ) : (
                  venueName
                )
              }
            />
          ) : null}
          {venueAddress ? <Line label="Address" value={venueAddress} /> : null}
          <Line label="We will call" value={entry.phone.trim()} />
          <Line label="Email" value={entry.email.trim()} />
          <Line
            label={
              entry.payment === "online" ? "Paid online" : "To pay at the desk"
            }
            value={money}
          />
        </div>

        <p
          className="mt-5 text-[13.5px] leading-relaxed"
          style={{ color: `${BROWN}AA` }}
        >
          {entry.payment === "online"
            ? "We have your receipt. Lunch is included. The organisers will be in touch on the number above if anything changes."
            : `Please bring ${money} in cash and pay at the desk when you arrive. Lunch is included. Your spot is held until then.`}
        </p>
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="min-w-0 text-right text-[14.5px] font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}
