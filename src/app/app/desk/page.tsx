"use client";

import * as React from "react";
import { Banknote, Check, Search, UserCheck } from "lucide-react";

import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import { useRoster } from "@/lib/supabase/useRoster";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { useStore } from "@/lib/store/useStore";
import {
  decidePayment,
  field,
  importField,
  numberField,
  setDivision,
  staffCheckIn,
} from "@/lib/supabase/organizer";
import { money } from "@/lib/engine/finance";
import { cn } from "@/lib/utils";

/**
 * The desk, on a phone.
 *
 * Everything a coordinator does while standing up: find somebody, take their cash, check
 * them in. It exists because the alternative is a laptop on a table and one person tied to
 * it — and on the day the person who needs to take a payment is the person walking about
 * with the cash tin.
 *
 * Search is by player number, name or mobile, because a person at a desk offers whichever
 * they have. Three digits is the fast path and the one printed on their badge.
 *
 * Both actions are deliberately one tap with no confirmation dialog. A dialog on a phone
 * held in one hand, in a queue, is a tap somebody misses — and both are reversible from the
 * payments screen, which is the safer place for a decision that needs thinking about.
 */
export default function DeskPage() {
  const app = useStore();
  const currentEvent = useCurrentEvent();
  const roster = useRoster(currentEvent.eventId);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const term = query.trim().toLowerCase();

  /*
   * Nothing until something is typed. A list of thirty-five people on a phone is a list
   * nobody scrolls, and the desk always knows who it is looking for.
   */
  /*
   * A typed number matched from its end, which is the rule the database already uses to find
   * somebody by mobile.
   *
   * Comparing the digits as given fails on notation. A number held as "+92 336 8505214" and
   * typed the way it is written on every phone in the room, 0336 8505214, share no leading
   * digits at all — a country code replaces the trunk zero rather than sitting in front of
   * it. Matching the last seven makes those two forms the same number without making two
   * different people the same person.
   *
   * Seven, and not four: four digits are what a phone is asked for to prove an identity it has
   * already claimed, and several entrants here share them.
   */
  const typed = term.replace(/\D/g, "");
  const tail = typed.length >= 7 ? typed.slice(-7) : null;

  const found = term
    ? roster.registrations
        .filter((r) => {
          const number = importField(r, "playerNumber") ?? field(r, "playerNumber") ?? "";
          const mobile = r.mobile.replace(/\D/g, "");
          return (
            number.startsWith(term) ||
            r.fullName.toLowerCase().includes(term) ||
            (tail !== null ? mobile.endsWith(tail) : typed !== "" && mobile.includes(typed))
          );
        })
        .slice(0, 12)
    : [];

  const takeCash = async (recordId: string, name: string, amount: number | null) => {
    setBusy(recordId);
    const written = await decidePayment({
      recordId,
      status: "verified",
      by: app.currentUser?.name ?? roster.signedInAs ?? "Desk",
      note: amount === null ? "Cash taken at the desk" : `Cash taken at the desk — PKR ${amount}`,
    });
    setBusy(null);

    if (!written.ok) {
      app.toast({ title: "Not recorded", description: written.message, tone: "critical" });
      return;
    }

    roster.reload();
    app.toast({
      title: `${name} has paid`,
      description:
        amount === null
          ? "Recorded as paid. No amount was on file — set one on Payments."
          : `${money(amount, "PKR")} recorded against your name.`,
      tone: "success",
    });
  };

  const moveDivision = async (
    recordId: string,
    name: string,
    division: "beginner" | "recreational" | "advanced",
  ) => {
    setBusy(recordId);
    const written = await setDivision(
      recordId,
      division,
      app.currentUser?.name ?? roster.signedInAs ?? "Desk",
    );
    setBusy(null);

    if (!written.ok) {
      app.toast({ title: "Not changed", description: written.message, tone: "critical" });
      return;
    }

    roster.reload();
    app.toast({
      title: `${name} is now ${division}`,
      description: "Change it again before the round is paired if that is wrong.",
      tone: "success",
    });
  };

  const arrive = async (recordId: string, name: string) => {
    setBusy(recordId);
    let outcome = await staffCheckIn(recordId);
    setBusy(null);

    if (!outcome.ok) {
      app.toast({ title: "Not checked in", description: outcome.message, tone: "critical" });
      return;
    }

    /*
     * A payment problem self-check-in would also refuse on. Staff can still act — the
     * point is that doing so is visible, not automatic — so a reason is asked for and
     * carried through to the audit log alongside the payment status it overrode.
     */
    if (outcome.blocked) {
      const reason = window.prompt(
        `${outcome.blockedReason}\n\nCheck ${name} in anyway? Say why:`,
      );
      if (!reason || !reason.trim()) return;

      setBusy(recordId);
      outcome = await staffCheckIn(recordId, reason.trim());
      setBusy(null);

      if (!outcome.ok) {
        app.toast({ title: "Not checked in", description: outcome.message, tone: "critical" });
        return;
      }
    }

    roster.reload();
    app.toast({
      title: outcome.already ? `${name} was already in` : `${name} is checked in`,
      description: outcome.already ? "The original arrival time was kept." : "Recorded just now.",
      tone: "success",
    });
  };

  /*
   * The cash box, counted from the roster every time it is shown.
   *
   * A volunteer working a queue needs one question answered — who has not paid yet — and a
   * running total they can reconcile against the money in the tin. Nothing is stored: these
   * are the same records the desk is changing, added up.
   */
  const owing = roster.registrations.filter(
    (r) => r.paymentStatus !== "verified" && r.paymentStatus !== "complimentary",
  );
  const owed = owing.reduce((sum, r) => sum + (numberField(r, "amountDue") ?? 0), 0);
  const collected = roster.registrations
    .filter((r) => r.paymentStatus === "verified")
    .reduce((sum, r) => sum + (numberField(r, "amountDue") ?? 0), 0);

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="Desk"
        subtitle="Find somebody, take their cash, check them in. Built for a phone."
      />

      <RosterGate access={roster.access} loaded={roster.loaded}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Player number, name or mobile"
          inputMode="text"
          autoComplete="off"
          className="text-[16px]"
          aria-label="Find a participant"
        />

        {!term ? (
          <>
            {/*
              What is left to collect, before anybody types anything.
              A volunteer's real question is "who still owes", not "where is this one person",
              and an empty screen asking them to search cannot answer it.
            */}
            <Card className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[14px] font-bold text-ink">
                  {owing.length === 0
                    ? "Everybody has paid"
                    : `${owing.length} still to pay`}
                </p>
                <p className="num text-[13px] text-muted">
                  {money(collected, "PKR")} in · {money(owed, "PKR")} to come
                </p>
              </div>

              {owing.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {owing.map((r) => {
                    const number =
                      importField(r, "playerNumber") ?? field(r, "playerNumber") ?? "—";
                    const amount = numberField(r, "amountDue");
                    const working = busy === r.id;

                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2.5"
                      >
                        <span
                          className="num shrink-0 rounded-control px-2 py-0.5 text-[13px] font-extrabold"
                          style={{ background: "rgba(216,172,90,0.18)", color: "#8A6A1F" }}
                        >
                          {number}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                          {r.fullName}
                        </span>
                        <span className="num shrink-0 text-[13px] text-muted">
                          {amount === null ? "—" : money(amount, r.currency)}
                        </span>
                        <Button
                          variant="secondary"
                          disabled={working}
                          onClick={() => void takeCash(r.id, r.fullName, amount)}
                          className="shrink-0"
                        >
                          {working ? "…" : "Paid"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Card>

            <Card className="mt-3">
              <EmptyState
                icon={<Search className="size-5" />}
                title="Or find one person"
                description="Type a player number — 117 — or part of a name or mobile number."
              />
            </Card>
          </>
        ) : found.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              title="Nobody matches that"
              description="Check the number, or try part of their name."
            />
          </Card>
        ) : (
          <div className="mt-4 space-y-2">
            {found.map((r) => {
              const number = importField(r, "playerNumber") ?? field(r, "playerNumber");
              const amount = numberField(r, "amountDue");
              const owesCash = r.paymentStatus === "cash-at-venue";
              const paid = r.paymentStatus === "verified" || r.paymentStatus === "complimentary";
              /*
               * Money that has been claimed but not confirmed, which is not the same as money
               * nobody has paid.
               *
               * This badge used to read "Unpaid" for both. Five entrants have an amount
               * recorded against a payment still being checked — somebody who says they sent
               * PKR 800 and whose receipt has not been looked at — and a volunteer reading
               * "Unpaid" beside a "Cash received" button would take the 800 a second time.
               */
              const underReview =
                r.paymentStatus === "review-required" ||
                r.paymentStatus === "receipt-uploaded" ||
                r.paymentStatus === "processing";
              const claimsPaid = underReview && amount !== null;
              const here = Boolean(r.checkedInAt);
              const working = busy === r.id;

              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start gap-3">
                    {/* The number is what is on their badge, so it leads. */}
                    <span
                      className="num shrink-0 rounded-control px-2.5 py-1 text-[15px] font-extrabold"
                      style={{ background: "rgba(216,172,90,0.18)", color: "#8A6A1F" }}
                    >
                      {number ?? "—"}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-ink">
                        {r.fullName}
                      </span>
                      <span className="num block truncate text-[12.5px] text-muted">
                        {r.mobile}
                      </span>
                    </span>

                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={here ? "success" : "neutral"}>
                        {here ? "Arrived" : "Not here"}
                      </Badge>
                      <Badge
                        tone={paid ? "success" : owesCash || underReview ? "warning" : "neutral"}
                      >
                        {paid
                          ? "Paid"
                          : owesCash
                            ? `Owes ${amount === null ? "cash" : money(amount, r.currency)}`
                            : claimsPaid
                              ? `Check receipt · ${money(amount, r.currency)}`
                              : underReview
                                ? "No amount set"
                                : "Unpaid"}
                      </Badge>
                    </span>
                  </div>

                  {/*
                    Said next to the button that would take the money, because that is where
                    the mistake happens. It does not disable anything — the desk may well have
                    decided the receipt is no good — it just refuses to let "Cash received" be
                    the obvious next tap for somebody who says they have already paid.
                  */}
                  {claimsPaid ? (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-warning">
                      Says they paid {money(amount, r.currency)}, not yet confirmed. Check the
                      receipt on Payments before taking cash.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {/*
                      Only the actions that still apply. A "Cash received" button beside
                      somebody who has paid is a button that can only ever be a mistake.
                    */}
                    {!paid ? (
                      <Button
                        variant="primary"
                        icon={<Banknote className="size-4" />}
                        disabled={working}
                        onClick={() => void takeCash(r.id, r.fullName, amount)}
                        className={cn("flex-1", "min-w-[9rem]")}
                      >
                        {working ? "Recording…" : "Cash received"}
                      </Button>
                    ) : null}

                    {!here ? (
                      <Button
                        variant={paid ? "primary" : "secondary"}
                        icon={<UserCheck className="size-4" />}
                        disabled={working}
                        onClick={() => void arrive(r.id, r.fullName)}
                        className="min-w-[9rem] flex-1"
                      >
                        {working ? "Checking in…" : "Check in"}
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
                        <Check className="size-4" />
                        Already checked in
                      </span>
                    )}
                  </div>

                  {/*
                    Their category, changeable here.

                    A nine-year-old entered as Recreational, or an adult who has clearly been
                    playing for years sitting in Beginner — the organizer sees that in the
                    room, and needs to fix it before pairing rather than after.

                    Only before they are paired: a category that changes mid-tournament makes
                    the games already played belong to a division the player is no longer in,
                    and the standings then describe nobody.
                  */}
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                      Category
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(["beginner", "recreational", "advanced"] as const).map((d) => {
                        const current = (field(r, "confirmedDivision") ?? field(r, "preferredDivision")) === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            disabled={working || current}
                            onClick={() => void moveDivision(r.id, r.fullName, d)}
                            className={cn(
                              "rounded-control border-2 px-3 py-1.5 text-[12.5px] font-bold capitalize transition-colors",
                              current
                                ? "border-primary bg-primary text-white"
                                : "border-line bg-white text-ink hover:border-primary/45",
                              working && "opacity-50",
                            )}
                            aria-pressed={current}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </RosterGate>
    </div>
  );
}
