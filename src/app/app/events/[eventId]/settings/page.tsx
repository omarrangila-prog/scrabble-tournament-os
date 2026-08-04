"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, CreditCard, Info, Settings2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { selectScopedRegistrations, useEventStore } from "@/lib/store/useEventStore";
import { useStore } from "@/lib/store/useStore";
import { activeEvent } from "@/lib/domain/scope";
import { canOpenRegistration, countTracks, setupChecklist } from "@/lib/domain/gameOn";
import { ParticipationTrack } from "@/lib/firebase/schema";
import { PaymentMethod, PAYMENT_METHOD_LABEL } from "@/lib/domain/identity";
import { cn } from "@/lib/utils";

/** Methods an organizer can offer, and what each one needs configured. */
const METHODS: { id: PaymentMethod; needsAccount: boolean; hint: string }[] = [
  { id: "bank-transfer", needsAccount: true, hint: "Bank name, account title and IBAN." },
  { id: "easypaisa", needsAccount: true, hint: "The mobile number money is sent to." },
  { id: "jazzcash", needsAccount: true, hint: "The mobile number money is sent to." },
  { id: "cash", needsAccount: false, hint: "Collected at the welcome desk on the day." },
];

/**
 * Event settings.
 *
 * Where the details the poster does not state get supplied. Until a payment
 * method exists — and an account for it, unless it is cash — registration
 * cannot open: publishing a page that asks for money with nowhere to send it is
 * worse than not publishing at all.
 */
