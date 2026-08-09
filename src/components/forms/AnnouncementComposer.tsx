"use client";

import * as React from "react";
import { AlertTriangle, Info, Send, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";
import { selectOrgEvents, useEventStore } from "@/lib/store/useEventStore";
import { useStore } from "@/lib/store/useStore";
import {
  AudienceFilter,
  canSend,
  Channel,
  CHANNEL_LABEL,
  checkMessage,
  Contact,
  describeAudience,
  EXCLUSION_LABEL,
  ExclusionReason,
  MessageDraft,
  personalise,
  resolveAudience,
} from "@/lib/engine/audience";
import { CATEGORY_LABEL, PlayerCategory } from "@/lib/domain/identity";
import { cn } from "@/lib/utils";

/**
 * Announcing a new tournament to people who played previous ones.
 *
 * This is a promotional message by definition — it is about an event the
 * recipient has not entered — so it needs opt-in and a way to stop. Both are
 * enforced by the audience engine rather than by this screen, and the number of
 * people excluded is always shown so the organizer can account for the gap
 * between who they selected and who will actually be reached.
 */
export function AnnouncementComposer() {
  const store = useEventStore();
  const app = useStore();

  const events = selectOrgEvents(store);

  const [channel, setChannel] = React.useState<Channel>("email");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sourceEventId, setSourceEventId] = React.useState("");
  const [division, setDivision] = React.useState("");
  const [city, setCity] = React.useState("");
  const [returningOnly, setReturningOnly] = React.useState(false);

  /*
   * Contacts are derived from registrations across every event. One person may
   * have entered several, so entries are folded by email — messaging the same
   * person twice because they played twice is the obvious failure here.
   */
  const contacts: Contact[] = React.useMemo(() => {
    const byEmail = new Map<string, Contact>();

    for (const r of store.registrations) {
      const key = r.email.trim().toLowerCase();
      if (!key) continue;

      const existing = byEmail.get(key);
      const divisionLabel = (r.confirmedDivision ?? r.preferredDivision).replace(/-/g, " ");

      if (existing) {
        if (!existing.eventIds.includes(r.eventId)) existing.eventIds.push(r.eventId);
        if (!existing.divisions.includes(divisionLabel)) existing.divisions.push(divisionLabel);
        continue;
      }

      byEmail.set(key, {
        id: r.id,
        fullName: r.fullName,
        email: r.email,
        mobile: r.mobile,
        eventIds: [r.eventId],
        divisions: [divisionLabel],
        city: r.city,
        club: r.club,
        // Registering for an event is not consent to hear about other events.
        // The demo treats approved entrants as opted in; a real deployment
        // would carry an explicit checkbox from the registration form.
        marketingConsent: r.status === "approved",
      });
    }

    return [...byEmail.values()];
  }, [store.registrations]);

  const filter: AudienceFilter = {
    eventIds: sourceEventId ? [sourceEventId] : undefined,
    divisions: division ? [division] : undefined,
    cities: city ? [city] : undefined,
    returningOnly,
  };

  const draft: MessageDraft = { subject, body, kind: "promotional", channel };
  const audience = resolveAudience(contacts, filter, "promotional", channel);
  const problems = checkMessage(draft);
  const sendCheck = canSend(draft, audience);

  const cities = [...new Set(contacts.map((c) => c.city).filter(Boolean))].sort();

  const send = () => {
    if (!sendCheck.ok) return;
    app.toast({
      title: `Announcement queued for ${audience.recipients.length} recipient${audience.recipients.length === 1 ? "" : "s"}`,
      description: audience.excluded.length
        ? `${audience.excluded.length} excluded — see the breakdown.`
        : "Everyone in this audience will receive it.",
      tone: "success",
    });
  };

  const preview = audience.recipients[0];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Announce to previous participants"
          subtitle="People who played earlier events, filtered however you need"
          icon={<Send className="size-4.5" />}
        />

        <div className="space-y-3.5 px-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Channel">
              <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Played in">
              <Select value={sourceEventId} onChange={(e) => setSourceEventId(e.target.value)}>
                <option value="">Any previous event</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Division">
              <Select value={division} onChange={(e) => setDivision(e.target.value)}>
                <option value="">Any division</option>
                {(Object.keys(CATEGORY_LABEL) as PlayerCategory[]).map((c) => (
                  <option key={c} value={CATEGORY_LABEL[c]}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="City">
              <Select value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">Any city</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Toggle
            checked={returningOnly}
            onChange={setReturningOnly}
            label="Returning players only"
            description="People who have entered more than one event."
          />

          {channel === "email" ? (
            <Field label="Subject" required>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Blufy's AlphaBattle — registration is open"
              />
            </Field>
          ) : null}

          <Field
            label="Message"
            required
            hint="Use [first name], [city] or [club] to personalise. A promotional message must say how to stop receiving them."
          >
            <Textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                "New tournament announced.\n\nBlufy's AlphaBattle\nRegistration is now open.\nDate: 20 August 2026\nVenue: Clifton, Karachi\nEntry: PKR 2,000\n\nReply STOP to unsubscribe."
              }
            />
          </Field>

          {problems.length ? (
            <div className="space-y-1.5">
              {problems.map((p, i) => (
                <p
                  key={i}
                  className={cn(
                    "flex items-start gap-2 rounded-control px-3.5 py-2.5 text-[12px] leading-relaxed",
                    p.severity === "blocker"
                      ? "bg-critical-050 text-critical"
                      : "bg-warning-050 text-[#a76d16]",
                  )}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {p.message}
                </p>
              ))}
            </div>
          ) : null}

          {preview && body.trim() ? (
            <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                Preview for {preview.fullName}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
                {personalise(body, preview)}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <Button variant="primary" icon={<Send className="size-4" />} disabled={!sendCheck.ok} onClick={send}>
              Send announcement
            </Button>
            <span className="text-[12px] text-muted">{sendCheck.reason}</span>
          </div>
        </div>
      </Card>

      {/* Audience ---------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Audience"
          subtitle={describeAudience(audience)}
          icon={<Users className="size-4.5" />}
        />
        <div className="space-y-3 px-5 pb-5">
          <div className="rounded-feature bg-primary-050 px-4 py-3 text-center">
            <p className="num text-[26px] font-extrabold leading-none text-primary">
              {audience.recipients.length}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              will receive this, of {audience.matched} matched
            </p>
          </div>

          {audience.excluded.length ? (
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                Excluded
              </p>
              <ul className="mt-1.5 space-y-1">
                {(Object.keys(audience.excludedCounts) as ExclusionReason[])
                  .filter((r) => audience.excludedCounts[r] > 0)
                  .map((r) => (
                    <li
                      key={r}
                      className="flex items-baseline justify-between gap-3 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2"
                    >
                      <span className="text-[12px] text-ink">{EXCLUSION_LABEL[r]}</span>
                      <span className="num text-[12.5px] font-bold text-muted">
                        {audience.excludedCounts[r]}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-faint">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Anyone who asked not to be contacted is excluded from every announcement, whatever
            filters are set. Messages about an event someone has already entered — their pairing,
            payment or certificate — are sent separately and do not need opt-in.
          </p>

          <Badge tone="neutral">Simulated in this demo</Badge>
        </div>
      </Card>
    </div>
  );
}
