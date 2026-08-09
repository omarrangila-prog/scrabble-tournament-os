"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarPlus, Check } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { useEventStore } from "@/lib/store/useEventStore";
import { useStore } from "@/lib/store/useStore";
import { CATEGORY_LABEL, PlayerCategory } from "@/lib/domain/identity";
import { cn } from "@/lib/utils";

/** Defaults a first-time organizer can accept without deciding anything. */
const DEFAULTS = {
  rounds: 6,
  roundMinutes: 50,
  breakMinutes: 15,
  capacity: 128,
  fee: 2000,
  currency: "PKR",
  divisions: ["beginner", "recreational", "advanced", "masters"] as PlayerCategory[],
};

const STEPS = ["Basics", "When & where", "Format & fee"] as const;

/**
 * Create a tournament.
 *
 * Three short steps with working defaults, then straight into the new event's
 * workspace. The organizer never returns to a list to find what they just
 * made.
 */
export default function NewEventPage() {
  const store = useEventStore();
  const app = useStore();
  const router = useRouter();

  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({
    name: "",
    shortDescription: "",
    venueName: "",
    city: "Karachi",
    address: "",
    startDate: "",
    startTime: "09:00",
    expectedFinish: "18:00",
    rounds: DEFAULTS.rounds,
    roundMinutes: DEFAULTS.roundMinutes,
    breakMinutes: DEFAULTS.breakMinutes,
    capacity: DEFAULTS.capacity,
    fee: DEFAULTS.fee,
    divisions: DEFAULTS.divisions,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const stepValid = [
    form.name.trim().length > 2,
    form.venueName.trim().length > 1 && form.city.trim().length > 1 && !!form.startDate,
    form.rounds > 0 && form.capacity > 1 && form.divisions.length > 0,
  ];

  const create = () => {
    const event = store.createEvent({
      organizationId: store.activeOrganizationId ?? "org-federation",
      name: form.name.trim(),
      shortDescription: form.shortDescription.trim() || `${form.rounds} rounds in ${form.city}.`,
      description: form.shortDescription.trim(),
      bannerCaption: form.name.trim(),
      organizer: "Blufy's AlphaBattle",
      venueName: form.venueName.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      startDate: form.startDate,
      startTime: form.startTime,
      expectedFinish: form.expectedFinish,
      timeZone: "Asia/Karachi",
      contactPhone: "",
      contactEmail: "",
      visibility: "public",
      capacity: form.capacity,
      registrationOpensAt: new Date().toISOString(),
      registrationClosesAt: form.startDate
        ? new Date(`${form.startDate}T00:00:00.000Z`).toISOString()
        : new Date().toISOString(),
      fee: form.fee,
      currency: DEFAULTS.currency,
      paymentMethods: ["bank-transfer", "jazzcash", "easypaisa"],
      bankDetails: "",
      walletDetails: "",
      waitingList: true,
      rounds: form.rounds,
      roundMinutes: form.roundMinutes,
      breakMinutes: form.breakMinutes,
      divisions: form.divisions,
      prizes: [],
      createdBy: app.currentUser?.name ?? "Sir Hani",
    });

    app.toast({
      title: `${event.name} has been created successfully.`,
      description: "You are now in its workspace. Open registration when you are ready.",
      tone: "success",
    });

    // Straight into the new event. createEvent has already selected it.
    router.push(`/app/events/${event.id}/overview`);
  };

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="Create tournament"
        subtitle="Three short steps. Everything can be changed later."
      />

      {/* Progress */}
      <div className="mb-4 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold transition-colors",
                  i < step
                    ? "bg-success text-white"
                    : i === step
                      ? "bg-primary text-white"
                      : "bg-[rgb(var(--c-line))] text-muted",
                )}
              >
                {i < step ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-[13px] font-semibold sm:block",
                  i === step ? "text-ink" : "text-muted",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
          </React.Fragment>
        ))}
      </div>

      <Card>
        <CardHeader
          title={STEPS[step]}
          subtitle={`Step ${step + 1} of ${STEPS.length}`}
          icon={<CalendarPlus className="size-4.5" />}
        />

        <div className="space-y-3.5 px-5 pb-5">
          {step === 0 ? (
            <>
              <Field label="Tournament name" required>
                <Input
                  autoFocus
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Blufy's AlphaBattle"
                />
              </Field>
              <Field label="Short description" hint="Shown on the public event page.">
                <Textarea
                  rows={3}
                  value={form.shortDescription}
                  onChange={(e) => set("shortDescription", e.target.value)}
                  placeholder="One or two lines about the tournament."
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Venue" required>
                  <Input
                    autoFocus
                    value={form.venueName}
                    onChange={(e) => set("venueName", e.target.value)}
                    placeholder="e.g. Clifton Community Hall"
                  />
                </Field>
                <Field label="City" required>
                  <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
                </Field>
              </div>
              <Field label="Address">
                <Input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Street address"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Date" required>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                  />
                </Field>
                <Field label="Start time">
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => set("startTime", e.target.value)}
                  />
                </Field>
                <Field label="Expected finish">
                  <Input
                    type="time"
                    value={form.expectedFinish}
                    onChange={(e) => set("expectedFinish", e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Rounds">
                  <Input
                    type="number"
                    className="num"
                    value={form.rounds}
                    onChange={(e) => set("rounds", Math.max(1, Number(e.target.value)))}
                  />
                </Field>
                <Field label="Minutes per round">
                  <Input
                    type="number"
                    className="num"
                    value={form.roundMinutes}
                    onChange={(e) => set("roundMinutes", Math.max(1, Number(e.target.value)))}
                  />
                </Field>
                <Field label="Break minutes">
                  <Input
                    type="number"
                    className="num"
                    value={form.breakMinutes}
                    onChange={(e) => set("breakMinutes", Math.max(0, Number(e.target.value)))}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Capacity">
                  <Input
                    type="number"
                    className="num"
                    value={form.capacity}
                    onChange={(e) => set("capacity", Math.max(2, Number(e.target.value)))}
                  />
                </Field>
                <Field label={`Entry fee (${DEFAULTS.currency})`}>
                  <Input
                    type="number"
                    className="num"
                    value={form.fee}
                    onChange={(e) => set("fee", Math.max(0, Number(e.target.value)))}
                  />
                </Field>
              </div>

              <Field label="Divisions" hint="Players request a level; you confirm the final one.">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_LABEL) as PlayerCategory[]).map((c) => {
                    const on = form.divisions.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() =>
                          set(
                            "divisions",
                            on
                              ? form.divisions.filter((d) => d !== c)
                              : [...form.divisions, c],
                          )
                        }
                        className={cn(
                          "rounded-control border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                          on
                            ? "border-primary bg-primary-050 text-primary"
                            : "border-line bg-[rgb(var(--c-surface-strong))] text-muted hover:bg-[rgb(var(--c-surface-soft))]",
                        )}
                      >
                        {CATEGORY_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
          <Button
            variant="secondary"
            icon={<ArrowLeft className="size-4" />}
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              disabled={!stepValid[step]}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" disabled={!stepValid[step]} onClick={create}>
              Create tournament
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
