"use client";

import * as React from "react";
import { AlertTriangle, Check, Mail, MessageCircle, Send } from "lucide-react";

import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import { ACTIVE_EVENT, ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { useRoster } from "@/lib/supabase/useRoster";
import { field, importField } from "@/lib/supabase/organizer";
import { useStore } from "@/lib/store/useStore";
import { useDeliverability, whatsappLink } from "@/lib/email/deliverability";
import { cn } from "@/lib/utils";

/**
 * Telling everybody their player number.
 *
 * Two channels, because only one of them is guaranteed to work. Email needs a verified
 * sender; until there is one the provider refuses every address except the account
 * owner's, and a screen that sent thirty messages into that would report success while
 * twenty-nine people were told nothing.
 *
 * WhatsApp needs nothing. Every entrant gave a mobile number, the message is composed here
 * and opened in WhatsApp for the organizer to send, and for an event advertised on
 * Instagram in Karachi it is the channel people actually read.
 *
 * So the screen says plainly which one is available, and never offers the one that is not.
 */
export default function SendCodesPage() {
  const app = useStore();
  const roster = useRoster(ACTIVE_EVENT_ID);
  const delivery = useDeliverability();

  const [sending, setSending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<{
    sent: string[];
    failed: { name: string; reason: string }[];
  } | null>(null);
  const [messaged, setMessaged] = React.useState<Set<string>>(new Set());

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const people = roster.registrations.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    mobile: r.mobile,
    playerNumber: importField(r, "playerNumber") ?? field(r, "playerNumber") ?? "",
    checkInCode: r.checkInCode ?? "",
    token: field(r, "token") ?? "",
  }));

  const withEmail = people.filter((p) => p.email.includes("@"));
  const withMobile = people.filter((p) => whatsappLink(p.mobile, "x") !== null);

  /*
   * What a person actually receives. Composed once here so the WhatsApp message and the
   * email say the same thing — two channels telling somebody two different numbers is worse
   * than one channel.
   */
  const messageFor = (p: (typeof people)[number]) =>
    [
      `${ACTIVE_EVENT.name} — ${ACTIVE_EVENT.venueName}, Sunday 23 August.`,
      ``,
      `${p.fullName}, you are player ${p.playerNumber}.`,
      ``,
      `At the door, scan the code on the screen and enter ${p.playerNumber}.`,
      `You will also be asked for the last four digits of your mobile, to confirm it is you.`,
      ``,
      origin ? `${origin}/events/${ACTIVE_EVENT.slug}/check-in` : "",
    ]
      .filter(Boolean)
      .join("\n");

  const sendAll = async () => {
    if (!window.confirm(`Email ${withEmail.length} people their player number?`)) return;

    setSending(true);
    setOutcome(null);

    const response = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "player-codes", people: withEmail }),
    }).catch(() => null);

    const body = (await response?.json().catch(() => null)) as {
      sent?: string[];
      failed?: { name: string; reason: string }[];
      message?: string;
    } | null;

    setSending(false);

    if (!body) {
      app.toast({ title: "Nothing sent", description: "The request failed.", tone: "critical" });
      return;
    }

    setOutcome({ sent: body.sent ?? [], failed: body.failed ?? [] });

    app.toast({
      title: `${body.sent?.length ?? 0} sent`,
      description: body.failed?.length
        ? `${body.failed.length} could not be delivered — see the list.`
        : "Everybody with an email address has been told their number.",
      tone: body.failed?.length ? "warning" : "success",
    });
  };

  const canEmail = delivery.status?.configured === true && delivery.status?.canReachAnyone === true;

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="Send everyone their player number"
        subtitle="Two channels. Only one of them works without a verified sender."
      />

      <RosterGate access={roster.access} loaded={roster.loaded}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Entrants" value={people.length} icon={<Send className="size-5" />} />
          <Stat label="With an email" value={withEmail.length} tone={withEmail.length ? "success" : "warning"} />
          <Stat label="With a mobile" value={withMobile.length} tone="success" />
          <Stat
            label="Numbers assigned"
            value={people.filter((p) => p.playerNumber).length}
            tone={people.every((p) => p.playerNumber) ? "success" : "critical"}
          />
        </div>

        {/*
          The state of email, said plainly. This is the difference between "nobody was told"
          and "everybody was told", and it is invisible unless the screen says it.
        */}
        {delivery.loaded && !canEmail ? (
          <div className="mt-4 flex items-start gap-3 rounded-feature bg-warning-050 px-4 py-3.5">
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-[#a76d16]" />
            <p className="text-[13px] leading-relaxed text-[#a76d16]">
              <strong className="font-semibold">Email cannot reach participants yet.</strong>{" "}
              {delivery.status?.fix ??
                "The provider will only deliver to the account owner until a sender domain is verified."}{" "}
              Use WhatsApp below — every message is composed and ready to send.
            </p>
          </div>
        ) : null}

        <Card className="mt-4">
          <CardHeader
            title="By email"
            subtitle={
              canEmail
                ? `${withEmail.length} entrants have an email address`
                : "Unavailable until a sender is verified"
            }
            icon={<Mail className="size-4.5" />}
            action={
              <Button variant="primary" disabled={!canEmail || sending} onClick={() => void sendAll()}>
                {sending ? "Sending…" : `Email all ${withEmail.length}`}
              </Button>
            }
          />

          {outcome ? (
            <div className="space-y-2 px-4 pb-4">
              <p className="text-[13px] font-semibold text-ink">
                {outcome.sent.length} sent · {outcome.failed.length} not delivered
              </p>
              {outcome.failed.map((f) => (
                <p key={f.name} className="text-[12.5px] text-critical">
                  {f.name} — {f.reason}
                </p>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="mt-4">
          <CardHeader
            title="By WhatsApp"
            subtitle="Opens each message ready to send. Works today."
            icon={<MessageCircle className="size-4.5" />}
          />

          <div className="space-y-2 px-4 pb-4">
            {people.length === 0 ? (
              <EmptyState title="Nobody registered yet" description="Entrants appear here." />
            ) : (
              people.map((p) => {
                const link = whatsappLink(p.mobile, messageFor(p));
                const done = messaged.has(p.id);

                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-feature border border-line bg-[rgb(var(--c-surface-soft))] p-3"
                  >
                    <span
                      className="num shrink-0 rounded-control px-2.5 py-1 text-[14px] font-extrabold"
                      style={{ background: "rgba(216,172,90,0.18)", color: "#8A6A1F" }}
                    >
                      {p.playerNumber || "—"}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {p.fullName}
                      </span>
                      <span className="num block truncate text-[11.5px] text-muted">
                        {p.mobile}
                      </span>
                    </span>

                    {/*
                      Marked as sent when the organizer opens it, not when WhatsApp confirms —
                      nothing here can know that. It is a place-keeper for somebody working
                      down a list of thirty, and it says so rather than claiming delivery.
                    */}
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMessaged((s) => new Set(s).add(p.id))}
                        className={cn(
                          "shrink-0 rounded-control px-3.5 py-2 text-[12.5px] font-bold transition-colors",
                          done
                            ? "bg-success-050 text-success"
                            : "bg-[#25D366] text-white hover:brightness-95",
                        )}
                      >
                        {done ? (
                          <span className="flex items-center gap-1.5">
                            <Check className="size-3.5" />
                            Opened
                          </span>
                        ) : (
                          "WhatsApp"
                        )}
                      </a>
                    ) : (
                      <Badge tone="neutral">No mobile</Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </RosterGate>
    </div>
  );
}
