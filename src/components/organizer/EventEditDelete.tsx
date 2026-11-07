"use client";

import * as React from "react";

import { Button, Field, Input, Modal } from "@/components/ui";
import { writeEventDetails } from "@/lib/supabase/useEventDetails";
import { supabase } from "@/lib/supabase/client";
import type { StoredEvent } from "@/lib/supabase/events";

/**
 * Edit and delete for any event.
 *
 * Editing merges into the event's own details (the database function never replaces them), so a
 * field left alone is left alone. Deleting removes the event with its students, games,
 * certificates and receipts, which cannot be undone, so it asks for the event's name to be typed.
 */

export function EditEventModal({
  event,
  by,
  onClose,
  onSaved,
}: {
  event: StoredEvent;
  by: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = event.details;
  const [name, setName] = React.useState(event.name);
  const [subtitle, setSubtitle] = React.useState(event.subtitle ?? "");
  const [startDate, setStartDate] = React.useState(d.startDate ?? "");
  const [startTime, setStartTime] = React.useState(d.startTime ?? "");
  const [endTime, setEndTime] = React.useState(d.endTime ?? "");
  const [venueName, setVenueName] = React.useState(d.venueName ?? "");
  const [city, setCity] = React.useState(d.city ?? "");
  const [venueAddress, setVenueAddress] = React.useState(d.venueAddress ?? "");
  const [fee, setFee] = React.useState(String(d.fee ?? 0));
  const [capacity, setCapacity] = React.useState(String(d.capacity ?? 0));
  const [rounds, setRounds] = React.useState(String(d.rounds ?? 3));
  const [roundMinutes, setRoundMinutes] = React.useState(String(d.roundMinutes ?? 20));
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setProblem("An event needs a name.");
    if (!startDate) return setProblem("Choose a date.");
    setBusy(true);
    setProblem(null);
    const result = await writeEventDetails(
      event.id,
      {
        name: name.trim(),
        subtitle: subtitle.trim(),
        details: {
          startDate,
          startTime,
          endTime,
          venueName: venueName.trim(),
          city: city.trim(),
          venueAddress: venueAddress.trim(),
          fee: Math.max(0, Number(fee) || 0),
          capacity: Math.max(0, Math.round(Number(capacity) || 0)),
          rounds: Math.min(12, Math.max(1, Math.round(Number(rounds) || 1))),
          roundMinutes: Math.min(90, Math.max(5, Math.round(Number(roundMinutes) || 20))),
        },
      },
      by,
    );
    setBusy(false);
    if (!result.ok) return setProblem(result.message ?? "Could not save.");
    onSaved();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit event"
      subtitle={`/events/${event.slug}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="One-line description" className="sm:col-span-2">
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Venue">
          <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
        </Field>
        <Field label="Entry fee (PKR)">
          <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Places" hint="0 for no limit">
          <Input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label="Rounds">
          <Input type="number" min={1} max={12} value={rounds} onChange={(e) => setRounds(e.target.value)} />
        </Field>
        <Field label="Minutes per round">
          <Input
            type="number"
            min={5}
            max={90}
            value={roundMinutes}
            onChange={(e) => setRoundMinutes(e.target.value)}
          />
        </Field>
      </div>
      {problem ? (
        <p className="mt-3 rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical">{problem}</p>
      ) : null}
    </Modal>
  );
}

export function DeleteEventModal({
  event,
  by,
  onClose,
  onDeleted,
}: {
  event: StoredEvent;
  by: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === event.name.trim().toLowerCase();

  const remove = async () => {
    const db = supabase();
    if (!db) return setProblem("The database is not reachable right now.");
    setBusy(true);
    setProblem(null);
    const { error } = await db.rpc("staff_delete_event", { p_event_id: event.id, p_by: by });
    setBusy(false);
    if (error) return setProblem(error.message.replace(/^.*?:\s*/, ""));
    onDeleted();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete this event?"
      subtitle={event.name}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void remove()} disabled={busy || !matches}>
            {busy ? "Deleting…" : "Delete for good"}
          </Button>
        </div>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink">
        This removes the event and everything in it: its students and registrations, every round and
        score, certificates and uploaded receipts. The public page stops working. It cannot be undone.
      </p>
      <Field label="Type the event's name to confirm" className="mt-4">
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={event.name} />
      </Field>
      {problem ? (
        <p className="mt-3 rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical">{problem}</p>
      ) : null}
    </Modal>
  );
}
