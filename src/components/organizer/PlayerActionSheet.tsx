"use client";

import * as React from "react";
import { ArrowLeftRight, Loader2, Repeat, Tag, UserMinus } from "lucide-react";

import { Button, Modal } from "@/components/ui";
import type { GameRow } from "@/lib/domain/games";
import type { Division } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Tap a name, change something about them. Right there, on the results table.
 *
 * Five things a director needs in the room and used to need another screen for: swap this
 * player with somebody, move the board to another table, change who goes first, change the
 * player's category, withdraw them. All on one sheet, each one tap plus a choice, none of
 * them leaving the page.
 *
 * The sheet only offers what can actually be done. A board with a score cannot be swapped or
 * flipped, so those rows do not appear; a bye has nobody to go first, so that row does not
 * appear. The database checks everything again on the way in, so the worst a stale sheet
 * can do is show a button that answers with a sentence.
 */

export type PlayerAction =
  | { kind: "swap"; withPlayerId: string }
  | { kind: "move-table"; board: number }
  | { kind: "flip-first" }
  | { kind: "set-division"; division: string }
  | { kind: "withdraw" };

export interface SheetPlayer {
  id: string;
  fullName: string;
  playerNumber: string;
  division: string;
}

export function PlayerActionSheet({
  open,
  player,
  game,
  /** Everybody else on a board this round in the same category — the swap candidates. */
  swapCandidates,
  /** Tables in this category's block that nobody is sitting at. */
  freeTables,
  categories,
  busy,
  onAction,
  onClose,
}: {
  open: boolean;
  player: SheetPlayer | null;
  game: GameRow | null;
  swapCandidates: SheetPlayer[];
  freeTables: number[];
  categories: Division[];
  busy: boolean;
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<"menu" | "swap" | "table" | "division">("menu");

  /* A fresh sheet for a fresh player: whichever sub-list was open belongs to the last one. */
  const [seenFor, setSeenFor] = React.useState<string | null>(null);
  if (player && seenFor !== player.id) {
    setSeenFor(player.id);
    setMode("menu");
  }

  if (!player || !game) return null;

  const scored = game.scoreA !== null;
  const bye = game.playerB === null;

  const row = (
    icon: React.ReactNode,
    label: string,
    hint: string,
    onClick: () => void,
    tone: "default" | "critical" = "default",
  ) => (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-control px-3 py-3 text-left transition-colors hover:bg-[rgb(var(--c-surface-soft))] disabled:opacity-60",
        tone === "critical" && "text-critical",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-control bg-[rgb(var(--c-surface-soft))]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14.5px] font-semibold", tone === "critical" ? "text-critical" : "text-ink")}>
          {label}
        </span>
        <span className="block text-[12.5px] text-muted">{hint}</span>
      </span>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={player.fullName}
      subtitle={`${player.playerNumber ? `#${player.playerNumber} · ` : ""}${player.division} · Table ${game.board}${
        scored ? " · scored" : ""
      }`}
    >
      {mode === "menu" ? (
        <div className="-mx-1 space-y-0.5">
          {!scored && !bye
            ? row(
                <ArrowLeftRight className="size-4 text-ink" />,
                "Change opponent",
                swapCandidates.length > 0
                  ? `Swap with somebody else in ${player.division}`
                  : `Nobody else in ${player.division} to swap with`,
                () => setMode("swap"),
              )
            : null}
          {!scored
            ? row(
                <Tag className="size-4 text-ink" />,
                "Move table",
                freeTables.length > 0
                  ? `Free in the ${player.division} block: ${freeTables.slice(0, 6).join(", ")}${freeTables.length > 6 ? "…" : ""}`
                  : `No free table in the ${player.division} block`,
                () => setMode("table"),
              )
            : null}
          {!scored && !bye
            ? row(
                <Repeat className="size-4 text-ink" />,
                "Swap first and second",
                "Whoever opens becomes second, and the other way round",
                () => onAction({ kind: "flip-first" }),
              )
            : null}
          {row(
            <Tag className="size-4 text-ink" />,
            "Change category",
            "Takes effect from the next round. This board stays as it is.",
            () => setMode("division"),
          )}
          {row(
            <UserMinus className="size-4" />,
            "Withdraw from the tournament",
            "Out of every round from the next one. This board stays as it is.",
            () => {
              if (window.confirm(`Withdraw ${player.fullName}? They will not be paired again.`)) {
                onAction({ kind: "withdraw" });
              }
            },
            "critical",
          )}
          {scored ? (
            <p className="px-3 pt-2 text-[12.5px] leading-relaxed text-muted">
              This board has a score, so its players and seats cannot be changed here. Correct the
              score on the board itself if it is wrong.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "swap" ? (
        <Picker
          title={`Swap ${player.fullName} with…`}
          empty={`Nobody else in ${player.division} is on a board this round.`}
          busy={busy}
          onBack={() => setMode("menu")}
          options={swapCandidates.map((c) => ({
            key: c.id,
            label: c.fullName,
            hint: c.playerNumber ? `#${c.playerNumber}` : "",
            pick: () => onAction({ kind: "swap", withPlayerId: c.id }),
          }))}
        />
      ) : null}

      {mode === "table" ? (
        <Picker
          title="Move to table…"
          empty={`No free table in the ${player.division} block.`}
          busy={busy}
          onBack={() => setMode("menu")}
          options={freeTables.map((t) => ({
            key: String(t),
            label: `Table ${t}`,
            hint: "",
            pick: () => onAction({ kind: "move-table", board: t }),
          }))}
        />
      ) : null}

      {mode === "division" ? (
        <Picker
          title="Category from the next round…"
          empty="This event has no categories configured."
          busy={busy}
          onBack={() => setMode("menu")}
          options={categories
            .filter((c) => c.id !== player.division)
            .map((c) => ({
              key: c.id,
              label: c.name,
              hint: "",
              pick: () => onAction({ kind: "set-division", division: c.id }),
            }))}
        />
      ) : null}
    </Modal>
  );
}

/** A list of choices with one way back. */
function Picker({
  title,
  empty,
  busy,
  options,
  onBack,
}: {
  title: string;
  empty: string;
  busy: boolean;
  options: { key: string; label: string; hint: string; pick: () => void }[];
  onBack: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13.5px] font-bold text-ink">{title}</p>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
      {options.length === 0 ? (
        <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-3 text-[13px] text-muted">{empty}</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={busy}
              onClick={o.pick}
              className="flex items-center justify-between gap-2 rounded-control border border-line px-3 py-2.5 text-left text-[14px] font-semibold text-ink transition-colors hover:bg-[rgb(var(--c-surface-soft))] disabled:opacity-60"
            >
              <span className="truncate">{o.label}</span>
              {busy ? <Loader2 className="size-3.5 animate-spin text-muted" /> : o.hint ? <span className="num text-[12px] text-muted">{o.hint}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
