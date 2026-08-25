"use client";

import * as React from "react";
import { Check, Copy, Loader2, Mail, MessageCircle, PencilLine, Send } from "lucide-react";

import { RosterGate } from "@/components/organizer/RosterGate";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Stat,
} from "@/components/ui";
import type { ConfirmationPlayer } from "@/lib/domain/confirmation";
import { divisionLabel, type EventFacts, moneyLines } from "@/lib/domain/confirmation";
import {
  confirmationEmail,
  type ContactGroup,
  groupByContact,
  whatsappMessage,
} from "@/lib/domain/confirmationMessages";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { emailDetailsConfirmation } from "@/lib/email/client";
import { field, importField, numberField } from "@/lib/supabase/organizer";
import { useRoster } from "@/lib/supabase/useRoster";
import { useStore } from "@/lib/store/useStore";
import { supabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

/**
 * Asking everybody to check their own details, before the day.
 *
 * One row per contact rather than per person, because that is what a message is. A parent
 * with three children gets one email carrying three cards — three near-identical emails to
 * one address is how a real message gets ignored — and the registrations stay separate
 * everywhere else in the system.
 *
 * WhatsApp here is a link, not a send. The organizer taps it and their own WhatsApp opens
 * with the message already written, so the screen says "opened" rather than "sent": nothing
 * claims delivery it cannot see.
 */
export default function ConfirmationsPage() {
  const app = useStore();
  const currentEvent = useCurrentEvent();
  const roster = useRoster(currentEvent.eventId);

  /*
   * What every message says about the event. Read from the selected event rather than the
   * constants these templates used to hardcode, which named the 23 August tournament's date,
   * time and venue in every confirmation regardless of which event it was actually for.
   */
  const selected = currentEvent.events.find((e) => e.id === currentEvent.eventId);
  const eventFacts: EventFacts = {
    name: selected?.name ?? "The tournament",
    date: selected?.details.startDate ? formatDate(selected.details.startDate) : "",
    time: [selected?.details.startTime, selected?.details.endTime].filter(Boolean).join(" – "),
    venue: [selected?.details.venueName, selected?.details.city].filter(Boolean).join(", "),
  };
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [sendingAll, setSendingAll] = React.useState<{ done: number; total: number } | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [sent, setSent] = React.useState<Record<string, "sent" | "failed">>({});
  const [opened, setOpened] = React.useState<Record<string, true>>({});
  const [preview, setPreview] = React.useState<ContactGroup | null>(null);

  const origin = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => window.location.origin,
    () => "",
  );

  /* The roster as confirmation cards, with the token that opens each person's own page. */
  const players: (ConfirmationPlayer & { token: string })[] = React.useMemo(
    () =>
      roster.registrations.map((r) => ({
        number: importField(r, "playerNumber") ?? field(r, "playerNumber") ?? "",
        name: r.fullName.trim(),
        age: importField(r, "ageAsSupplied") ?? importField(r, "age") ?? "",
        mobile: r.mobile ?? "",
        email: r.email ?? "",
        area: field(r, "city") ?? "",
        division: field(r, "preferredDivision") ?? "",
        psa: importField(r, "playsPSARankingTournaments") ?? "",
        mediaConsent: importField(r, "mediaConsent") ?? "",
        amount: numberField(r, "amountDue"),
        paymentStatus: r.paymentStatus ?? "",
        paymentMethod: field(r, "paymentMethod") ?? "",
        confirmedAt: field(r, "detailsConfirmedAt") ?? null,
        correction: field(r, "correctionRequestDetails") ?? "",
        isYou: false,
        token: field(r, "token") ?? "",
      })),
    [roster.registrations],
  );

  const groups = React.useMemo(
    () =>
      groupByContact(players, (lead) => {
        const token = (lead as ConfirmationPlayer & { token: string }).token;
        return `${origin}/events/${selected?.slug ?? ""}/confirm/${token}`;
      }),
    [players, origin, selected?.slug],
  );

  const term = query.trim().toLowerCase();
  const shown = term
    ? groups.filter((g) =>
        g.players.some(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            p.number.startsWith(term) ||
            p.mobile.replace(/\D/g, "").includes(term.replace(/\D/g, "") || " "),
        ),
      )
    : groups;

  const confirmedCount = players.filter((p) => p.confirmedAt !== null).length;
  const corrections = players.filter((p) => p.correction !== "").length;
  const withEmail = groups.filter((g) => g.lead.email.includes("@"));

  /** Records the outcome against every player on that contact, so the roster shows it. */
  const record = async (group: ContactGroup, channel: "email" | "whatsapp", ok: boolean) => {
    const db = supabase();
    if (!db) return;
    for (const p of group.players) {
      await db.rpc("staff_mark_confirmation_sent", {
        p_event_id: currentEvent.eventId,
        p_number: p.number,
        p_channel: channel,
        p_ok: ok,
      });
    }
  };

  const sendOne = async (group: ContactGroup) => {
    const composed = confirmationEmail(group, eventFacts);
    const out = await emailDetailsConfirmation({
      to: group.lead.email,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
    });
    setSent((s) => ({ ...s, [group.lead.number]: out.ok ? "sent" : "failed" }));
    await record(group, "email", out.ok);
    return out;
  };

  const sendAll = async () => {
    setConfirm(false);
    setSendingAll({ done: 0, total: withEmail.length });

    let ok = 0;
    for (const [i, group] of withEmail.entries()) {
      const out = await sendOne(group);
      if (out.ok) ok += 1;
      setSendingAll({ done: i + 1, total: withEmail.length });
    }

    setSendingAll(null);
    roster.reload();
    app.toast({
      title: `${ok} of ${withEmail.length} sent`,
      description:
        ok === withEmail.length
          ? "Every contact has been asked to confirm."
          : "Some did not send. The failures are marked in the list.",
      tone: ok === withEmail.length ? "success" : "warning",
    });
  };

  return (
    <>
      <PageHeader
        title="Confirmations"
        subtitle="Ask everybody to check their own details before the day"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Participants" value={players.length} sub={`${groups.length} contacts`} />
        <Stat
          label="Confirmed"
          value={confirmedCount}
          tone={confirmedCount ? "success" : "neutral"}
        />
        <Stat
          label="Corrections asked"
          value={corrections}
          tone={corrections ? "warning" : "neutral"}
          sub={corrections ? "need a decision" : "none"}
        />
        <Stat label="Can be emailed" value={withEmail.length} sub="unique addresses" />
        <Stat
          label="Not yet asked"
          value={players.filter((p) => p.confirmedAt === null && p.correction === "").length}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Send the confirmations"
          subtitle="One message per contact — a family gets one email with a card each"
          icon={<Send className="size-4.5" />}
          action={
            <Button
              variant="primary"
              icon={
                sendingAll ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />
              }
              disabled={sendingAll !== null || withEmail.length === 0}
              onClick={() => setConfirm(true)}
            >
              {sendingAll
                ? `Sending ${sendingAll.done} of ${sendingAll.total}…`
                : "Send all emails"}
            </Button>
          }
        />

        {confirm ? (
          <div className="mt-3 rounded-feature border-2 border-primary bg-primary-050 p-4">
            <p className="text-[14px] font-bold text-ink">You are about to contact:</p>
            <ul className="num mt-2 space-y-0.5 text-[13px] text-ink">
              <li>{players.length} participants</li>
              <li>{withEmail.length} unique email addresses</li>
            </ul>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              People sharing a family contact receive one combined message.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => void sendAll()}>
                Send confirmations
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <RosterGate access={roster.access} loaded={roster.loaded}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Player number, name or mobile"
          className="mt-4 text-[16px]"
          aria-label="Find a contact"
        />

        {shown.length === 0 ? (
          <Card className="mt-4">
            <EmptyState title="Nobody matches that" description="Try part of a name or a number." />
          </Card>
        ) : (
          <div className="mt-3 space-y-2">
            {shown.map((group) => (
              <ContactRow
                event={eventFacts}
                key={group.lead.number}
                group={group}
                state={sent[group.lead.number]}
                opened={Boolean(opened[group.lead.number])}
                busy={busy === group.lead.number}
                onPreview={() => setPreview(group)}
                onEmail={async () => {
                  setBusy(group.lead.number);
                  const out = await sendOne(group);
                  setBusy(null);
                  roster.reload();
                  if (!out.ok) {
                    app.toast({ title: "Not sent", description: out.message, tone: "critical" });
                  }
                }}
                onWhatsApp={async () => {
                  setOpened((o) => ({ ...o, [group.lead.number]: true }));
                  await record(group, "whatsapp", true);
                  roster.reload();
                }}
                onCopy={async () => {
                  await navigator.clipboard.writeText(whatsappMessage(group, eventFacts));
                  app.toast({ title: "Message copied", tone: "success" });
                }}
              />
            ))}
          </div>
        )}
      </RosterGate>

      {preview ? <Preview group={preview} event={eventFacts} onClose={() => setPreview(null)} /> : null}
    </>
  );
}

function ContactRow({
  group,
  event,
  state,
  opened,
  busy,
  onPreview,
  onEmail,
  onWhatsApp,
  onCopy,
}: {
  group: ContactGroup;
  event: EventFacts;
  state?: "sent" | "failed";
  opened: boolean;
  busy: boolean;
  onPreview: () => void;
  onEmail: () => void | Promise<void>;
  onWhatsApp: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
}) {
  const anyConfirmed = group.players.some((p) => p.confirmedAt !== null);
  const allConfirmed = group.players.every((p) => p.confirmedAt !== null);
  const asked = group.players.some((p) => p.correction !== "");

  /* A Pakistani mobile as wa.me wants it: country code, no trunk zero. */
  const wa = `https://wa.me/${group.lead.mobile.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(whatsappMessage(group, event))}`;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-ink">
            {group.players.map((p) => p.name).join(" · ")}
          </span>
          <span className="num block text-[12.5px] text-muted">
            {group.players.map((p) => p.number).join(", ")}
            {group.lead.email ? ` · ${group.lead.email}` : " · no email"}
          </span>
        </span>

        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {asked ? (
            <Badge tone="warning">
              <PencilLine className="mr-1 inline size-3" />
              Correction
            </Badge>
          ) : allConfirmed ? (
            <Badge tone="success">
              <Check className="mr-1 inline size-3" />
              Confirmed
            </Badge>
          ) : anyConfirmed ? (
            <Badge tone="warning">Part confirmed</Badge>
          ) : state === "failed" ? (
            <Badge tone="critical">Email failed</Badge>
          ) : state === "sent" ? (
            <Badge tone="success">Email sent</Badge>
          ) : (
            <Badge tone="neutral">Not asked</Badge>
          )}
          {opened ? <Badge tone="neutral">WhatsApp opened</Badge> : null}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onPreview}>
          Preview
        </Button>
        <Button
          variant="secondary"
          icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
          disabled={busy || !group.lead.email.includes("@")}
          onClick={() => void onEmail()}
        >
          {group.lead.email.includes("@") ? "Send email" : "No email"}
        </Button>
        <a href={wa} target="_blank" rel="noreferrer" onClick={() => void onWhatsApp()}>
          <Button variant="secondary" icon={<MessageCircle className="size-4" />}>
            WhatsApp
          </Button>
        </a>
        <Button variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => void onCopy()}>
          Copy message
        </Button>
      </div>
    </Card>
  );
}

function Preview({ group, event, onClose }: { group: ContactGroup; event: EventFacts; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-[560px] overflow-y-auto rounded-feature bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold text-ink">
          {group.players.length === 1 ? group.players[0].name : `${group.players.length} players`}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">{group.lead.email || "No email address"}</p>

        {group.players.map((p) => {
          const m = moneyLines(p);
          return (
            <div key={p.number} className="mt-3 rounded-control border border-line p-3.5">
              <p className="num text-[12px] font-bold text-muted">PLAYER {p.number}</p>
              <p className="text-[15px] font-bold text-ink">{p.name}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {divisionLabel(p.division)} · {m.value} · {m.amountLabel} {m.amountValue}
              </p>
            </div>
          );
        })}

        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          WhatsApp message
        </p>
        <pre className="mt-1.5 whitespace-pre-wrap rounded-control bg-[rgb(var(--c-surface-soft))] p-3 text-[12px] leading-relaxed text-ink">
          {whatsappMessage(group, event)}
        </pre>

        <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
