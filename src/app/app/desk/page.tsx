"use client";

import * as React from "react";
import { Banknote, Check, Search, UserCheck } from "lucide-react";

import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { RoleGate } from "@/components/organizer/RoleGate";
import { RosterGate } from "@/components/organizer/RosterGate";
import { ParticipantLines, PaymentProofButton } from "@/components/organizer/RegistrationDetails";
import { CheckInReportButton } from "@/components/organizer/CheckInReportButton";
import { useEventDetails } from "@/lib/supabase/useEventDetails";
import type { CheckInSource } from "@/lib/reports/checkInReport";
import { ProvisionalDraw } from "@/components/organizer/ProvisionalDraw";
import { WalkInForm } from "@/components/organizer/WalkInForm";
import { useActiveLock } from "@/lib/supabase/useActiveLock";
import { useEventCategories } from "@/lib/supabase/useEventCategories";
import { useGames } from "@/lib/supabase/useGames";
import { useRoundTimer } from "@/lib/supabase/useRoundTimer";
import { useRoster } from "@/lib/supabase/useRoster";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { useStore } from "@/lib/store/useStore";
import {
  addLatePlayer,
  answer,
  waitingPlayers,
  decidePayment,
  field,
  importField,
  numberField,
  paymentProof,
  setDivision,
  staffCheckIn,
  type OrganizerRegistration,
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
  /* The event's own name and date, so the report is headed with them rather than a guess. */
  const stored = useEventDetails(currentEvent.eventId);
  const { categories } = useEventCategories(currentEvent.eventId);
  const activeLock = useActiveLock(currentEvent.eventId);
  const games = useGames(currentEvent.eventId);
  const clock = useRoundTimer(currentEvent.eventId, games.round);

  /* Who is checked in with nobody to play — the desk's other headline number. */
  const [waitingCount, setWaitingCount] = React.useState(0);
  React.useEffect(() => {
    if (games.round < 1) return;
    let live = true;
    (async () => {
      const list = await waitingPlayers(currentEvent.eventId, games.round);
      if (live) setWaitingCount(list.length);
    })();
    return () => {
      live = false;
    };
  }, [currentEvent.eventId, games.round, games.games, roster.players]);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const term = query.trim().toLowerCase();

  /*
   * How full the room is, overall and by category.
   *
   * Counted from the roster this screen already holds rather than asked for separately, so
   * the number beside the search box and the list underneath it can never disagree. Somebody
   * who has withdrawn is not somebody still to arrive, so they are out of both totals.
   */
  const arrivals = React.useMemo(() => {
    const playing = roster.players.filter((p) => p.checkIn !== "withdrawn");
    const here = playing.filter((p) => p.checkIn === "checked-in").length;

    const seen = new Map<string, { division: string; here: number; total: number }>();
    for (const p of playing) {
      const division = p.division || "no category";
      const row = seen.get(division) ?? { division, here: 0, total: 0 };
      row.total += 1;
      if (p.checkIn === "checked-in") row.here += 1;
      seen.set(division, row);
    }

    return {
      here,
      total: playing.length,
      byCategory: [...seen.values()].sort((a, b) => a.division.localeCompare(b.division)),
    };
  }, [roster.players]);

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

  const takeCash = async (
    recordId: string,
    name: string,
    amount: number | null,
    currency = "PKR",
  ) => {
    setBusy(recordId);
    const written = await decidePayment({
      recordId,
      status: "verified",
      by: app.currentUser?.name ?? roster.signedInAs ?? "Desk",
      note: amount === null ? "Cash taken at the desk" : `Cash taken at the desk — ${currency} ${amount}`,
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
          : `${money(amount, currency)} recorded against your name.`,
      tone: "success",
    });
  };

  const moveDivision = async (recordId: string, name: string, division: string) => {
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

    /*
     * Somebody arriving once the tournament is under way is the most ordinary thing that
     * happens at an event, and until now checking them in was as far as the desk could take
     * them: they were checked in, and playing nothing. Rounds are paired from the locked
     * roster, and they were not on it.
     *
     * So the desk finishes the job. Adding them is the obvious intent of checking somebody
     * in mid-tournament, and it is safe to do without asking: it never touches a round
     * already published, it declines for an event whose roster is not locked, and it says
     * nothing new for somebody already on the roster.
     */
    /*
     * Rolling entry: if a round is running, the desk decides whether this person joins it or
     * starts with the next one. Asked only when the choice exists — a round that has ended,
     * or no round at all, has only one answer, and asking would be a question with one
     * button.
     */
    let joinCurrent = false;
    if (games.round >= 1 && clock.phase !== "finished") {
      const left = clock.phase === "running" ? ` (${clock.clock} left)` : "";
      joinCurrent = window.confirm(
        `${name} is checked in.\n\nJoin round ${games.round} now${left}?\n\n` +
          `OK — find them an opponent in round ${games.round}.\n` +
          `Cancel — they start from round ${games.round + 1}.`,
      );
    }

    const late = await addLatePlayer(
      currentEvent.eventId,
      recordId,
      app.currentUser?.name ?? "Desk",
      joinCurrent,
    );

    roster.reload();
    app.toast({
      title: outcome.already ? `${name} was already in` : `${name} is checked in`,
      description: late.ok
        ? late.message
        : outcome.already
          ? "The original arrival time was kept."
          : "Recorded just now.",
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
  const currency =
    roster.registrations.find((r) => r.currency)?.currency ?? "PKR";

  /*
   * People with no category yet — the runbook sends the desk here when pairing is blocked.
   * Shown before search so a volunteer does not have to guess who to look up.
   */
  const needsCategory = roster.registrations.filter((r) => {
    if (r.registrationStatus === "rejected" || r.registrationStatus === "withdrawn") return false;
    const stated = (field(r, "confirmedDivision") ?? field(r, "preferredDivision") ?? "").trim();
    return !stated;
  });

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="Desk"
        subtitle="Find somebody, take their cash, check them in. Built for a phone."
        /*
          The report, where check-in actually happens.
          Somebody working the door wants it at the end of the day without leaving the screen
          they have been on all afternoon — and wants the printable one before the day starts,
          for when the wifi goes.
        */
        actions={
          <CheckInReportButton
            source={roster.registrations.map(toReportSource)}
            eventName={stored.event?.name ?? "Tournament"}
            eventDate={stored.event?.details.startDate ?? ""}
            disabled={roster.registrations.length === 0}
            onProblem={(description) =>
              app.toast({ title: "Report not built", description, tone: "critical" })
            }
          />
        }
      />

      <RoleGate need="desk">
      <RosterGate access={roster.access} loaded={roster.loaded}>
        {/*
          How the room is filling up, before anything else.
          The desk is asked "how many are here?" more often than any other question, and it
          was the one thing this screen could not answer without counting the list by hand.
        */}
        <Card className="mb-3 p-4">
          {/*
            The round first, because the desk is asked "has it started?" before anything
            else, and the answer changes what checking somebody in means.
          */}
          {games.round >= 1 ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-extrabold text-ink">Round {games.round}</p>
                <Badge
                  tone={
                    clock.phase === "running" ? "critical" : clock.phase === "finished" ? "neutral" : "warning"
                  }
                >
                  {clock.phase === "running"
                    ? "LIVE"
                    : clock.phase === "paused"
                      ? "PAUSED"
                      : clock.phase === "finished"
                        ? "ENDED"
                        : "NOT STARTED"}
                </Badge>
              </div>
              <p className="num text-[20px] font-extrabold tabular-nums text-ink">{clock.clock}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[15px] font-extrabold text-ink">
              Checked in: <span className="num">{arrivals.here}</span>
              <span className="num text-muted"> / {arrivals.total}</span>
            </p>
            {waitingCount > 0 ? (
              <p className="text-[13px] font-semibold text-warning-700">
                <span className="num">{waitingCount}</span> waiting for an opponent
              </p>
            ) : null}
          </div>
          {arrivals.total - arrivals.here > 0 ? (
            <p className="text-[12.5px] text-muted">{arrivals.total - arrivals.here} still to arrive</p>
          ) : (
            <p className="text-[12.5px] font-semibold text-success-700">Everybody is here</p>
          )}

          {arrivals.byCategory.length > 1 ? (
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2.5">
              {arrivals.byCategory.map((c) => (
                <p key={c.division} className="text-[12.5px] text-muted">
                  <span className="font-semibold capitalize text-ink">
                    {c.division.replace(/-/g, " ")}
                  </span>{" "}
                  <span className="num">
                    {c.here}/{c.total}
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-3">
            <WalkInForm
              eventId={currentEvent.eventId}
              categories={categories}
              by={app.currentUser?.name ?? roster.signedInAs ?? "Desk"}
              fee={0}
              onAdded={(added) => {
                roster.reload();
                app.toast({
                  title: `${added.name} added as #${added.playerNumber}`,
                  description: `Checked in. Code ${added.checkInCode}.`,
                  tone: "success",
                });
              }}
            />
          </div>
        </Card>

        {/*
          Only while the door is still open. Once the roster is locked this is no longer a
          guess that improves, and a card of provisional pairs beside a published round is
          exactly how somebody ends up reading the wrong names out.
        */}
        <ProvisionalDraw
          locked={activeLock.ids !== null}
          divisions={categories.map((c) => c.id)}
          players={roster.players
            .filter((p) => p.checkIn === "checked-in")
            .map((p) => ({
              id: p.id,
              fullName: p.fullName,
              playerNumber: p.playerId,
              division: p.division,
              checkedInAt: p.checkInAt ?? "",
            }))}
        />

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
            {needsCategory.length > 0 ? (
              <Card className="mt-4 border-warning-200">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="text-[14px] font-bold text-warning-700">
                    {needsCategory.length === 1
                      ? "1 player has no category"
                      : `${needsCategory.length} players have no category`}
                  </p>
                  <p className="text-[12.5px] text-muted">Assign before pairing</p>
                </div>
                <div className="mt-3 space-y-2">
                  {needsCategory.map((r) => {
                    const number =
                      importField(r, "playerNumber") ?? field(r, "playerNumber") ?? "—";
                    const working = busy === r.id;
                    return (
                      <div
                        key={r.id}
                        className="rounded-control bg-warning-050 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="num shrink-0 rounded-control px-2 py-0.5 text-[13px] font-extrabold"
                            style={{ background: "rgba(216,172,90,0.18)", color: "#8A6A1F" }}
                          >
                            {number}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                            {r.fullName}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(["beginner", "recreational", "advanced"] as const).map((d) => (
                            <button
                              key={d}
                              type="button"
                              disabled={working}
                              onClick={() => void moveDivision(r.id, r.fullName, d)}
                              className={cn(
                                "rounded-control border-2 border-line bg-white px-3 py-1.5 text-[12.5px] font-bold capitalize text-ink transition-colors hover:border-primary/45",
                                working && "opacity-50",
                              )}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}

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
                  {money(collected, currency)} in · {money(owed, currency)} to come
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
                          onClick={() => void takeCash(r.id, r.fullName, amount, r.currency)}
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
              /*
               * A reduced rate rests on something the desk has to see: a membership card, or
               * the other two people in a group. The amount alone does not say which, so a
               * volunteer handed PKR 800 has nothing to check it against.
               */
              const rateClaim = answer(r, "rateNeedsCheck") === "Yes" ? answer(r, "rateApplied") : undefined;
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
                    Who is doing what, when the ticket covers two people.
                    A combo ticket can name a player and a painter, and the volunteer has to
                    be able to say which of the two in front of them is on the board sheet.
                  */}
                  <ParticipantLines reg={r} className="mt-3" showPayment />

                  {/*
                    Said next to the button that would take the money, because that is where
                    the mistake happens. It does not disable anything — the desk may well have
                    decided the receipt is no good — it just refuses to let "Cash received" be
                    the obvious next tap for somebody who says they have already paid.
                  */}
                  {claimsPaid ? (
                    <div className="mt-3">
                      <p className="text-[12.5px] leading-relaxed text-warning">
                        Says they paid {money(amount, r.currency)}, not yet confirmed. Check the
                        receipt before taking cash.
                      </p>
                      {/*
                        The receipt itself, here rather than on another screen.
                        This message used to say "check the receipt on Payments", which meant
                        leaving the desk queue mid-check-in with somebody standing in front of
                        you. The file is one press away instead.
                      */}
                      <PaymentProofButton
                        reg={r}
                        className="mt-2"
                        onProblem={(description) =>
                          app.toast({ title: "Receipt not opened", description, tone: "warning" })
                        }
                      />
                    </div>
                  ) : null}

                  {rateClaim && !paid ? (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                      Claimed the {rateClaim.toLowerCase()} rate
                      {answer(r, "groupName") ? ` with ${answer(r, "groupName")}` : ""}. Check it
                      before taking the money.
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
                        onClick={() => void takeCash(r.id, r.fullName, amount, r.currency)}
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
                      {/*
                        The event's own categories, not a fixed three. This list was
                        hardcoded, so a four-category event had a desk that could never put
                        anybody into Masters.
                      */}
                      {categories.map((c) => {
                        const d = c.id;
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
                            {c.name}
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
      </RoleGate>
    </div>
  );
}

/**
 * A roster row in the shape the check-in report reads.
 *
 * The same mapping the registrations screen makes, because the two must produce the same
 * document — a desk that exports a different report from the director's is a room where two
 * people disagree about who turned up.
 */
function toReportSource(r: OrganizerRegistration): CheckInSource {
  return {
    playerNumber: importField(r, "playerNumber") ?? field(r, "playerNumber") ?? null,
    fullName: r.fullName,
    mobile: r.mobile,
    division: field(r, "confirmedDivision") ?? field(r, "preferredDivision") ?? r.playingLevel,
    paymentStatus: r.paymentStatus,
    amountDue: numberField(r, "amountDue"),
    currency: r.currency,
    checkedInAt: r.checkedInAt,
    checkInMethod: r.checkInMethod,
    checkInCode: r.checkInCode,
    receiptFileName: paymentProof(r)?.fileName ?? field(r, "receiptFileName") ?? null,
    email: r.email,
    area: answer(r, "area") ?? r.area ?? "",
    activity: answer(r, "activity") ?? "",
    scrabbleName: answer(r, "scrabbleName") ?? "",
    paintingName: answer(r, "paintingName") ?? "",
    registrationStatus: r.registrationStatus,
  };
}
