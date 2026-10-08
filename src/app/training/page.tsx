"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, GraduationCap, MapPin, Wallet } from "lucide-react";

import { Card, EmptyState } from "@/components/ui";
import { TRAINING_FEE, contactFor } from "@/lib/domain/training";
import { readPublicEvent, type StoredEvent } from "@/lib/supabase/events";
import { uploadPaymentProof } from "@/lib/supabase/paymentProof";
import { saveTrainingSignup, TRAINING_EVENT_ID, TRAINING_SLUG } from "@/lib/supabase/training";

import { TrainingForm, type TrainingSubmission } from "./TrainingForm";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const BROWN = "#3E2F23";
const GOLD = "#C89B3C";

/**
 * The training signup page.
 *
 * A route of its own at /training, not an event page. Coaching is not a tournament: it has no
 * date to count down to, no rounds, no draw and no results, so it does not belong behind
 * /events/[slug] where every surrounding page assumes those exist.
 *
 * The details it shows — the fee, the venue, the session times, the bank account, the terms —
 * are read from the `training-sessions` event row rather than written here, so changing the
 * time of a session or the price of a block is an edit to one row and not a deploy.
 */
export default function TrainingPage() {
  const [event, setEvent] = React.useState<StoredEvent | null>(null);
  const [resolved, setResolved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<TrainingSubmission | null>(null);

  /*
   * A second tap, refused before React has re-rendered.
   *
   * `saving` is state, so two taps in the same tick both read it as false and both write a
   * signup — one trainee, two rows, the fee counted twice. A ref is written and read
   * synchronously, so the second tap sees the first.
   */
  const submitting = React.useRef(false);

  React.useEffect(() => {
    let live = true;
    void readPublicEvent(TRAINING_SLUG).then((stored) => {
      if (!live) return;
      setEvent(stored);
      setResolved(true);
    });
    return () => {
      live = false;
    };
  }, []);

  /*
   * The fee and the currency, read before anything uses them.
   *
   * Declared above `submit` rather than beside the render, because `submit` closes over both.
   * A `const` referenced above its own declaration is a dead page rather than a type error —
   * tsc and `next build` both pass, and the crash only appears when somebody loads the form.
   * That exact mistake took the registration form down once already.
   */
  const details = event?.details;
  const fee = details?.fee ?? TRAINING_FEE;
  const currency = details?.currency ?? "PKR";

  const submit = async (signup: TrainingSubmission) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);

    try {
      /*
       * The receipt goes up first. If it fails, nothing is written: a signup recorded as
       * paid-online with no proof attached is exactly the state the desk cannot resolve.
       */
      let proof = null;
      if (signup.payment === "online" && signup.proofFile) {
        const upload = await uploadPaymentProof({
          eventId: TRAINING_EVENT_ID,
          file: signup.proofFile,
        });
        if (!upload.ok) {
          setError(upload.message);
          return;
        }
        proof = upload.proof;
      }

      const saved = await saveTrainingSignup({
        organizationId: "org-federation",
        data: {
          fullName: signup.fullName,
          yearOfBirth: signup.yearOfBirth,
          age: signup.age,
          minor: signup.minor,
          phone: signup.phone,
          guardianName: signup.guardianName,
          guardianPhone: signup.guardianPhone,
          /* One answer for who to ring, worked out once. */
          contactPhone: contactFor(signup),
          preferredSlot: signup.preferredSlot,
          experience: signup.experience,
          payment: signup.payment,
          /*
           * The claim they made, never a verdict. The desk decides whether a payment is
           * received; the insert policy refuses anything stronger than these two values.
           */
          paymentStatus: signup.payment === "online" ? "receipt-uploaded" : "cash-at-venue",
          amountDue: fee,
          currency,
          ...(proof ? { paymentProof: proof } : {}),
          termsAccepted: signup.termsAccepted,
          signedUpAt: new Date().toISOString(),
        },
      });

      if (!saved.ok) {
        setError(saved.message);
        return;
      }

      setDone(signup);
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
            title="Training signups are not open"
            description="This link is not live yet. Please check with the coach."
          />
        </Card>
      </div>
    );
  }

  if (done) return <TrainingConfirmation signup={done} fee={fee} currency={currency} />;

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
          <span
            className="inline-grid size-12 place-items-center rounded-full"
            style={{ background: `${FOREST}1A`, color: FOREST }}
          >
            <GraduationCap className="size-6" />
          </span>

          <h1
            className="mt-3 text-[27px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[40px]"
            style={{ color: BROWN }}
          >
            {event.name}
          </h1>

          {event.subtitle ? (
            <p className="mt-1.5 text-[14px] font-semibold" style={{ color: FOREST }}>
              {event.subtitle}
            </p>
          ) : null}

          {/* The two facts somebody checks before deciding to fill this in. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            {[
              {
                icon: <Wallet className="size-3.5" />,
                text: `${currency} ${fee.toLocaleString("en-PK")} per person`,
              },
              ...(details?.venueName
                ? [{ icon: <MapPin className="size-3.5" />, text: details.venueName }]
                : []),
            ].map((item) => (
              <span
                key={item.text}
                className="flex items-center gap-1.5 text-[13px] font-semibold"
                style={{ color: BROWN }}
              >
                <span style={{ color: GOLD }}>{item.icon}</span>
                {item.text}
              </span>
            ))}
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="mt-6 rounded-[18px] border border-line bg-[rgb(var(--c-surface))] p-4 shadow-sm sm:p-6"
        >
          <TrainingForm
            fee={fee}
            currency={currency}
            slots={details?.slots ?? []}
            paymentInstructions={details?.paymentInstructions ?? ""}
            terms={details?.terms ?? ""}
            saving={saving}
            error={error}
            onSubmit={(signup) => void submit(signup)}
          />
        </motion.div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What a trainee sees after signing up.
 *
 * No player number and no check-in code, because neither exists for a lesson. What it states
 * is what somebody actually needs: that the place is recorded, what is owed, and who will be
 * in touch.
 */
function TrainingConfirmation({
  signup,
  fee,
  currency,
}: {
  signup: TrainingSubmission;
  fee: number;
  currency: string;
}) {
  const money = `${currency} ${fee.toLocaleString("en-PK")}`;

  return (
    <main className="min-h-dvh px-4 py-10 sm:py-16" style={{ background: CREAM }}>
      <div className="mx-auto w-full max-w-[560px] text-center">
        <span
          className="inline-grid size-14 place-items-center rounded-full"
          style={{ background: `${FOREST}1A`, color: FOREST }}
        >
          <CheckCircle2 className="size-7" />
        </span>

        <h1
          className="mt-4 text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]"
          style={{ color: BROWN }}
        >
          You&rsquo;re signed up
        </h1>

        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: `${BROWN}CC` }}>
          Thank you, {signup.fullName.split(" ")[0]}. Your place in the training sessions is
          recorded.
        </p>

        <div className="mt-6 space-y-3 rounded-[18px] border border-line bg-[rgb(var(--c-surface))] p-4 text-left sm:p-5">
          <Line label="Trainee" value={signup.fullName} />
          {signup.age ? <Line label="Age" value={`${signup.age} years`} /> : null}
          {signup.guardianName ? <Line label="Parent" value={signup.guardianName} /> : null}
          {signup.preferredSlot ? <Line label="Sessions" value={signup.preferredSlot} /> : null}
          <Line label="We will call" value={contactFor(signup)} />
          <Line
            label={signup.payment === "online" ? "Paid online" : "To pay at the first session"}
            value={money}
          />
        </div>

        <p className="mt-5 text-[13.5px] leading-relaxed" style={{ color: `${BROWN}AA` }}>
          {signup.payment === "online"
            ? "We have your receipt and will confirm it shortly."
            : "Please bring the fee to your first session."}{" "}
          The coach will be in touch on the number above with the exact timings.
        </p>
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="min-w-0 text-right text-[14.5px] font-semibold text-ink">{value}</span>
    </div>
  );
}
