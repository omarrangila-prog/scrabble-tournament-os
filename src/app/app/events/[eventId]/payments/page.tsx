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
import {
  GuestPaymentStatus,
  selectScopedRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { useStore } from "@/lib/store/useStore";
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

  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId: params.eventId,
  });

  if (!event) return null;

  const registrations = selectScopedRegistrations(store);

  /*
   * Map registrations into the shape the review engine expects. Only fields
   * genuinely captured at upload are populated — an absent field flags as
   * unreadable rather than being invented here.
   */
  const submissions: ReceiptSubmission[] = registrations.map((r) => ({
    registrationId: r.id,
    eventId: r.eventId,
    participantName: r.fullName,
    amountDue: r.amountDue,
    currency: r.currency,
    fileName: r.receiptFileName,
    status: r.paymentStatus as PaymentStatus,
    submittedAt: r.submittedAt,
    extract: r.receiptFileName
      ? {
          transactionId: r.paymentReference,
          // The file name stands in for a content hash in the demo. A real
          // upload would hash the bytes, which is what catches a re-encoded
          // screenshot that a name comparison would miss.
          imageHash: r.receiptFileName,
          method: r.paymentMethod,
        }
      : undefined,
  }));

  const totals = paymentTotals(submissions);
  const queue = reviewQueue(submissions, {
    now: new Date().toISOString(),
    expectedReceiver: event.bankDetails || undefined,
  });

  /*
   * Membership claims, and the subset still to be checked. A claim shows the
   * participant the reduced fee but must not count as confirmed revenue until
   * someone has looked at the number.
   */
  const membershipClaims = registrations.filter((r) => r.answers?.membershipNumber);
  const membershipUnverified = membershipClaims.filter((r) => r.status !== "approved");

  const settled = submissions.filter(
    (s) => s.status === "verified" || s.status === "rejected" || s.status === "complimentary",
  );

  const decide = (
    entry: QueueEntry,
    action: "verify" | "reject",
    note: string,
    override: boolean,
  ) => {
    const reviewer = app.currentUser?.name ?? "Sir Hani";

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

    store.verifyPayment(
      entry.submission.registrationId,
      result.decision.status as GuestPaymentStatus,
      reviewer,
      result.decision.note,
    );

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

      {/* Membership verification -------------------------------------------- */}
      {membershipClaims.length ? (
        <Card className="mt-4">
          <CardHeader
            title="Alliance Française memberships"
            subtitle={`${membershipUnverified.length} of ${membershipClaims.length} still to check`}
          />
          <div className="space-y-2 px-4 pb-4">
            {membershipClaims.slice(0, 20).map((r) => {
              const verified = r.status === "approved";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-feature border p-3.5",
                    verified
                      ? "border-success bg-success-050/40"
                      : "border-line bg-[rgb(var(--c-surface-soft))]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {r.fullName}
                    </span>
                    <span className="num block truncate text-[11.5px] text-muted">
                      Membership {r.answers.membershipNumber}
                    </span>
                  </span>

                  <span className="num shrink-0 text-[12.5px] text-muted">
                    {money(r.amountDue, event.currency)}
                  </span>

                  <Badge tone={verified ? "success" : "warning"}>
                    {verified ? "Verified" : "To check"}
                  </Badge>

                  {!verified ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          store.reviewRegistration(
                            r.id,
                            "approved",
                            app.currentUser?.name ?? "Sir Hani",
                            `Alliance Française membership ${r.answers.membershipNumber} verified.`,
                          );
                          app.toast({
                            title: "Membership verified",
                            description: `${r.fullName} — discount confirmed.`,
                            tone: "success",
                          });
                        }}
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const reason = window.prompt(
                            `Reject the membership claim for ${r.fullName}?\n\nThe full fee applies. Give a reason — the participant is shown it.`,
                          );
                          if (!reason?.trim()) return;
                          store.reviewRegistration(
                            r.id,
                            "under-review",
                            app.currentUser?.name ?? "Sir Hani",
                            `Membership not verified: ${reason.trim()}`,
                          );
                          app.toast({
                            title: "Membership claim rejected",
                            description: `${r.fullName} — full fee now applies.`,
                            tone: "info",
                          });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="px-5 pb-5 text-[11.5px] leading-relaxed text-faint">
            A claimed membership is not a verified one. Until each number is checked, the
            discount is shown to the participant but not counted as settled revenue.
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
