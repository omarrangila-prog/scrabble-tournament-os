"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  Copy,
  Mail,
  Receipt,
  Tag,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import {
  computeFee,
  registrationStatusOf,
  selectEventBySlug,
  selectForm,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { FormField } from "@/lib/domain/events";
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
  Advance: "advanced",
  Masters: "masters",
};

/**
 * Guest registration.
 *
 * No account, no password, no app. The participant fills the form the director
 * built, sees exactly what they owe, uploads a receipt, and receives a personal
 * link. Internal record ids are never shown or placed in a URL.
 */
export default function RegisterPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);
  const form = event ? selectForm(store, event.id) : undefined;
  const registrations = event ? selectRegistrations(store, event.id) : [];

  const [values, setValues] = React.useState<Record<string, string>>({});
  const [discountCode, setDiscountCode] = React.useState("");
  const [appliedCode, setAppliedCode] = React.useState<string | null>(null);
  const [receiptName, setReceiptName] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submittedToken, setSubmittedToken] = React.useState<string | null>(null);

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
  const fee = computeFee(event.fee, event.currency, discount);

  const set = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

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
    setErrors((e) => {
      const next = { ...e };
      delete next.discount;
      return next;
    });
    setAppliedCode(code);
  };

  /* ---- Validation ---------------------------------------------------- */

  const visibleFields = form.fields.filter(
    (f) => !f.showWhen || values[f.showWhen.fieldId] === f.showWhen.equals,
  );

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    for (const f of visibleFields) {
      if (f.kind === "heading" || f.kind === "paragraph") continue;
      const v = (values[f.id] ?? "").trim();
      if (f.required && !v) {
        e[f.id] = `${f.label} is required.`;
        continue;
      }
      if (f.kind === "email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))
        e[f.id] = "Enter a valid email address.";
      if (f.kind === "phone" && v && v.replace(/\D/g, "").length < 10)
        e[f.id] = "Enter a valid mobile number.";
      if (f.kind === "number" && v && Number.isNaN(Number(v)))
        e[f.id] = "Enter a number, or leave blank.";
      if (f.kind === "consent" && f.required && v !== "yes")
        e[f.id] = "You must accept the tournament rules to register.";
    }

    // A receipt is expected unless paying cash or the entry is free.
    const method = values["paymentMethod"];
    if (fee.amountDue > 0 && method && method !== "Cash at venue" && !receiptName) {
      e["receipt"] = "Upload your payment receipt, or select cash at venue.";
    }

    setErrors((prev) => ({ ...prev, ...e }));
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) {
      const firstError = document.querySelector('[aria-invalid="true"]');
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
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
      amountDue: fee.amountDue,
      discountCode: appliedCode ?? undefined,
      discountAmount: fee.discountAmount,
      currency: event.currency,
    });

    setSubmittedToken(token);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---- Confirmation --------------------------------------------------- */

  if (submittedToken) {
    return (
      <Confirmation
        token={submittedToken}
        name={values["fullName"] ?? "Player"}
        email={values["email"] ?? ""}
        eventName={event.name}
        slug={event.slug}
        amountDue={fee.amountDue}
        currency={event.currency}
        paidByCash={values["paymentMethod"] === "Cash at venue"}
        hasReceipt={!!receiptName}
      />
    );
  }

  /* ---- Closed --------------------------------------------------------- */

  if (!status.open) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Card>
          <EmptyState
            icon={<CircleAlert className="size-5" />}
            title={status.label}
            description={status.detail}
            action={
              <Link href={`/events/${event.slug}`}>
                <Button variant="secondary">Back to event page</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  /* ---- Form ------------------------------------------------------------ */

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href={`/events/${event.slug}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        {event.name}
      </Link>

      <div className="mt-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-ink sm:text-[34px]">
          {form.title}
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{form.intro}</p>
        {status.tone === "warning" ? (
          <p className="mt-3">
            <Badge tone="warning" dot>
              {status.detail}
            </Badge>
          </p>
        ) : null}
      </div>

      <Card className="mt-6">
        <div className="space-y-5 p-5 sm:p-6">
          {visibleFields.map((f) => (
            <FieldRenderer
              key={f.id}
              field={f}
              value={values[f.id] ?? ""}
              error={errors[f.id]}
              onChange={(v) => set(f.id, v)}
              onFile={(name) => {
                setReceiptName(name);
                setErrors((e) => {
                  const next = { ...e };
                  delete next.receipt;
                  return next;
                });
              }}
              fileName={f.kind === "file" ? receiptName : null}
              fileError={f.kind === "file" ? errors["receipt"] : undefined}
            />
          ))}
        </div>
      </Card>

      {/* Fee ------------------------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader title="What you owe" icon={<Receipt className="size-4.5" />} />
        <div className="px-5 pb-5 sm:px-6">
          <div className="space-y-2">
            <Row label="Registration fee" value={`${event.currency} ${fee.baseFee.toLocaleString("en-PK")}`} />
            {fee.discountAmount > 0 ? (
              <Row
                label={fee.discountLabel ?? "Discount"}
                value={`− ${event.currency} ${fee.discountAmount.toLocaleString("en-PK")}`}
                tone="success"
              />
            ) : null}
            <div className="flex items-center justify-between border-t border-line pt-2.5">
              <span className="text-[14px] font-bold text-ink">Amount due</span>
              <span className="num text-[22px] font-extrabold tracking-[-0.02em] text-ink">
                {event.currency} {fee.amountDue.toLocaleString("en-PK")}
              </span>
            </div>
            {fee.freeGames > 0 ? (
              <p className="text-[12.5px] text-[#12855c]">
                Includes {fee.freeGames} complimentary game{fee.freeGames === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>

          {/* Discount code */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Discount or campaign code" hint="Optional" className="flex-1">
              <Input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="e.g. EARLYBIRD"
                invalid={!!errors.discount}
              />
            </Field>
            <Button variant="secondary" onClick={applyDiscount} icon={<Tag className="size-4" />}>
              Apply
            </Button>
          </div>
          {errors.discount ? (
            <p className="mt-1 text-[12px] font-medium text-critical">{errors.discount}</p>
          ) : null}
          {appliedCode ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#12855c]">
              <CheckCircle2 className="size-3.5" />
              {appliedCode} applied.
            </p>
          ) : null}

          {/* Payment details */}
          {fee.amountDue > 0 ? (
            <div className="mt-5 space-y-2 rounded-compact bg-[rgb(var(--c-surface-soft))] p-4">
              <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
                <Building2 className="size-4 text-primary" />
                Where to send payment
              </p>
              <p className="text-[12.5px] leading-relaxed text-muted">{event.bankDetails}</p>
              <p className="text-[12.5px] leading-relaxed text-muted">{event.walletDetails}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink">
                {form.paymentInstructions}
              </p>
            </div>
          ) : null}

          <p className="mt-4 rounded-control bg-info-050 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#2668c9]">
            {form.termsText}
          </p>
        </div>
      </Card>

      <Button variant="primary" size="xl" className="mt-5 w-full" onClick={submit}>
        Submit Registration
        <ArrowRight className="size-5" />
      </Button>

      <p className="mt-3 text-center text-[12.5px] text-muted">
        No account or password needed. We&apos;ll email your confirmation to the address above.
      </p>
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

function FieldRenderer({
  field,
  value,
  error,
  onChange,
  onFile,
  fileName,
  fileError,
}: {
  field: FormField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onFile: (name: string) => void;
  fileName: string | null;
  fileError?: string;
}) {
  const f = field;

  if (f.kind === "heading")
    return (
      <h2 className="border-b border-line pb-2 pt-2 text-[15px] font-bold text-ink">{f.label}</h2>
    );

  if (f.kind === "paragraph")
    return <p className="text-[13.5px] leading-relaxed text-muted">{f.label}</p>;

  if (f.kind === "consent")
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-compact bg-[rgb(var(--c-surface-soft))] p-3.5">
        <input
          type="checkbox"
          checked={value === "yes"}
          onChange={(e) => onChange(e.target.checked ? "yes" : "")}
          aria-invalid={!!error}
          className="mt-0.5 size-4.5 shrink-0 rounded-[5px] accent-[#7357F6]"
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink">{f.label}</span>
          {error ? <span className="mt-0.5 block text-[12px] text-critical">{error}</span> : null}
        </span>
      </label>
    );

  if (f.kind === "file")
    return (
      <Field label={f.label} hint={f.hint} error={fileError}>
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-control border border-dashed px-4 py-4 transition-colors",
            fileError ? "border-critical bg-critical-050/40" : "border-line-strong hover:bg-[rgb(var(--c-surface-soft))]",
          )}
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            aria-invalid={!!fileError}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file.name);
            }}
          />
          <Upload className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            {fileName ? (
              <>
                <span className="block truncate text-[13.5px] font-semibold text-ink">
                  {fileName}
                </span>
                <span className="block text-[12px] text-[#12855c]">Attached — tap to replace</span>
              </>
            ) : (
              <>
                <span className="block text-[13.5px] font-semibold text-ink">
                  Choose a screenshot or photo
                </span>
                <span className="block text-[12px] text-muted">JPG, PNG or PDF</span>
              </>
            )}
          </span>
        </label>
      </Field>
    );

  if (f.kind === "select")
    return (
      <Field label={f.label} hint={f.hint} error={error} required={f.required}>
        <Select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}>
          <option value="">Select…</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </Field>
    );

  if (f.kind === "radio")
    return (
      <Field label={f.label} hint={f.hint} error={error} required={f.required}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(f.options ?? []).map((o) => (
            <label
              key={o}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-control border px-3.5 py-3 transition-colors",
                value === o
                  ? "border-primary bg-primary-050"
                  : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
              )}
            >
              <input
                type="radio"
                name={f.id}
                checked={value === o}
                onChange={() => onChange(o)}
                className="size-4 accent-[#7357F6]"
              />
              <span className="text-[13.5px] text-ink">{o}</span>
            </label>
          ))}
        </div>
      </Field>
    );

  if (f.kind === "textarea")
    return (
      <Field label={f.label} hint={f.hint} error={error} required={f.required}>
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          aria-invalid={!!error}
        />
      </Field>
    );

  const type =
    f.kind === "email" ? "email" : f.kind === "date" ? "date" : f.kind === "number" ? "number" : f.kind === "phone" ? "tel" : "text";

  return (
    <Field label={f.label} hint={f.hint} error={error} required={f.required}>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder}
        invalid={!!error}
      />
    </Field>
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
