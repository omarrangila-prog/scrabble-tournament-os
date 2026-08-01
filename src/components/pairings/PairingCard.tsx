"use client";

import * as React from "react";
import { AlertTriangle, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { Avatar, Badge, Button } from "@/components/ui";
import { Pairing, Player } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** One board, with everything a director needs to judge the pairing. */
export function PairingCard({
  pairing,
  playerA,
  playerB,
  rankA,
  rankB,
  previousMeetings,
  onLock,
  onResolve,
  onSwap,
  compact,
}: {
  pairing: Pairing;
  playerA?: Player;
  playerB?: Player | null;
  rankA?: number;
  rankB?: number;
  previousMeetings?: number;
  onLock?: () => void;
  onResolve?: () => void;
  onSwap?: () => void;
  compact?: boolean;
}) {
  const critical = pairing.conflicts.filter((c) => c.severity === "critical" && !c.acknowledgedReason);
  const warnings = pairing.conflicts.filter((c) => c.severity === "warning" && !c.acknowledgedReason);
  const approved = pairing.conflicts.filter((c) => c.acknowledgedReason);
  const isBye = pairing.playerBId === null;

  return (
    <div
      className={cn(
        "rounded-compact border bg-[rgb(var(--c-surface))] p-3.5 transition-all",
        critical.length > 0
          ? "border-critical/35 bg-critical-050/35"
          : warnings.length > 0
            ? "border-warning/30 bg-warning-050/30"
            : "border-[rgb(var(--glass-border))]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-control text-[13px] font-semibold num",
              isBye ? "bg-[rgb(var(--c-line))] text-muted" : "bg-primary-050 text-primary",
            )}
          >
            {isBye ? "—" : pairing.board}
          </span>
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">
              {isBye ? "Bye" : `Board ${pairing.board}`}
            </p>
            <p className="text-[11.5px] text-faint">{pairing.division}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {pairing.locked ? (
            <Badge tone="primary" dot>
              Locked
            </Badge>
          ) : null}
          {critical.length > 0 ? (
            <Badge tone="critical" dot>
              {critical.length} conflict{critical.length > 1 ? "s" : ""}
            </Badge>
          ) : warnings.length > 0 ? (
            <Badge tone="warning" dot>
              Warning
            </Badge>
          ) : approved.length > 0 ? (
            <Badge tone="info" dot>
              Exception approved
            </Badge>
          ) : (
            <Badge tone="success" dot>
              Clear
            </Badge>
          )}
        </div>
      </div>

      {/* Players */}
      <div className="mt-3 space-y-1.5">
        <PlayerRow player={playerA} rank={rankA} />
        {isBye ? (
          <p className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-2 text-[12.5px] text-muted">
            No opponent — this player sits out the round and is credited with a win.
          </p>
        ) : (
          <PlayerRow player={playerB ?? undefined} rank={rankB} />
        )}
      </div>

      {!compact ? (
        <>
          {/* Reason */}
          <p className="mt-3 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2 text-[12px] leading-relaxed text-muted">
            {pairing.reason}
          </p>

          {/* Meta row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-success" />
              Confidence {pairing.confidence}%
            </span>
            {previousMeetings !== undefined ? (
              <span>
                Previous meetings:{" "}
                <span className={previousMeetings > 0 ? "font-semibold text-critical" : ""}>
                  {previousMeetings}
                </span>
              </span>
            ) : null}
            {pairing.manualOverride ? (
              <span className="text-primary">
                Manual change by {pairing.manualOverride.by}
              </span>
            ) : null}
          </div>

          {/* Conflicts */}
          {[...critical, ...warnings].length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {[...critical, ...warnings].map((c, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-[12px]",
                    c.severity === "critical"
                      ? "bg-critical/10 text-[#c93a51]"
                      : "bg-warning/12 text-[#b4741f]",
                  )}
                >
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {c.message}
                </li>
              ))}
            </ul>
          ) : null}

          {approved.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {approved.map((c, i) => (
                <li key={i} className="rounded-[10px] bg-secondary-050 px-2.5 py-1.5 text-[12px] text-[#2b7fd4]">
                  Director-approved exception: {c.acknowledgedReason}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Actions */}
          {(onLock || onResolve || onSwap) && !isBye ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {onResolve && (critical.length > 0 || warnings.length > 0) ? (
                <Button size="sm" variant="danger" onClick={onResolve}>
                  Review conflict
                </Button>
              ) : null}
              {onSwap ? (
                <Button size="sm" variant="secondary" onClick={onSwap}>
                  Swap players
                </Button>
              ) : null}
              {onLock ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onLock}
                  icon={
                    pairing.locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />
                  }
                >
                  {pairing.locked ? "Unlock" : "Lock pairing"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PlayerRow({ player, rank }: { player?: Player; rank?: number }) {
  if (!player) {
    return <div className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-2 text-[12.5px] text-faint">—</div>;
  }
  return (
    <div className="flex items-center gap-2.5 rounded-control bg-[rgb(var(--c-surface))] px-3 py-2">
      <Avatar initials={player.initials} hue={player.avatarHue} size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{player.fullName}</p>
        <p className="truncate text-[11.5px] text-muted">
          {player.playerId} · {player.rating || "Unrated"}
          {rank ? ` · rank ${rank}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-[12px] text-muted num">
        {player.wins}–{player.losses}
        {player.draws ? `–${player.draws}` : ""}
      </span>
    </div>
  );
}
