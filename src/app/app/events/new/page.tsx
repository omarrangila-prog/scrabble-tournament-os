"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Info } from "lucide-react";

import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { createEvent } from "@/lib/supabase/events";
import { useRoster } from "@/lib/supabase/useRoster";
import { useStore } from "@/lib/store/useStore";

/**
 * Creating an event.
 *
 * The screen that used to be here wrote a tournament to browser storage and reported it
 * created successfully. Nothing could attach to it, because registrations and games are
 * rows keyed by an event id in Postgres and that event existed nowhere. It was removed
 * rather than left to mislead; this replaces it with one that writes the row.
 *
 * An event is created as a draft and stays off the public site until it is published
 * deliberately. Naming next year's tournament should not put a half-finished page in
 * front of strangers.
 */
export default function NewEventPage() {
  const router = useRouter();
  const app = useStore();

  /*
   * The roster hook is what tells us whether this browser is signed in as staff. The
   * database refuses the write regardless; asking first means the form can say so
   * before somebody fills it in.
   */
  const currentEvent = useCurrentEvent();
  const roster = useRoster(currentEvent.eventId);

  const [form, setForm] = React.useState({
    name: "",
    subtitle: "",
    slug: "",
    startDate: "",
    startTime: "12:00",
    endTime: "15:30",
    venueName: "",
    venueAddress: "",
    city: "Karachi",
    fee: "1250",
    capacity: "60",
    rounds: "5",
    roundMinutes: "20",
  });

  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /*
   * The link, previewed as it will be.
   *
   * The slug ends up in a URL people are given, typed and put in a QR code, so it is
   * worth seeing before the event exists rather than discovering afterwards. The
   * database normalises it the same way, so this preview is not a second opinion.
   */
  const slugPreview =
    (form.slug.trim() || form.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "…";

  const submit = async () => {
    const problems: Record<string, string> = {};

    if (!form.name.trim()) problems.name = "Give the event a name.";
    if (!form.startDate) problems.startDate = "Pick the date it happens.";
    if (form.fee && Number.isNaN(Number(form.fee))) problems.fee = "Enter a number.";
    if (form.capacity && Number.isNaN(Number(form.capacity))) problems.capacity = "Enter a number.";
    if (form.rounds && Number.isNaN(Number(form.rounds))) problems.rounds = "Enter a number.";

    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setBusy(true);
    const outcome = await createEvent({
      name: form.name.trim(),
      slug: form.slug.trim(),
      subtitle: form.subtitle.trim(),
      details: {
        startDate: form.startDate,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        venueName: form.venueName.trim() || undefined,
        venueAddress: form.venueAddress.trim() || undefined,
        city: form.city.trim() || undefined,
        fee: form.fee ? Number(form.fee) : undefined,
        currency: "PKR",
        capacity: form.capacity ? Number(form.capacity) : undefined,
        rounds: form.rounds ? Number(form.rounds) : undefined,
        roundMinutes: form.roundMinutes ? Number(form.roundMinutes) : undefined,
      },
    });
    setBusy(false);

    if (!outcome.ok) {
      setErrors({ form: outcome.message });
      return;
    }

    app.toast({
      title: `${form.name.trim()} created`,
      description: `Saved as a draft at /events/${outcome.slug}. It is not public yet.`,
      tone: "success",
    });
    router.push("/app/events");
  };

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader
        title="Create a tournament"
        subtitle="Saved to the database as a draft. Nothing is public until you publish it."
      />

      <RosterGate access={roster.access} loaded={roster.loaded}>
        <Card>
          <CardHeader title="The event" icon={<CalendarPlus className="size-4.5" />} />
          <div className="px-5 pb-5">
            {errors.form ? (
              <p className="mb-4 rounded-input bg-critical-050 px-3.5 py-2.5 text-[13px] font-medium text-critical">
                {errors.form}
              </p>
            ) : null}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Name" required error={errors.name} className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Blufy's AlphaBattle 2027"
                  invalid={!!errors.name}
                  autoFocus
                />
              </Field>

              <Field label="One-line description" className="sm:col-span-2">
                <Input
                  value={form.subtitle}
                  onChange={(e) => set("subtitle", e.target.value)}
                  placeholder="A fast-paced Scrabble showdown"
                />
              </Field>

              <Field
                label="Link"
                hint={`Will be /events/${slugPreview}`}
                className="sm:col-span-2"
              >
                <Input
                  value={form.slug}
                  onChange={(e) => set("slug", e.target.value)}
                  placeholder="Leave blank to build it from the name"
                />
              </Field>

              <Field label="Date" required error={errors.startDate}>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  invalid={!!errors.startDate}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                </Field>
                <Field label="Ends">
                  <Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
                </Field>
              </div>

              <Field label="Venue">
                <Input
                  value={form.venueName}
                  onChange={(e) => set("venueName", e.target.value)}
                  placeholder="Chai Chatt, Habitt City"
                />
              </Field>

              <Field label="City">
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </Field>

              <Field label="Address" className="sm:col-span-2">
                <Input
                  value={form.venueAddress}
                  onChange={(e) => set("venueAddress", e.target.value)}
                  placeholder="Street, area, city"
                />
              </Field>

              <Field label="Entry fee (PKR)" error={errors.fee}>
                <Input
                  value={form.fee}
                  onChange={(e) => set("fee", e.target.value)}
                  inputMode="numeric"
                  className="num"
                  invalid={!!errors.fee}
                />
              </Field>

              <Field label="Places" hint="0 for no limit" error={errors.capacity}>
                <Input
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  inputMode="numeric"
                  className="num"
                  invalid={!!errors.capacity}
                />
              </Field>

              <Field label="Rounds" error={errors.rounds}>
                <Input
                  value={form.rounds}
                  onChange={(e) => set("rounds", e.target.value)}
                  inputMode="numeric"
                  className="num"
                  invalid={!!errors.rounds}
                />
              </Field>

              <Field label="Minutes per round">
                <Input
                  value={form.roundMinutes}
                  onChange={(e) => set("roundMinutes", e.target.value)}
                  inputMode="numeric"
                  className="num"
                />
              </Field>
            </div>

            <div className="mt-5 flex items-start gap-2.5 rounded-feature bg-[rgb(var(--c-surface-soft))] px-4 py-3">
              <Info className="mt-0.5 size-4 shrink-0 text-muted" />
              <p className="text-[12.5px] leading-relaxed text-muted">
                Created as a draft, so it will not appear on the public site or accept
                registrations until you publish it. The payment accounts and playing
                categories are shared across events and do not need setting up again.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => router.push("/app/events")} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={busy}>
                {busy ? "Creating…" : "Create as draft"}
              </Button>
            </div>
          </div>
        </Card>
      </RosterGate>
    </div>
  );
}
