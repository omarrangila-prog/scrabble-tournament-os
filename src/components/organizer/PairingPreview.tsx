"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeftRight, Loader2 } from "lucide-react";

import { Badge, Button, Modal } from "@/components/ui";
import type { Pairing } from "@/lib/domain/types";
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
  nameOf,
  onSwap,
  onCancel,
  onPublish,
  busy,
}: {
  open: boolean;
  round: number;
  pairings: Pairing[];
  nameOf: (id: string) => string;
  onSwap: (playerOneId: string, playerTwoId: string) => void;
  onCancel: () => void;
  onPublish: () => void;
  busy: boolean;
}) {
  /* The first player tapped, waiting for a second to complete the swap. */
  const [armed, setArmed] = React.useState<string | null>(null);

  const tap = (playerId: string) => {
    if (armed === null) {
      setArmed(playerId);
      return;
    }
    if (armed !== playerId) onSwap(armed, playerId);
    setArmed(null);
  };

  const conflictCount = pairings.filter((p) => p.conflicts.length > 0).length;
  const byRound = [...pairings].sort((a, b) => a.board - b.board);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="lg"
      title={`Round ${round} — before it goes on the wall`}
      subtitle={
        conflictCount > 0
          ? `${conflictCount} board${conflictCount === 1 ? "" : "s"} could not avoid a repeat opponent. Tap two names to swap them.`
          : "No repeat opponents. Tap two names to swap them if something looks wrong."
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            {armed ? `${nameOf(armed)} selected — tap another name to swap.` : "Nothing is saved yet."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}
              onClick={onPublish}
              disabled={busy}
            >
              {busy ? "Publishing…" : `Publish round ${round} and start the clock`}
            </Button>
          </div>
        </div>
      }
    >
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

              <ArrowLeftRight className="size-3.5 shrink-0 text-muted" />
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
    </Modal>
  );
}
