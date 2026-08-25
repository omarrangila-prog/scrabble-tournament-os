"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeftRight, Loader2, UserX } from "lucide-react";

import { Badge, Button, Modal } from "@/components/ui";
import type { Pairing, Player } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * The round, before it goes on the wall.
 *
 * Generating and publishing used to be the same function call — nothing a director saw came
 * before the boards were already live. This is the look-first step: every board, who is on
 * it, and why, with a chance to swap two players before anything is written.
 *
 * A repeat opponent is shown rather than hidden, because a round that had to allow one is
 * exactly the round a director should see coming, not discover from a complaint at the
 * table.
 *
 * Manual pairing starts here with nobody on a board at all — `unpaired` carries who still
 * needs one. Tapping two names in the pool pairs them onto a new board the same way tapping
 * two names already on boards swaps them; which happens is decided by where the two tapped
 * players currently are, not by two different screens.
 *
 * The caller must remount this component on every fresh preview — a `key` on some value that
 * changes each time a new round is opened for review. Its own selection state (which player
 * is armed for a swap) has to be cleared when a new round opens, and comparing `open` to its
 * previous value to do that would mean reading a ref during render, which the compiler here
 * refuses. A remount is the same reset with none of that.
 */
export function PairingPreview({
  open,
  round,
  pairings,
  unpaired,
  players,
  nameOf,
  onSwap,
  onPairFromPool,
  onUnpair,
  onMarkBye,
  onCancel,
  onPublish,
  busy,
}: {
  open: boolean;
  round: number;
  pairings: Pairing[];
  /** Eligible players with no board yet, as the round was first generated — non-empty only
   * for manual pairing, which is what tells this component to show the pool at all. */
  unpaired: string[];
  /** For a division lookup on pool players — a tap across divisions is refused. */
  players: Player[];
  nameOf: (id: string) => string;
  onSwap: (playerOneId: string, playerTwoId: string) => void;
  onPairFromPool: (playerOneId: string, playerTwoId: string) => void;
  onUnpair: (playerId: string) => void;
  onMarkBye: (playerId: string) => void;
  onCancel: () => void;
  onPublish: () => void;
  busy: boolean;
}) {
  /* The first player tapped, waiting for a second to complete the swap or the pairing. */
  const [armed, setArmed] = React.useState<string | null>(null);

  const isManual = unpaired.length > 0;
  const seatedIds = new Set(
    pairings.flatMap((p) => [p.playerAId, p.playerBId].filter(Boolean) as string[]),
  );
  const pool = unpaired.filter((id) => !seatedIds.has(id));

  const tap = (playerId: string) => {
    if (armed === null) {
      setArmed(playerId);
      return;
    }
    if (armed === playerId) {
      setArmed(null);
      return;
    }
    /*
     * Which action happens is decided fresh, from where each tapped player is right now —
     * not from where they were at the first tap. Two names already on boards swap; two
     * names still in the pool pair up. One of each is not an action this offers, so nothing
     * happens rather than guessing what was meant.
     */
    const armedSeated = seatedIds.has(armed);
    const targetSeated = seatedIds.has(playerId);
    if (armedSeated && targetSeated) onSwap(armed, playerId);
    else if (!armedSeated && !targetSeated) onPairFromPool(armed, playerId);
    setArmed(null);
  };

  const conflictCount = pairings.filter((p) => p.conflicts.length > 0).length;
  const byRound = [...pairings].sort((a, b) => a.board - b.board);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const poolByDivision = new Map<string, string[]>();
  for (const id of pool) {
    const division = playerMap.get(id)?.division ?? "—";
    poolByDivision.set(division, [...(poolByDivision.get(division) ?? []), id]);
  }

  const ready = isManual ? pool.length === 0 : true;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="lg"
      title={`Round ${round} — before it goes on the wall`}
      subtitle={
        isManual
          ? pool.length > 0
            ? `${pool.length} player(s) still need a board or a bye. Tap two names in the pool to pair them.`
            : "Everyone has a board or a bye. Tap two names to swap them if something looks wrong."
          : conflictCount > 0
            ? `${conflictCount} board${conflictCount === 1 ? "" : "s"} could not avoid a repeat opponent. Tap two names to swap them.`
            : "No repeat opponents. Tap two names to swap them if something looks wrong."
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            {armed ? `${nameOf(armed)} selected — tap another name.` : "Nothing is saved yet."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}
              onClick={onPublish}
              disabled={busy || !ready}
            >
              {busy ? "Publishing…" : `Publish round ${round} and start the clock`}
            </Button>
          </div>
        </div>
      }
    >
      {byRound.length > 0 ? (
        <ul className="space-y-2">
          {byRound.map((p) => (
            <li
              key={p.id}
              className={cn(
                "rounded-control border px-3 py-2.5",
                p.conflicts.length > 0
                  ? "border-warning-200 bg-warning-050"
                  : "border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))]",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="num grid size-8 shrink-0 place-items-center rounded-control bg-[rgb(var(--c-surface-strong))] text-[13px] font-extrabold text-ink">
                  {p.board}
                </span>

                <button
                  type="button"
                  onClick={() => tap(p.playerAId)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-control px-2 py-1 text-left text-[13.5px] font-semibold transition",
                    armed === p.playerAId ? "bg-primary-100 text-primary-700" : "text-ink hover:bg-[rgb(var(--c-surface-strong))]",
                  )}
                >
                  {nameOf(p.playerAId)}
                </button>

                {p.playerBId ? (
                  <>
                    <span className="text-[11px] font-bold uppercase text-muted">v</span>
                    <button
                      type="button"
                      onClick={() => tap(p.playerBId!)}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-control px-2 py-1 text-left text-[13.5px] font-semibold transition",
                        armed === p.playerBId ? "bg-primary-100 text-primary-700" : "text-ink hover:bg-[rgb(var(--c-surface-strong))]",
                      )}
                    >
                      {nameOf(p.playerBId)}
                    </button>
                  </>
                ) : (
                  <span className="flex-1 text-[13px] font-medium text-muted">Bye — no game this round</span>
                )}

                {isManual ? (
                  <button
                    type="button"
                    onClick={() => onUnpair(p.playerAId)}
                    title="Send back to the unpaired pool"
                    className="shrink-0 rounded-control p-1.5 text-muted transition hover:bg-critical-050 hover:text-critical"
                  >
                    <UserX className="size-3.5" />
                  </button>
                ) : (
                  <ArrowLeftRight className="size-3.5 shrink-0 text-muted" />
                )}
              </div>

              {p.conflicts.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-11">
                  {p.conflicts.map((c, i) => (
                    <Badge key={i} tone={c.severity === "critical" ? "critical" : "warning"}>
                      <AlertTriangle className="mr-1 size-3" />
                      {c.message}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : isManual ? (
        <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] leading-relaxed text-muted">
          Nothing is paired yet. Tap two names below to put them on a board together.
        </p>
      ) : null}

      {isManual && pool.length > 0 ? (
        <div className={cn("space-y-3", byRound.length > 0 && "mt-4")}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Unpaired</p>
          {[...poolByDivision.entries()].map(([division, ids]) => (
            <div key={division}>
              <p className="mb-1.5 text-[11.5px] font-semibold capitalize text-faint">{division.replace(/-/g, " ")}</p>
              <div className="flex flex-wrap gap-1.5">
                {ids.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => tap(id)}
                      className={cn(
                        "rounded-control border px-2.5 py-1.5 text-[13px] font-semibold transition",
                        armed === id
                          ? "border-primary bg-primary-100 text-primary-700"
                          : "border-line bg-[rgb(var(--c-surface-strong))] text-ink hover:bg-[rgb(var(--c-surface-soft))]",
                      )}
                    >
                      {nameOf(id)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onMarkBye(id)}
                      className="rounded-control px-2 py-1.5 text-[11.5px] font-semibold text-muted transition hover:bg-[rgb(var(--c-surface-strong))] hover:text-ink"
                    >
                      Bye
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
