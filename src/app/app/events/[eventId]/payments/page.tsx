"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Check,
  FileWarning,
  Info,
  Receipt,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Stat,
  Textarea,
} from "@/components/ui";
import { useEventStore } from "@/lib/store/useEventStore";
import { useStore } from "@/lib/store/useStore";
import { RosterGate } from "@/components/organizer/RosterGate";
import {
  answer,
  decidePayment,
  field,
  importField,
  numberField,
  type PaymentDecision,
} from "@/lib/supabase/organizer";
import { useRoster } from "@/lib/supabase/useRoster";
import {
  BUCKET_LABEL,
  bucketFor,
  bucketTotals,
  type PaymentBucket,
} from "@/lib/domain/paymentBuckets";
import { PAYMENT_METHOD_LABEL } from "@/lib/domain/identity";
import { activeEvent } from "@/lib/domain/scope";
import {
  Flag,
  PAYMENT_STATUS_LABEL,
  PaymentStatus,
  paymentTotals,
  QueueEntry,
  ReceiptSubmission,
  rejectPayment,
  reviewQueue,
  verifyPayment as decideVerification,
} from "@/lib/engine/payments";
import { money } from "@/lib/engine/finance";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "critical" | "info"> = {
  verified: "success",
  complimentary: "success",
  "receipt-uploaded": "warning",
  processing: "warning",
  "review-required": "warning",
  "partially-paid": "warning",
  "amount-mismatch": "critical",
  "duplicate-transaction": "critical",
  "invalid-receipt": "critical",
  rejected: "critical",
  "not-submitted": "neutral",
  refunded: "info",
};

/**
 * Payment receipt review.
 *
 * A receipt is a claim, not a payment. The screen is arranged around that:
 * values read from an image are labelled as such, problems are named
 * specifically enough to act on, and verifying is a decision a named person
 * takes and signs.
 */
