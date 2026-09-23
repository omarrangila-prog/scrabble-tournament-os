"use client";

import * as React from "react";
import { Clock, Loader2, UserPlus } from "lucide-react";

import { Badge, Button, Card } from "@/components/ui";
import {
  proposeLateMatches,
  remainingForLateMatch,
  type Waiting,
} from "@/lib/domain/rollingEntry";
import { cn } from "@/lib/utils";

/**
 * Late arrivals, and the matches they could play right now.
 *
 * Shown while a round is running and somebody eligible is on no board. Two waiting players of
 * one category become a proposal with one button under it. One waiting player is named,
 * with their category, so the desk knows who to look out for.
 *
 * Nothing here is automatic past the proposal. Staff confirm, and the database checks the
 * proposal again at that instant against the boards as they actually stand — because between
 * the screen drawing this card and the tap, the room may have moved.
 *
 * The time shown is the round's remaining time, because that is all a late match gets.
 */
export function WaitingRoom({
  waiting,
  roundEndsAt,
  roundEnded,
  busy,
  onConfirm,
}: {
  waiting: Waiting[];
  /** ISO. Null while the round has no clock. */
  roundEndsAt: string | null;
  roundEnded: boolean;
  busy: string | null;
  onConfirm: (a: Waiting, b: Waiting) => void;
}) {
  /*
   * Read once per render rather than ticking. A card that recounts the minutes every second
   * is a distraction beside the actual clock; the number here is for deciding, not timing.
   */
  const now = React.useSyncExternalStore(
    () => () => {},
    () => new Date().toISOString(),
    () => "",
  );

  if (waiting.length === 0) return null;

  const room = proposeLateMatches(waiting);
  const left = remainingForLateMatch(roundEndsAt, now);

  return (
    <Card className="overflow-hidden border-warning-200">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-warning-050 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-warning-700" />
          <h3 className="text-[14px] font-bold text-ink">
            {waiting.length === 1 ? "1 late arrival" : `${waiting.length} late arrivals`}
          </h3>
        </div>
        {left ? (
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning-700">
            <Clock className="size-3.5" />
            {left.label}
          </span>
        ) : null}
      </div>

      {roundEnded ? (
        <p className="px-4 py-3 text-[13px] text-muted">
          The round has ended, so these players start next round.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {room.proposals.map((p) => {
            const key = `${p.a.id}:${p.b.id}`;
            const working = busy === key;
            return (
              <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {p.division.replace(/-/g, " ")}
                  </p>
                  <p className="text-[14.5px] font-bold text-ink">
                    {p.a.fullName}
                    <span className="mx-1.5 text-[11px] font-bold uppercase text-muted">v</span>
                    {p.b.fullName}
                  </p>
                  <p className="text-[12px] text-muted">
                    Free table in the {p.division} block · {left ? left.label : "round not started"}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={working}
                  icon={working ? <Loader2 className="size-3.5 animate-spin" /> : undefined}
                  onClick={() => onConfirm(p.a, p.b)}
                  className="w-full sm:w-auto"
                >
                  {working ? "Starting…" : "Confirm & start match"}
                </Button>
              </div>
            );
          })}

          {room.waiting.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14.5px] font-bold text-ink">
                  {w.fullName}
                  {w.playerNumber ? <span className="num ml-1.5 text-[12px] font-semibold text-muted">{w.playerNumber}</span> : null}
                </p>
                <p className={cn("text-[12.5px] capitalize text-muted")}>{w.division.replace(/-/g, " ")}</p>
              </div>
              <Badge tone="warning">Waiting for opponent</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
