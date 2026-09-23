"use client";

import * as React from "react";
import { Loader2, UserPlus } from "lucide-react";

import { Button, Card, Field, Input, Modal } from "@/components/ui";
import type { Division } from "@/lib/domain/types";
import { addWalkIn } from "@/lib/supabase/organizer";
import { cn } from "@/lib/utils";

/**
 * Somebody who turns up without having registered.
 *
 * A fact of every event: a friend brought along, a sibling, somebody who saw the poster that
 * morning. Until now the desk had no way to enter one, so they were added by editing the
 * database — or, more often, written on paper and typed in afterwards, which is where the
 * last tournament's roster discrepancies came from.
 *
 * The form asks for seven things and only two are required. A walk-in is entered while
 * somebody stands waiting, so anything the desk can fill in later is optional now: the point
 * is to get them a number and into the room.
 *
 * Everything the database decides, the database decides — the check-in code, the player
 * number, the normalised category. The browser cannot mark anybody paid.
 */

export type WalkInPayment =
  | "cash-at-venue"
  | "verified"
  | "complimentary"
  | "review-required";

const PAYMENTS: { id: WalkInPayment; label: string; hint: string }[] = [
  { id: "cash-at-venue", label: "Cash at the door", hint: "Owed, not yet in the tin." },
  { id: "verified", label: "Paid", hint: "Money received and checked." },
  { id: "complimentary", label: "Complimentary", hint: "Nothing to collect." },
  { id: "review-required", label: "Unsure", hint: "Someone should look at this." },
];

export function WalkInForm({
  eventId,
  categories,
  by,
  fee,
  onAdded,
}: {
  eventId: string;
  categories: Division[];
  by: string;
  /** The event's regular fee, offered as the starting amount. */
  fee: number;
  onAdded: (summary: { name: string; playerNumber: string; checkInCode: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [fullName, setFullName] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [age, setAge] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [rating, setRating] = React.useState("");
  const [payment, setPayment] = React.useState<WalkInPayment>("cash-at-venue");
  const [amount, setAmount] = React.useState(String(fee));
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);

  /* One category means there is no choice to make. */
  const chosen = category || (categories.length === 1 ? categories[0].id : "");

  const nameOk = fullName.trim().length >= 2;
  const categoryOk = chosen !== "";

  const reset = () => {
    setFullName("");
    setMobile("");
    setAge("");
    setCategory("");
    setRating("");
    setPayment("cash-at-venue");
    setAmount(String(fee));
    setNote("");
    setError(null);
    setTouched(false);
  };

  const submit = async () => {
    setTouched(true);
    if (!nameOk || !categoryOk || saving) return;

    setSaving(true);
    setError(null);

    const out = await addWalkIn({
      eventId,
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      playingLevel: chosen,
      /* Complimentary owes nothing, whatever is in the box. */
      amount: payment === "complimentary" ? 0 : Number(amount) || 0,
      by,
      age: age.trim() || undefined,
      rating: rating.trim() || undefined,
      paymentStatus: payment,
      note: note.trim() || undefined,
    });

    setSaving(false);

    if (!out.ok) {
      setError(out.message);
      return;
    }

    onAdded({ name: fullName.trim(), playerNumber: out.playerNumber, checkInCode: out.checkInCode });
    reset();
    setOpen(false);
  };

  const problem = (show: boolean, message: string) =>
    touched && show ? <p className="mt-1 text-[12.5px] text-critical">{message}</p> : null;

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        icon={<UserPlus className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Add walk-in player
      </Button>

      <Modal
        open={open}
        onClose={() => {
          reset();
          setOpen(false);
        }}
        title="Add a walk-in"
        subtitle="They are checked in as soon as this is saved."
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => void submit()}
              icon={saving ? <Loader2 className="size-4 animate-spin" /> : undefined}
            >
              {saving ? "Adding…" : "Add & check in"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <Field label="Full name" hint="The name that goes on the board sheet.">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ayesha Khan"
              autoComplete="off"
            />
            {problem(!nameOk, "A name is needed.")}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Phone" hint="Optional.">
              <Input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                inputMode="tel"
                placeholder="03xx xxxxxxx"
                className="num"
              />
            </Field>
            <Field label="Age" hint="Optional.">
              <Input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 24"
                className="num"
              />
            </Field>
          </div>

          <div>
            <span className="block text-[13px] font-semibold text-ink">Category</span>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={chosen === c.id}
                  className={cn(
                    "rounded-control border px-3 py-2.5 text-left text-[14px] font-semibold transition-colors",
                    chosen === c.id
                      ? "border-primary bg-primary-050 text-primary"
                      : "border-line bg-[rgb(var(--c-surface))] text-ink hover:bg-[rgb(var(--c-surface-soft))]",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {problem(!categoryOk, "Choose a category — pairing cannot place them without one.")}
          </div>

          <Field label="Rating" hint="PSA or another rating. Optional.">
            <Input
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 1450"
              className="num"
            />
          </Field>

          <div>
            <span className="block text-[13px] font-semibold text-ink">Payment</span>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {PAYMENTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPayment(p.id)}
                  aria-pressed={payment === p.id}
                  className={cn(
                    "rounded-control border px-3 py-2 text-left transition-colors",
                    payment === p.id
                      ? "border-primary bg-primary-050"
                      : "border-line bg-[rgb(var(--c-surface))] hover:bg-[rgb(var(--c-surface-soft))]",
                  )}
                >
                  <span className={cn("block text-[14px] font-semibold", payment === p.id ? "text-primary" : "text-ink")}>
                    {p.label}
                  </span>
                  <span className="block text-[12px] text-muted">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {payment === "complimentary" ? null : (
            <Field label="Amount" hint="In the event's own currency.">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                className="num"
              />
            </Field>
          )}

          <Field label="Note" hint="Anything the desk should remember. Optional.">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. paying with a friend"
            />
          </Field>

          {error ? (
            <Card className="border-critical-200 bg-critical-050 p-3">
              <p className="text-[13px] leading-relaxed text-critical">{error}</p>
            </Card>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