export default function PaymentsPage() {
  const params = useParams<{ eventId: string }>();
  const store = useEventStore();
  const app = useStore();

  const [reviewing, setReviewing] = React.useState<QueueEntry | null>(null);

  /*
   * Which money bucket the list is narrowed to. Pressing a tile filters to it and pressing
   * it again clears — the tiles are the filter, so there is no second row of controls
   * saying the same thing.
   */
  const [bucket, setBucket] = React.useState<PaymentBucket | "all">("all");

  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId: params.eventId,
  });

  /*
   * Registrations come from the database. This screen read browser storage, so it
   * showed an empty queue and zero received however much money had come in — the
   * receipts are attached to rows in Postgres.
   *
   * Called before the `event` guard below: a hook must run on every render, and the
   * event id is only used to scope the read.
   */
  const roster = useRoster(params.eventId);
  const registrations = roster.registrations;

  if (!event) return null;

  /*
   * Map registrations into the shape the review engine expects. Only fields
   * genuinely captured at upload are populated — an absent field flags as
   * unreadable rather than being invented here.
   */
  const submissions: ReceiptSubmission[] = registrations.map((r) => {
    const receipt = field(r, "receiptFileName");
    return {
      registrationId: r.id,
      eventId: event.id,
      participantName: r.fullName,
      amountDue: r.amountDue,
      currency: r.currency,
      fileName: receipt,
      status: r.paymentStatus as PaymentStatus,
      submittedAt: r.submittedAt,
      extract: receipt
        ? {
            transactionId: field(r, "paymentReference"),
            /*
             * The file name stands in for a content hash. Hashing the bytes is what
             * would catch a re-encoded screenshot that a name comparison misses, and
             * needs the upload to be stored rather than just named.
             */
            imageHash: receipt,
            method: field(r, "paymentMethod"),
          }
        : undefined,
    };
  });

  /*
   * Derived from the stored payment state and amount, not held as its own field. A separate
   * "bucket" column would be one more thing to keep in step with the payment it describes.
   */
  const bucketSources = registrations.map((r) => ({
    paymentStatus: r.paymentStatus,
    /*
     * Read from the raw document, because the mapped `amountDue` turns a missing value into
     * 0 — and "nothing owed" is a different fact from "nobody has worked it out yet".
     */
    amountDue: numberField(r, "amountDue"),
  }));

  const buckets = bucketTotals(bucketSources);

  const inBucket = (r: (typeof registrations)[number]) =>
    bucket === "all" ||
    bucketFor({
      paymentStatus: r.paymentStatus,
      amountDue: numberField(r, "amountDue"),
    }) === bucket;

  const entryList = registrations.filter(inBucket);

  const totals = paymentTotals(submissions);
  const queue = reviewQueue(submissions, {
    now: new Date().toISOString(),
    expectedReceiver: event.bankDetails || undefined,
  });

  /*
   * A claimed discount is not a verified one. The claim is shown so somebody checks
   * the number, but it counts as revenue only once the payment is verified.
   */
  const discountClaims = registrations.filter((r) => answer(r, "membershipNumber"));

  const settled = submissions.filter(
    (s) => s.status === "verified" || s.status === "rejected" || s.status === "complimentary",
  );

  const decide = async (
    entry: QueueEntry,
    action: "verify" | "reject",
    note: string,
    override: boolean,
  ) => {
    const reviewer = app.currentUser?.name ?? roster.signedInAs ?? "Director";

    /*
     * The engine decides whether the decision is allowed — an override without a
     * reason, a blocker not acknowledged — before anything is written. Its refusal
     * is the useful message, so it is shown rather than replaced.
     */
    const result =
      action === "verify"
        ? decideVerification(entry.assessment, reviewer, note, { override })
        : rejectPayment(reviewer, note);

    if (!result.ok || !result.decision) {
      app.toast({
        title: "Cannot record that decision",
        description: result.reason ?? "Something was missing.",
        tone: "warning",
      });
      return;
    }

    const written = await decidePayment({
      recordId: entry.submission.registrationId,
      status: result.decision.status as PaymentDecision,
      by: reviewer,
      note: result.decision.note,
    });

    if (!written.ok) {
      app.toast({
        title: "Not saved",
        description: written.message ?? "The decision was not recorded.",
        tone: "critical",
      });
      return;
    }

    roster.reload();
    app.toast({
      title: result.decision.status === "verified" ? "Payment verified" : "Receipt rejected",
      description: `${entry.submission.participantName} — recorded against ${reviewer}.`,
      tone: result.decision.status === "verified" ? "success" : "info",
    });
    setReviewing(null);
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="A receipt is a claim. Only a verified payment counts as money received."
      />

      {/*
        * Everything below reads registrations, so an empty queue means one of two
        * very different things: nothing to review, or nothing readable. "No receipts
        * waiting" on the morning money is due would be read as the first.
        */}
      <RosterGate access={roster.access} loaded={roster.loaded}>

      {/*
        Where the money stands, separated.
        
        The entry list mixes people who have paid online, people bringing cash to the door,
        amounts nobody has confirmed, two on a promotion, and one whose amount has never been
        established. One total across those would report every rupee recorded as money in hand,
        which for this event overstates it by nearly double.
      */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {buckets.map((b) => (
          <button
            key={b.bucket}
            type="button"
            onClick={() => setBucket(bucket === b.bucket ? "all" : b.bucket)}
            className={cn(
              "rounded-feature text-left transition-shadow",
              bucket === b.bucket ? "ring-2 ring-primary-400" : "",
            )}
            aria-pressed={bucket === b.bucket}
            title={`Show only ${b.label.toLowerCase()}`}
          >
            <Stat
              label={b.label}
              value={b.people}
              sub={
                b.bucket === "unknown"
                  ? b.people
                    ? "no amount established"
                    : "none"
                  : money(b.amount, event.currency)
              }
              tone={
                b.bucket === "paid"
                  ? "success"
                  : b.bucket === "promo"
                    ? "primary"
                    : b.people
                      ? "warning"
                      : "neutral"
              }
            />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Received"
          value={money(totals.received, event.currency)}
          sub="verified payments only"
          icon={<Banknote className="size-5" />}
          tone="success"
        />
        <Stat
          label="Claimed"
          value={money(totals.claimed, event.currency)}
          sub="uploaded, not yet verified"
          icon={<Receipt className="size-5" />}
          tone="warning"
        />
        <Stat
          label="Awaiting review"
          value={totals.awaitingReview}
          sub={totals.blocked ? `${totals.blocked} with problems` : "none blocked"}
          icon={<FileWarning className="size-5" />}
          tone={totals.awaitingReview ? "warning" : "success"}
        />
        <Stat
          label="Not submitted"
          value={money(totals.outstanding, event.currency)}
          sub="no receipt uploaded"
          icon={<AlertTriangle className="size-5" />}
          tone={totals.outstanding ? "warning" : "success"}
        />
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-feature bg-[rgb(var(--c-surface-soft))] px-4 py-3">
        <Info className="mt-0.5 size-4.5 shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          Values read from a receipt image are shown to save you typing. They are not proof that a
          transfer happened — check the amount and the receiving account before verifying. Only a
          payment provider confirming the transaction directly could do that automatically.
        </p>
      </div>

      {/* Entry list by payment --------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader
          title="Every entrant, by payment"
          subtitle={
            bucket === "all"
              ? `${entryList.length} registered`
              : `${entryList.length} in ${BUCKET_LABEL[bucket].toLowerCase()} — press the tile again to clear`
          }
          action={
            bucket === "all" ? null : (
              <Button variant="secondary" onClick={() => setBucket("all")}>
                Show all
              </Button>
            )
          }
        />
        <div className="space-y-2 px-4 pb-4">
          {entryList.length === 0 ? (
            <EmptyState
              title="Nobody in this group"
              description="Press the tile again, or Show all, to see the whole entry list."
            />
          ) : (
            entryList.map((r) => {
              const amount = numberField(r, "amountDue");
              const pricing = importField(r, "pricingType");
              /*
               * The stored method is a code from the form ("cash") or a phrase from the Excel
               * import ("Cash at Venue"). Both are shown as the same words, so one entry list
               * does not read as two different systems.
               */
              const stored = field(r, "paymentMethod");
              const method =
                stored && stored in PAYMENT_METHOD_LABEL
                  ? PAYMENT_METHOD_LABEL[stored as keyof typeof PAYMENT_METHOD_LABEL]
                  : stored;
              const state = bucketFor({ paymentStatus: r.paymentStatus, amountDue: amount });

              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-feature border border-line bg-[rgb(var(--c-surface-soft))] p-3.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {r.fullName}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {[pricing, method].filter(Boolean).join(" · ") || "No pricing recorded"}
                    </span>
                  </span>

                  {/*
                    An amount nobody has established says so. Rendering it as PKR 0 would
                    claim this person owes nothing, which is the one thing we do not know.
                  */}
                  <span className="num shrink-0 text-[12.5px] text-muted">
                    {amount === null ? "Amount not set" : money(amount, event.currency)}
                  </span>

                  <Badge
                    tone={
                      state === "paid"
                        ? "success"
                        : state === "promo"
                          ? "primary"
                          : state === "unknown"
                            ? "critical"
                            : "warning"
                    }
                  >
                    {BUCKET_LABEL[state]}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Discount claims --------------------------------------------------- */}
      {discountClaims.length ? (
        <Card className="mt-4">
          <CardHeader
            title="Discount claims"
            subtitle={`${discountClaims.length} participant${discountClaims.length === 1 ? "" : "s"} claimed a reduced fee`}
          />
          <div className="space-y-2 px-4 pb-4">
            {discountClaims.slice(0, 20).map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-feature border border-line bg-[rgb(var(--c-surface-soft))] p-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {r.fullName}
                  </span>
                  <span className="num block truncate text-[11.5px] text-muted">
                    Membership {answer(r, "membershipNumber")}
                  </span>
                </span>

                <span className="num shrink-0 text-[12.5px] text-muted">
                  {money(r.amountDue, event.currency)}
                </span>

                <Badge tone={r.paymentStatus === "verified" ? "success" : "warning"}>
                  {r.paymentStatus === "verified" ? "Settled" : "To check"}
                </Badge>
              </div>
            ))}
          </div>

          <p className="px-5 pb-5 text-[11.5px] leading-relaxed text-faint">
            {/*
              * Read-only on purpose. There used to be Verify and Reject buttons here
              * that wrote a separate "membership approved" state to browser storage,
              * which meant a membership could read as verified while the money had
              * never been checked. Verifying the payment below is the decision that
              * settles both, and it is the one recorded against a named reviewer.
              */}
            Check the number against the membership list, then verify the payment below. The
            reduced fee is not counted as received until that decision is made.
          </p>
        </Card>
      ) : null}

      {/* Review queue ------------------------------------------------------ */}
      <Card className="mt-4">
        <CardHeader
          title="Needs review"
          subtitle={
            queue.length
              ? `${queue.length} receipt${queue.length === 1 ? "" : "s"}, most urgent first`
              : "Nothing waiting"
          }
        />
        {queue.length ? (
          <div className="space-y-2 px-4 pb-4">
            {queue.map((entry) => (
              <button
                key={entry.submission.registrationId}
                onClick={() => setReviewing(entry)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-feature border p-4 text-left transition-colors",
                  entry.assessment.blockers.length
                    ? "border-critical bg-critical-050/50 hover:bg-critical-050"
                    : "border-line bg-[rgb(var(--c-surface-soft))] hover:bg-[rgb(var(--c-surface-strong))]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-ink">
                      {entry.submission.participantName}
                    </span>
                    <Badge tone={STATUS_TONE[entry.submission.status] ?? "neutral"}>
                      {PAYMENT_STATUS_LABEL[entry.submission.status]}
                    </Badge>
                  </span>

                  <span className="mt-0.5 block text-[12px] text-muted">
                    {money(entry.submission.amountDue, entry.submission.currency)} due ·{" "}
                    {entry.submission.fileName ?? "no receipt"} ·{" "}
                    {formatDateTime(entry.submission.submittedAt)}
                  </span>

                  {entry.assessment.flags.length ? (
                    <span className="mt-2 block space-y-1">
                      {entry.assessment.flags.map((flag, i) => (
                        <FlagLine key={i} flag={flag} />
                      ))}
                    </span>
                  ) : (
                    <span className="mt-2 block text-[12px] text-[#12855c]">
                      Nothing flagged. Check the amount and account, then verify.
                    </span>
                  )}
                </span>

                <span className="shrink-0 text-[12.5px] font-semibold text-primary">Review</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Check className="size-5" />}
            title="No receipts waiting"
            description="Every submitted receipt has been reviewed."
          />
        )}
      </Card>

      {/* Settled ----------------------------------------------------------- */}
      {settled.length ? (
        <Card className="mt-4">
          <CardHeader title="Settled" subtitle={`${settled.length} decided`} />
          <div className="space-y-1 px-4 pb-4">
            {settled.slice(0, 30).map((s) => (
              <div
                key={s.registrationId}
                className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {s.participantName}
                </span>
                <span className="num shrink-0 text-[12.5px] text-muted">
                  {money(s.amountDue, s.currency)}
                </span>
                <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>
                  {PAYMENT_STATUS_LABEL[s.status]}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      </RosterGate>

      <ReviewModal entry={reviewing} onClose={() => setReviewing(null)} onDecide={decide} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FlagLine({ flag }: { flag: Flag }) {
  return (
    <span
      className={cn(
        "flex items-start gap-1.5 text-[12px] leading-relaxed",
        flag.severity === "blocker"
          ? "text-critical"
          : flag.severity === "warning"
            ? "text-[#a76d16]"
            : "text-muted",
      )}
    >
      {flag.severity === "blocker" ? (
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span>{flag.message}</span>
    </span>
  );
}

function ReviewModal({
  entry,
  onClose,
  onDecide,
}: {
  entry: QueueEntry | null;
  onClose: () => void;
  onDecide: (
    entry: QueueEntry,
    action: "verify" | "reject",
    note: string,
    override: boolean,
  ) => void;
}) {
  const [note, setNote] = React.useState("");
  const [override, setOverride] = React.useState(false);

  const [lastId, setLastId] = React.useState<string | null>(null);
  if (entry && entry.submission.registrationId !== lastId) {
    setLastId(entry.submission.registrationId);
    setNote("");
    setOverride(false);
  }
  if (!entry && lastId !== null) setLastId(null);

  if (!entry) return null;

  const { submission, assessment } = entry;
  const blocked = assessment.blockers.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={submission.participantName}
      subtitle={`${money(submission.amountDue, submission.currency)} due`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={<X className="size-4" />}
            disabled={!note.trim()}
            onClick={() => onDecide(entry, "reject", note, false)}
          >
            Reject receipt
          </Button>
          <Button
            variant="success"
            icon={<Check className="size-4" />}
            disabled={blocked && !override}
            onClick={() => onDecide(entry, "verify", note, override)}
          >
            Verify payment
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            Read from the receipt
          </p>
          <dl className="mt-2 space-y-1.5">
            {[
              ["File", submission.fileName ?? "None uploaded"],
              ["Transaction", submission.extract?.transactionId || "Not readable"],
              [
                "Amount",
                submission.extract?.amount !== undefined
                  ? money(submission.extract.amount, submission.currency)
                  : "Not readable",
              ],
              ["Account", submission.extract?.receiverAccount ?? "Not readable"],
              ["Method", submission.extract?.method ?? "Unknown"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="text-[12px] text-muted">{label}</dt>
                <dd className="num text-right text-[12.5px] font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
            These values were read from the image to save typing. They do not prove the transfer
            took place.
          </p>
        </div>

        {assessment.flags.length ? (
          <div className="space-y-1.5">
            {assessment.flags.map((flag, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-control px-3.5 py-2.5",
                  flag.severity === "blocker" ? "bg-critical-050" : "bg-warning-050",
                )}
              >
                <FlagLine flag={flag} />
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-control bg-success-050 px-3.5 py-2.5 text-[12.5px] text-[#12855c]">
            Nothing flagged. Confirm the amount reached the tournament account, then verify.
          </p>
        )}

        <Field
          label="Note"
          required
          hint="Recorded against your name. On a rejection, the participant is shown it."
        >
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Matched against the bank statement for 1 August."
          />
        </Field>

        {blocked ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-control bg-critical-050 px-3.5 py-3">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[rgb(var(--c-critical))]"
            />
            <span className="text-[12.5px] leading-relaxed text-critical">
              Verify despite the problems above. Do this only if you have confirmed the money
              arrived another way. What you overrode is recorded.
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