export default function EventSettingsPage() {
  const params = useParams<{ eventId: string }>();
  const store = useEventStore();
  const app = useStore();

  const event = activeEvent(store.events, {
    organizationId: store.activeOrganizationId,
    eventId: params.eventId,
  });

  /*
   * Editable fields are held locally and saved together, so a half-typed IBAN
   * never reaches the public page mid-keystroke.
   */
  const [bank, setBank] = React.useState(event?.bankDetails ?? "");
  const [wallet, setWallet] = React.useState(event?.walletDetails ?? "");
  const [capacity, setCapacity] = React.useState(String(event?.capacity ?? 0));
  const [rounds, setRounds] = React.useState(String(event?.rounds ?? 0));
  const [roundMinutes, setRoundMinutes] = React.useState(String(event?.roundMinutes ?? 0));
  const [contactEmail, setContactEmail] = React.useState(event?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = React.useState(event?.contactPhone ?? "");

  if (!event) return null;

  const registrations = selectScopedRegistrations(store);
  const tracks = countTracks(
    registrations
      .filter((r) => r.status !== "rejected")
      .map((r) => (r.participationTrack ?? "speed_scrabble") as ParticipationTrack),
  );

  const methods = event.paymentMethods;
  const needsAccount = methods.some((m) => METHODS.find((x) => x.id === m)?.needsAccount);
  const hasAccount = Boolean(event.bankDetails.trim() || event.walletDetails.trim());

  const checklist = setupChecklist({
    hasPaymentMethod: methods.length > 0,
    // Cash alone needs no account, so a cash-only event is ready without one.
    hasReceivingAccount: !needsAccount || hasAccount,
    capacity: event.capacity,
    rounds: event.rounds,
    roundMinutes: event.roundMinutes,
    registrationClosesAt: event.registrationClosesAt,
    contactEmail: event.contactEmail,
    scrabbleEntrants: tracks.scrabblePool,
  });

  const ready = canOpenRegistration(checklist);

  const toggleMethod = (method: PaymentMethod) => {
    const next = methods.includes(method)
      ? methods.filter((m) => m !== method)
      : [...methods, method];
    store.updateEvent(event.id, { paymentMethods: next });
  };

  const saveDetails = () => {
    store.updateEvent(event.id, {
      bankDetails: bank.trim(),
      walletDetails: wallet.trim(),
      capacity: Math.max(0, Number(capacity) || 0),
      rounds: Math.max(0, Number(rounds) || 0),
      roundMinutes: Math.max(0, Number(roundMinutes) || 0),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
    });
    app.toast({ title: "Event settings saved", tone: "success" });
  };

  const publish = () => {
    if (!ready.ready) return;
    store.setEventState(event.id, "registration-open");
    app.toast({
      title: "Registration is open",
      description: "Your registration link and QR code are now live.",
      tone: "success",
    });
  };

  return (
    <div>
      <PageHeader
        title="Event settings"
        subtitle="The details the poster does not state."
        badge={
          <Badge tone={event.state === "draft" ? "warning" : "success"}>
            {event.state === "draft" ? "Draft — not yet live" : "Published"}
          </Badge>
        }
      />

      {/* What still blocks publishing ------------------------------------ */}
      <Card className="mb-4">
        <CardHeader
          title={ready.ready ? "Ready to open registration" : "Before registration can open"}
          subtitle={ready.reason}
          icon={<Settings2 className="size-4.5" />}
        />
        <div className="px-5 pb-5">
          <ul className="space-y-1.5">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                    item.done
                      ? "bg-success text-white"
                      : item.blocking
                        ? "bg-critical text-white"
                        : "bg-[rgb(var(--c-line))] text-muted",
                  )}
                >
                  {item.done ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[13.5px] font-medium",
                      item.done ? "text-ink" : "text-muted",
                    )}
                  >
                    {item.label}
                    {!item.done && item.blocking ? (
                      <Badge tone="critical" className="ml-2">
                        Required
                      </Badge>
                    ) : null}
                  </span>
                  {!item.done && item.hint ? (
                    <span className="block text-[11.5px] text-faint">{item.hint}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          {event.state === "draft" ? (
            <div className="mt-4">
              <Button variant="primary" disabled={!ready.ready} onClick={publish}>
                Open registration
              </Button>
              {!ready.ready ? (
                <p className="mt-2 text-[12px] text-muted">
                  Registration opens once the required items above are filled in.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Payment --------------------------------------------------------- */}
        <Card className="xl:col-span-7">
          <CardHeader
            title="How participants pay"
            subtitle="At least one method is needed before registration opens"
            icon={<CreditCard className="size-4.5" />}
          />

          <div className="space-y-4 px-5 pb-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {METHODS.map((m) => {
                const on = methods.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMethod(m.id)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-feature border p-3.5 text-left transition-colors",
                      on
                        ? "border-primary bg-primary-050"
                        : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "grid size-4.5 shrink-0 place-items-center rounded border-2",
                          on ? "border-primary bg-primary text-white" : "border-line",
                        )}
                      >
                        {on ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="text-[13.5px] font-bold text-ink">
                        {PAYMENT_METHOD_LABEL[m.id]}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
                      {m.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {needsAccount ? (
              <>
                <Field
                  label="Bank account"
                  hint="Shown to anyone paying by transfer. Bank, account title and IBAN."
                >
                  <Textarea
                    rows={2}
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    placeholder="Meezan Bank · Account title · PK00 MEZN 0000 0000 0000 00"
                  />
                </Field>

                <Field label="EasyPaisa / JazzCash" hint="The number money is sent to.">
                  <Input
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    placeholder="0300 1234567 (account title)"
                  />
                </Field>
              </>
            ) : methods.length ? (
              <p className="flex items-start gap-2 rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Cash at the venue needs no account details. Participants are marked paid at the
                welcome desk.
              </p>
            ) : null}

            {!methods.length ? (
              <p className="flex items-start gap-2 rounded-control bg-critical-050 px-3.5 py-3 text-[12.5px] leading-relaxed text-critical">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Choose at least one method. Without one, the registration form has no way to tell
                a participant how to pay.
              </p>
            ) : null}
          </div>
        </Card>

        {/* Event details ---------------------------------------------------- */}
        <Card className="xl:col-span-5">
          <CardHeader title="Event details" subtitle="Not stated on the poster" />
          <div className="space-y-3.5 px-5 pb-5">
            <Field label="Capacity" hint="0 means no limit.">
              <Input
                type="number"
                className="num"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Scrabble rounds">
                <Input
                  type="number"
                  className="num"
                  value={rounds}
                  onChange={(e) => setRounds(e.target.value)}
                />
              </Field>
              <Field label="Minutes per round">
                <Input
                  type="number"
                  className="num"
                  value={roundMinutes}
                  onChange={(e) => setRoundMinutes(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Contact email" hint="Shown publicly and used for confirmations.">
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </Field>

            <Field label="Contact phone">
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Button variant="primary" onClick={saveDetails}>
          Save settings
        </Button>
      </div>

      {/* What the poster fixed --------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader title="From the poster" subtitle="Confirmed, and not editable here" />
        <dl className="grid gap-x-6 gap-y-2 px-5 pb-5 sm:grid-cols-2">
          {[
            ["Event", event.name],
            ["Subtitle", event.subtitle ?? "—"],
            ["Date", event.startDate],
            ["Time", event.timeDisplay ?? event.startTime],
            ["Venue", `${event.venueName}, ${event.city}`],
            ["Fee", `${event.currency} ${event.fee.toLocaleString("en-PK")}`],
            [
              "Member discount",
              event.memberDiscountPercent
                ? `${event.memberDiscountPercent}% — ${event.memberDiscountBody}`
                : "None",
            ],
            ["Collaborators", event.collaborators?.join(" × ") ?? "—"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-line pb-1.5"
            >
              <dt className="shrink-0 text-[12px] text-muted">{label}</dt>
              <dd className="text-right text-[12.5px] font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
