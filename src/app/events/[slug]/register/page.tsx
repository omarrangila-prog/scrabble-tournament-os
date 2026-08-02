"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Mail,
  Save,
  Tag,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
} from "@/components/ui";
import { FieldRenderer } from "@/components/forms/FieldRenderer";
import {
  registrationStatusOf,
  selectEventBySlug,
  selectForm,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import {
  buildSteps,
  canReachStep,
  clearDraft,
  completedSteps,
  findReturning,
  firstNameOf,
  loadDraft,
  PriorRegistration,
  saveDraft,
  validateStep,
  visibleFields,
} from "@/lib/domain/formSteps";
import {
  buildHistory,
  DEFAULT_LOYALTY,
  loyaltyReward,
  NO_REWARD,
  priceRegistration,
} from "@/lib/engine/loyalty";
import { PaymentMethod, PlayerCategory } from "@/lib/domain/identity";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { cn } from "@/lib/utils";

const METHOD_VALUE: Record<string, PaymentMethod> = {
  "Bank transfer": "bank-transfer",
  EasyPaisa: "easypaisa",
  JazzCash: "jazzcash",
  "Cash at venue": "cash",
};

const DIVISION_VALUE: Record<string, PlayerCategory> = {
  Beginner: "beginner",
  Recreational: "recreational",
  Advanced: "advanced",
  Masters: "masters",
};

/**
 * Guest registration, as a short guided flow.
 *
 * No account, no password, no app. Five short steps rather than one long page,
 * because this is filled in on a phone: each step asks one kind of thing,
 * progress is saved as it is typed, and the fee is settled before anything is
 * submitted. Internal record ids are never shown or placed in a URL.
 */
export default function RegisterPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);
  const form = event ? selectForm(store, event.id) : undefined;
  const registrations = event ? selectRegistrations(store, event.id) : [];

  /*
   * A saved draft is read once, in a state initialiser, so restoring never
   * causes a second render pass — the form comes up already filled in rather
   * than flashing empty and then populating.
   */
  const [initialDraft] = React.useState(() => (event ? loadDraft(event.id) : null));

  const [values, setValues] = React.useState<Record<string, string>>(
    () => initialDraft?.values ?? {},
  );
  const [stepIndex, setStepIndex] = React.useState(() => initialDraft?.step ?? 0);
  const [discountCode, setDiscountCode] = React.useState("");
  const [appliedCode, setAppliedCode] = React.useState<string | null>(null);
  const [receiptName, setReceiptName] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submittedToken, setSubmittedToken] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(
    () => initialDraft?.savedAt ?? null,
  );
  const [dismissedReturning, setDismissedReturning] = React.useState(false);

  const eventId = event?.id;

  // Autosave after typing stops, rather than on every keystroke.
  React.useEffect(() => {
    if (!eventId || submittedToken) return;
    if (Object.keys(values).length === 0) return;
    const id = window.setTimeout(() => {
      const at = new Date().toISOString();
      saveDraft({ eventId, values, step: stepIndex, savedAt: at });
      setSavedAt(at);
    }, 800);
    return () => window.clearTimeout(id);
  }, [eventId, values, stepIndex, submittedToken]);

  if (!event || !form) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState title="Event not found" description="This registration link is no longer valid." />
        </Card>
      </div>
    );
  }

  const status = registrationStatusOf(event, registrations.length);
  const discount = store.discounts.find(
    (d) => d.eventId === event.id && d.active && d.code === appliedCode,
  );

  const steps = buildSteps(form);
  const step = steps[stepIndex];
  const done = completedSteps(steps, values);

  /** Prior entries across every event, for returning-participant prefill. */
  const history: PriorRegistration[] = store.registrations.map((r) => ({
    fullName: r.fullName,
    email: r.email,
    mobile: r.mobile,
    city: r.city,
    club: r.club,
    preferredDivision: r.preferredDivision,
    eventName: store.events.find((e) => e.id === r.eventId)?.name ?? "a previous event",
    submittedAt: r.submittedAt,
  }));

  const returning =
    !dismissedReturning && values.email ? findReturning(values.email, history) : null;

  /*
   * Loyalty is derived at render from completed entries rather than stored, so
   * it cannot go stale or be granted twice. Approved entries only — a rejected
   * registration is not participation.
   */
  const email = (values.email ?? "").trim().toLowerCase();
  const priorEntries = email
    ? store.registrations
        .filter((r) => r.email.trim().toLowerCase() === email && r.eventId !== event.id)
        .map((r) => ({
          status: r.status,
          eventName: store.events.find((e) => e.id === r.eventId)?.name ?? "a previous event",
          submittedAt: r.submittedAt,
        }))
    : [];

  const participantHistory = buildHistory(priorEntries);
  const reward = email
    ? loyaltyReward(DEFAULT_LOYALTY, participantHistory, event.fee)
    : NO_REWARD;

  const pricing = priceRegistration(
    event.fee,
    event.currency,
    reward,
    discount
      ? {
          code: discount.code,
          name: discount.label,
          percentOff: discount.kind === "percentage" ? discount.value : 0,
          // A free-entry code takes the whole fee off; a fixed code takes its
          // own value. Both are clamped to the fee by priceRegistration.
          amountOff:
            discount.kind === "free-entry"
              ? event.fee
              : discount.kind === "fixed"
                ? discount.value
                : 0,
        }
      : undefined,
  );

  const set = (id: string, v: string) => {
    setValues((s) => ({ ...s, [id]: v }));
    setErrors((e) => {
      if (!e[id]) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  };

  const applyPrefill = () => {
    if (!returning) return;
    setValues((s) => ({ ...returning.prefill, ...s }));
    setDismissedReturning(true);
  };

  const applyDiscount = () => {
    const code = discountCode.trim().toUpperCase();
    const found = store.discounts.find(
      (d) => d.eventId === event.id && d.active && d.code === code,
    );
    if (!found) {
      setErrors((e) => ({ ...e, discount: "That code is not recognised for this event." }));
      return;
    }
    if (found.maxRedemptions > 0 && found.redemptions >= found.maxRedemptions) {
      setErrors((e) => ({ ...e, discount: "This code has reached its redemption limit." }));
      return;
    }
    setAppliedCode(code);
    setErrors((e) => {
      const next = { ...e };
      delete next.discount;
      return next;
    });
  };

  /** Validates the current step and moves on only if it is clean. */
  const next = () => {
    const problems = validateStep(step, values);
    if (problems.length) {
      setErrors(Object.fromEntries(problems.map((p) => [p.fieldId, p.message])));
      return;
    }
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setStepIndex((i) => Math.max(0, i - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goTo = (index: number) => {
    if (index <= stepIndex || canReachStep(steps, values, index)) {
      setStepIndex(index);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const submit = () => {
    // Re-check every step, not just the last: a participant can edit an
    // earlier answer from the review screen and make it invalid again.
    for (let i = 0; i < steps.length; i++) {
      const problems = validateStep(steps[i], values);
      if (problems.length) {
        setErrors(Object.fromEntries(problems.map((p) => [p.fieldId, p.message])));
        setStepIndex(i);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    const custom: Record<string, string> = {};
    for (const f of form.fields) {
      if (f.mapsTo || f.kind === "heading" || f.kind === "paragraph") continue;
      if (values[f.id]) custom[f.id] = values[f.id];
    }

    const token = store.submitRegistration({
      eventId: event.id,
      fullName: values["fullName"] ?? "",
      email: values["email"] ?? "",
      mobile: values["phone"] ?? "",
      dateOfBirth: values["dob"] ?? "",
      city: values["city"] ?? "",
      club: values["club"] ?? "Unaffiliated",
      experience: values["experience"] ?? "",
      selfRating: values["rating"] ? Number(values["rating"]) : undefined,
      preferredDivision: DIVISION_VALUE[values["division"] ?? "Beginner"] ?? "beginner",
      previousEvents: values["previousEvents"],
      guardianName: values["guardianName"],
      guardianPhone: values["guardianPhone"],
      answers: custom,
      paymentMethod: METHOD_VALUE[values["paymentMethod"] ?? "Bank transfer"] ?? "bank-transfer",
      paymentReference: values["reference"],
      receiptFileName: receiptName ?? undefined,
      amountDue: pricing.payable,
      discountCode: appliedCode ?? undefined,
      discountAmount: pricing.totalOff,
      currency: event.currency,
    });

    clearDraft(event.id);
    setSubmittedToken(token);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submittedToken) {
    return (
      <Confirmation
        token={submittedToken}
        name={values["fullName"] ?? ""}
        email={values["email"] ?? ""}
        eventName={event.name}
        slug={event.slug}
        amountDue={pricing.payable}
        currency={event.currency}
        paidByCash={values["paymentMethod"] === "Cash at venue"}
        hasReceipt={!!receiptName}
      />
    );
  }

  if (!status.open) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState title="Registration is closed" description={status.detail} />
        </Card>
      </div>
    );
  }

  const isReview = step.id === "review";

  return (
    <main className="board-motif min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-[640px]">
        <header className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
            {event.organizer}
          </p>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.02em] text-ink">
            {event.name}
          </h1>
          <p className="mt-1 text-[13px] text-muted">{form.title}</p>
        </header>

        {/* Progress ------------------------------------------------------- */}
        <nav aria-label="Progress" className="mt-6 flex items-center gap-1.5">
          {steps.map((s, i) => {
            const reachable = i <= stepIndex || canReachStep(steps, values, i);
            const isDone = done.has(s.id);
            return (
              <React.Fragment key={s.id}>
                <button
                  onClick={() => goTo(i)}
                  disabled={!reachable}
                  aria-current={i === stepIndex ? "step" : undefined}
                  title={s.title}
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold transition-colors",
                    i === stepIndex
                      ? "bg-primary text-white"
                      : isDone
                        ? "bg-success text-white"
                        : "bg-[rgb(var(--c-line))] text-muted",
                    !reachable && "cursor-not-allowed opacity-60",
                  )}
                >
                  {isDone && i !== stepIndex ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </button>
                {i < steps.length - 1 ? (
                  <span
                    className={cn(
                      "h-0.5 flex-1 rounded-full",
                      isDone ? "bg-success" : "bg-[rgb(var(--c-line))]",
                    )}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </nav>

        <p className="mt-2 text-center text-[12.5px] text-muted">
          Step {stepIndex + 1} of {steps.length} · {step.title}
        </p>

        {/* Returning participant ------------------------------------------ */}
        {returning ? (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="mt-4 border-primary">
              <div className="p-4">
                <p className="text-[14px] font-bold text-ink">
                  Welcome back, {firstNameOf(returning.prior.fullName)}.
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  You entered {returning.eventCount === 1 ? "one event" : `${returning.eventCount} events`} with
                  us before, most recently {returning.prior.eventName}. Shall we fill in what we
                  already know? You can change anything afterwards.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={applyPrefill}>
                    Fill in my details
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDismissedReturning(true)}
                  >
                    No, I will type them
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : null}

        {/* Step ------------------------------------------------------------ */}
        <Card className="mt-4">
          <CardHeader title={step.title} subtitle={step.blurb} />

          <div className="space-y-4 px-5 pb-5">
            {isReview ? (
              <ReviewStep
                steps={steps}
                values={values}
                onEdit={(index) => goTo(index)}
                fee={{ amountDue: pricing.payable, discountAmount: pricing.totalOff }}
                currency={event.currency}
                receiptName={receiptName}
              />
            ) : (
              visibleFields(step, values).map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={values[field.id] ?? ""}
                  error={errors[field.id]}
                  onChange={(v) => set(field.id, v)}
                  onFile={(name) => setReceiptName(name)}
                  fileName={receiptName}
                />
              ))
            )}

            {/* Fee and discount belong to the payment step only. */}
            {step.id === "payment" ? (
              <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                  What you owe
                </p>

                <div className="mt-2 space-y-1.5">
                  {pricing.lines.map((line, i) => (
                    <Row
                      key={i}
                      label={line.label}
                      value={`${line.amount < 0 ? "− " : ""}${event.currency} ${Math.abs(line.amount).toLocaleString("en-PK")}`}
                      tone={line.amount < 0 ? "success" : undefined}
                    />
                  ))}
                  <div className="border-t border-line pt-1.5">
                    <Row
                      label="Amount due"
                      value={`${event.currency} ${pricing.payable.toLocaleString("en-PK")}`}
                    />
                  </div>
                </div>

                {pricing.freeGames > 0 ? (
                  <p className="mt-2 text-[12px] text-[#12855c]">
                    {pricing.freeGames} free game{pricing.freeGames === 1 ? "" : "s"} included.
                  </p>
                ) : null}

                {pricing.pendingApproval ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-[#a76d16]">
                    Your returning-participant discount is applied here, and the organizer confirms
                    it when they review your entry.
                  </p>
                ) : null}

                {!appliedCode ? (
                  <div className="mt-3">
                    <Field label="Promotion code" error={errors.discount}>
                      <div className="flex gap-2">
                        <Input
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                          placeholder="Optional"
                          className="num uppercase"
                          invalid={!!errors.discount}
                        />
                        <Button variant="secondary" onClick={applyDiscount} icon={<Tag className="size-4" />}>
                          Apply
                        </Button>
                      </div>
                    </Field>
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-[#12855c]">
                    <CheckCircle2 className="size-4" />
                    Code {appliedCode} applied.
                  </p>
                )}

                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  {form.paymentInstructions}
                </p>
              </div>
            ) : null}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
            <Button
              variant="secondary"
              icon={<ArrowLeft className="size-4" />}
              disabled={stepIndex === 0}
              onClick={back}
            >
              Back
            </Button>

            {isReview ? (
              <Button variant="primary" size="lg" onClick={submit}>
                Submit registration
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={next}>
                Continue
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </Card>

        {/* Continue later -------------------------------------------------- */}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          <Save className="size-3.5" />
          {savedAt ? (
            <span>Your answers are saved on this device. You can close this page and come back.</span>
          ) : (
            <span>Your answers save automatically as you type.</span>
          )}
        </div>

        <p className="mt-6 text-center text-[12px] text-faint">
          <Link href={`/events/${event.slug}`} className="underline underline-offset-2 hover:text-muted">
            Back to event details
          </Link>
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/** The review step: everything answered, grouped, each group editable. */
function ReviewStep({
  steps,
  values,
  onEdit,
  fee,
  currency,
  receiptName,
}: {
  steps: ReturnType<typeof buildSteps>;
  values: Record<string, string>;
  onEdit: (index: number) => void;
  fee: { amountDue: number; discountAmount: number };
  currency: string;
  receiptName: string | null;
}) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        if (step.id === "review") return null;
        const fields = visibleFields(step, values).filter((f) => f.kind !== "consent");
        if (!fields.length) return null;

        return (
          <div key={step.id} className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-bold text-ink">{step.title}</p>
              <button
                onClick={() => onEdit(index)}
                className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
              >
                Edit
              </button>
            </div>

            <dl className="mt-2 space-y-1.5">
              {fields.map((field) => {
                const value =
                  field.kind === "file"
                    ? (receiptName ?? "Not uploaded")
                    : (values[field.id] ?? "");
                return (
                  <div key={field.id} className="flex items-baseline justify-between gap-4">
                    <dt className="shrink-0 text-[12px] text-muted">{field.label}</dt>
                    <dd
                      className={cn(
                        "text-right text-[12.5px] font-medium",
                        value ? "text-ink" : "text-faint",
                      )}
                    >
                      {value || "Not answered"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}

      <div className="rounded-feature bg-primary-050 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-ink">Amount due</span>
          <span className="num text-[18px] font-extrabold text-ink">
            {currency} {fee.amountDue.toLocaleString("en-PK")}
          </span>
        </div>
        {fee.discountAmount > 0 ? (
          <p className="mt-1 text-[12px] text-[#12855c]">
            {currency} {fee.discountAmount.toLocaleString("en-PK")} discount applied.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13.5px] text-muted">{label}</span>
      <span
        className={cn(
          "num text-[14px] font-semibold",
          tone === "success" ? "text-[#12855c]" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Confirmation({
  token,
  name,
  email,
  eventName,
  slug,
  amountDue,
  currency,
  paidByCash,
  hasReceipt,
}: {
  token: string;
  name: string;
  email: string;
  eventName: string;
  slug: string;
  amountDue: number;
  currency: string;
  paidByCash: boolean;
  hasReceipt: boolean;
}) {
  // Read on the client only; the server render falls back to a relative path.
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const personalUrl = origin ? `${origin}/r/${token}` : `/r/${token}`;
  const qr = origin ? qrToDataUri(personalUrl, { size: 200 }) : "";

  const paymentLine = paidByCash
    ? "Pay at the venue on the day"
    : hasReceipt
      ? "Receipt submitted — awaiting verification"
      : amountDue === 0
        ? "Complimentary entry"
        : "Payment not yet received";

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-success to-cyan text-white shadow-[0_14px_36px_rgba(32,185,130,0.36)]">
          <CheckCircle2 className="size-8" strokeWidth={2.5} />
        </div>

        <h1 className="mt-5 text-center text-[28px] font-extrabold tracking-[-0.03em] text-ink">
          Registration received
        </h1>
        <p className="mt-2 text-center text-[15px] text-muted">
          {name} · {eventName}
        </p>

        <Card className="mt-6">
          <div className="space-y-2 p-5">
            <div className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3">
              <span className="text-[13px] text-muted">Registration status</span>
              <Badge tone="warning" dot>
                Under review
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3">
              <span className="text-[13px] text-muted">Payment</span>
              <span className="text-[13px] font-semibold text-ink">{paymentLine}</span>
            </div>
            {amountDue > 0 && !paidByCash && !hasReceipt ? (
              <p className="rounded-control bg-warning-050 px-3.5 py-2.5 text-[12.5px] text-[#a76d16]">
                Send {currency} {amountDue.toLocaleString("en-PK")} and reply to your confirmation
                email with the receipt to secure your place.
              </p>
            ) : null}
          </div>
        </Card>

        {/* Personal link and QR */}
        <Card className="mt-4">
          <CardHeader
            title="Your personal event link"
            subtitle="Keep this — it is how you check in and submit results on the day."
          />
          <div className="flex flex-col items-center gap-4 px-5 pb-5 sm:flex-row">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="Your personal event QR code"
                width={140}
                height={140}
                className="shrink-0 rounded-compact border border-line bg-white p-2"
              />
            ) : (
              <div className="size-[140px] shrink-0 animate-pulse rounded-compact bg-[rgb(var(--c-line))]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-all rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2.5 font-mono text-[12px] text-ink">
                {personalUrl}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                icon={<Copy className="size-3.5" />}
                onClick={() => navigator.clipboard?.writeText(personalUrl)}
              >
                Copy link
              </Button>
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
                <Mail className="mt-px size-3.5 shrink-0" />
                We&apos;ve also sent this to {email}.
              </p>
            </div>
          </div>
        </Card>

        <div className="mt-5 flex justify-center">
          <Link href={`/events/${slug}`}>
            <Button variant="ghost">Back to the event page</Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
