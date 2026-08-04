"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Search, TicketCheck } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input } from "@/components/ui";
import {
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { useLiveStore } from "@/lib/store/useLiveStore";
import { arrivalInstruction } from "@/lib/domain/gameOn";
import { ParticipationTrack, TRACK_LABEL } from "@/lib/firebase/schema";
import { formatDate } from "@/lib/utils";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const BROWN = "#3E2F23";

/**
 * Venue check-in.
 *
 * Reached by scanning the QR on the venue display. No app, no account, no
 * password: a participant identifies themselves with the email or phone they
 * registered with, confirms it is them, and is checked in.
 *
 * Deliberately asks for confirmation before recording anything. A mistyped
 * digit that silently checks in the wrong person leaves one participant marked
 * present who is not, and another unable to check in at all.
 */
export default function CheckInPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const live = useLiveStore();

  const event = selectEventBySlug(store, slug);
  const registrations = event ? selectRegistrations(store, event.id) : [];

  const [query, setQuery] = React.useState("");
  const [candidateId, setCandidateId] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [checkedInId, setCheckedInId] = React.useState<string | null>(null);

  if (!event) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20">
        <Card>
          <EmptyState title="Event not found" description="Check the link, or ask a volunteer." />
        </Card>
      </div>
    );
  }

  const find = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    const digits = q.replace(/\D/g, "");
    const match = registrations.find(
      (r) =>
        r.email.trim().toLowerCase() === q ||
        r.token.toLowerCase() === q ||
        // Match on the last nine digits so a number typed with or without the
        // country code finds the same person.
        (digits.length >= 9 && r.mobile.replace(/\D/g, "").endsWith(digits.slice(-9))),
    );

    if (!match) {
      setNotFound(true);
      setCandidateId(null);
      return;
    }
    setNotFound(false);
    setCandidateId(match.id);
  };

  const candidate = registrations.find((r) => r.id === candidateId);
  const done = registrations.find((r) => r.id === checkedInId);

  /* ---- Checked in ---------------------------------------------------- */

  if (done) {
    const track = (done.participationTrack ?? "speed_scrabble") as ParticipationTrack;
    return (
      <main className="min-h-dvh px-4 py-16" style={{ background: CREAM }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto w-full max-w-[440px] text-center"
        >
          <span
            className="inline-grid size-16 place-items-center rounded-full"
            style={{ background: `${FOREST}1A`, color: FOREST }}
          >
            <CheckCircle2 className="size-8" />
          </span>

          <h1 className="mt-4 text-[28px] font-extrabold" style={{ color: BROWN }}>
            You&apos;re checked in
          </h1>
          <p className="mt-1 text-[15px]" style={{ color: FOREST }}>
            Welcome to {event.name}
          </p>

          <Card className="mt-6">
            <div className="p-5 text-left">
              <p className="text-[16px] font-bold text-ink">{done.fullName}</p>
              <Badge tone="info" className="mt-1.5">
                {TRACK_LABEL[track]}
              </Badge>

              <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
                {arrivalInstruction(track)}
              </p>
            </div>
          </Card>

          <p className="mt-4 text-[12px]" style={{ color: `${BROWN}88` }}>
            Keep this page open, or scan the venue code again at any time.
          </p>
        </motion.div>
      </main>
    );
  }

  /* ---- Confirm identity ------------------------------------------------ */

  if (candidate) {
    const track = (candidate.participationTrack ?? "speed_scrabble") as ParticipationTrack;
    const alreadyIn = live.isCheckedIn(event.id, candidate.id);

    return (
      <main className="min-h-dvh px-4 py-16" style={{ background: CREAM }}>
        <div className="mx-auto w-full max-w-[440px]">
          <h1 className="text-center text-[22px] font-extrabold" style={{ color: BROWN }}>
            Is this you?
          </h1>

          <Card className="mt-5">
            <div className="p-5">
              <p className="text-[18px] font-bold text-ink">{candidate.fullName}</p>

              <dl className="mt-3 space-y-1.5">
                {[
                  ["Joining", TRACK_LABEL[track]],
                  [
                    "Payment",
                    candidate.paymentStatus === "verified" ? "Verified" : "Not yet verified",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-[12.5px] text-muted">{label}</dt>
                    <dd className="text-right text-[13px] font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>

              {/*
               * An unverified payment is stated but never blocks entry. Someone
               * who has travelled to the venue should be let in and settled with
               * at the desk, not turned away by software.
               */}
              {candidate.paymentStatus !== "verified" ? (
                <p className="mt-3 rounded-control bg-warning-050 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#a76d16]">
                  Your payment is not verified yet. You can still check in — please see the
                  welcome desk.
                </p>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-line p-4">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setCandidateId(null);
                  setQuery("");
                }}
              >
                Not me
              </Button>
              <Button
                variant="primary"
                className="flex-1 border-0"
                style={{ background: FOREST, color: "white" }}
                disabled={alreadyIn}
                onClick={() => {
                  live.checkIn(event.id, candidate.id);
                  setCheckedInId(candidate.id);
                }}
              >
                {alreadyIn ? "Already checked in" : "Check me in"}
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  /* ---- Identify -------------------------------------------------------- */

  return (
    <main className="min-h-dvh px-4 py-16" style={{ background: CREAM }}>
      <div className="mx-auto w-full max-w-[440px]">
        <div className="text-center">
          <span
            className="inline-grid size-12 place-items-center rounded-full"
            style={{ background: `${FOREST}1A`, color: FOREST }}
          >
            <TicketCheck className="size-6" />
          </span>
          <h1 className="mt-3 text-[24px] font-extrabold" style={{ color: BROWN }}>
            Check in
          </h1>
          <p className="mt-1 text-[13.5px]" style={{ color: FOREST }}>
            {event.name} · {formatDate(event.startDate)}
          </p>
        </div>

        <Card className="mt-6">
          <div className="space-y-3 p-5">
            <Field
              label="Email or mobile number"
              error={notFound ? "We could not find that. Try the other one, or ask a volunteer." : undefined}
              hint="Whatever you used to register."
            >
              <Input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setNotFound(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && find()}
                placeholder="you@example.com"
                invalid={notFound}
              />
            </Field>

            <Button
              variant="primary"
              size="lg"
              className="w-full border-0"
              style={{ background: FOREST, color: "white" }}
              icon={<Search className="size-4" />}
              onClick={find}
            >
              Find my registration
            </Button>

            <p className="text-center text-[11.5px] leading-relaxed" style={{ color: `${BROWN}88` }}>
              No app or account needed. A volunteer at the welcome desk can check you in if this
              does not find you.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
