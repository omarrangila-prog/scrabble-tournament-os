"use client";

import * as React from "react";
import { Check, PenLine, QrCode, Upload } from "lucide-react";
import { Badge, Button, Textarea } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { Pairing } from "@/lib/domain/types";
import { PsaLogo } from "@/components/brand/PsaLogo";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Digital result slip — the mobile-first record both players confirm.
 * Confirmation order: player A → player B → scorekeeper verification → final.
 */
export function ResultSlip({ pairing }: { pairing: Pairing }) {
  const store = useStore();
  const { players, tournament, submissions } = store;
  const a = players.find((p) => p.id === pairing.playerAId);
  const b = pairing.playerBId ? players.find((p) => p.id === pairing.playerBId) : null;

  const existing = submissions.filter((s) => s.pairingId === pairing.id);
  const [confirmA, setConfirmA] = React.useState(existing[0]?.confirmedByA ?? false);
  const [confirmB, setConfirmB] = React.useState(existing[1]?.confirmedByB ?? false);
  const [note, setNote] = React.useState("");

  const final = pairing.status === "verified";
  const scoreA = pairing.scoreA;
  const scoreB = pairing.scoreB;
  const hasScores = scoreA !== undefined && scoreB !== undefined;
  const winner =
    hasScores && scoreA !== scoreB ? (scoreA! > scoreB! ? a?.fullName : b?.fullName) : "Tie";

  return (
    <div className="space-y-4">
      {/* Slip header */}
      <div className="rounded-compact border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-strong))] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <PsaLogo variant="mark" size={34} />
            <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">
              {tournament.name.replace(" — Demo", "")}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              Round {pairing.round} · Board {pairing.board} ·{" "}
              <span className="capitalize">{pairing.division.replace(/-/g, " ")}</span>
            </p>
            </div>
          </div>
          <span className="grid size-14 shrink-0 place-items-center rounded-control border border-line-strong bg-white">
            <QrCode className="size-9 text-ink" />
          </span>
        </div>

        {/* Scores */}
        <div className="mt-4 space-y-2">
          <SlipRow
            name={a?.fullName ?? "—"}
            playerId={a?.playerId ?? ""}
            score={scoreA}
            winner={hasScores && scoreA! > scoreB!}
          />
          <SlipRow
            name={b?.fullName ?? "Bye"}
            playerId={b?.playerId ?? ""}
            score={scoreB}
            winner={hasScores && scoreB! > scoreA!}
          />
        </div>

        {hasScores ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2">
              <p className="text-[11px] text-muted">Winner</p>
              <p className="truncate text-[13px] font-semibold text-ink">{winner}</p>
            </div>
            <div className="rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2">
              <p className="text-[11px] text-muted">Spread</p>
              <p className="text-[13px] font-semibold text-ink num">
                {Math.abs((scoreA ?? 0) - (scoreB ?? 0))}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-control bg-[rgb(var(--c-surface))] px-3 py-2 text-[12.5px] text-muted">
            This game is still in progress. Scores appear once submitted.
          </p>
        )}

        <dl className="mt-3 space-y-1 text-[11.5px]">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Completed</dt>
            <dd className="text-ink">{formatDateTime(pairing.completedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Submission device</dt>
            <dd className="text-ink">{existing[0]?.device ?? "Scorekeeper terminal"}</dd>
          </div>
        </dl>
      </div>

      {/* Confirmation workflow */}
      <div className="rounded-compact border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] p-4">
        <p className="text-[13px] font-semibold text-ink">Confirmation</p>
        <div className="mt-2.5 space-y-2">
          <ConfirmRow
            label={`${a?.fullName ?? "Player A"} confirms`}
            checked={confirmA || final}
            disabled={final}
            onToggle={() => setConfirmA((v) => !v)}
          />
          <ConfirmRow
            label={`${b?.fullName ?? "Player B"} confirms`}
            checked={confirmB || final}
            disabled={final || (!confirmA && !final)}
            onToggle={() => setConfirmB((v) => !v)}
          />
          <ConfirmRow
            label="Scorekeeper verification"
            checked={final}
            disabled
            onToggle={() => undefined}
          />
        </div>

        {final ? (
          <div className="mt-3 flex items-center gap-2 rounded-control bg-success-050 px-3 py-2.5">
            <Check className="size-4 shrink-0 text-success" />
            <p className="text-[12.5px] font-medium text-[#1b8f68]">
              Verified and included in standings.
            </p>
          </div>
        ) : (
          <Button
            variant="primary"
            className="mt-3 w-full"
            disabled={!confirmA || !confirmB || !hasScores}
            onClick={() => {
              if (!store.requireCapability("scores.verify")) return;
              store.verifyResult(pairing.id);
              store.toast({
                title: "Result finalised",
                description: `Board ${pairing.board} is verified and included in standings.`,
                tone: "success",
              });
            }}
          >
            Verify and finalise
          </Button>
        )}
      </div>

      {/* Signatures and evidence */}
      <div className="rounded-compact border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] p-4">
        <p className="text-[13px] font-semibold text-ink">Signatures and evidence</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {[a?.fullName, b?.fullName].map((n, i) => (
            <div key={i} className="rounded-control border border-line-strong bg-[rgb(var(--c-surface-strong))] p-3">
              <PenLine className="size-4 text-faint" />
              <p className="mt-4 border-t border-line-strong pt-1 text-[11px] text-muted">
                {n ?? "—"}
              </p>
            </div>
          ))}
        </div>

        <button
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-control border border-dashed border-line-strong px-3 py-3 text-[12.5px] text-muted transition-colors hover:border-primary/40 hover:text-ink"
          onClick={() =>
            store.toast({
              title: "Result slip image attached",
              description: "The photograph was stored with this result for audit purposes.",
              tone: "success",
            })
          }
        >
          <Upload className="size-4" />
          Upload result-slip image
        </button>

        <div className="mt-3">
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Notes</label>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note recorded with this result"
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="mt-2.5 w-full"
          onClick={() =>
            store.toast({
              title: "Correction requested",
              description: "The Tournament Director was notified and will review this board.",
              tone: "info",
            })
          }
        >
          Request a correction
        </Button>
      </div>
    </div>
  );
}

function SlipRow({
  name,
  playerId,
  score,
  winner,
}: {
  name: string;
  playerId: string;
  score?: number;
  winner: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-control px-3 py-2.5",
        winner ? "bg-success-050/70" : "bg-[rgb(var(--c-surface-strong))]",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-ink">{name}</p>
        <p className="text-[11.5px] text-muted">{playerId}</p>
      </div>
      {winner ? <Badge tone="success">Winner</Badge> : null}
      <p className="w-14 text-right text-[19px] font-semibold text-ink num">
        {score === undefined ? "—" : score}
      </p>
    </div>
  );
}

function ConfirmRow({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left transition-colors",
        checked ? "bg-success-050/70" : "bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-strong))]",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border",
          checked ? "border-success bg-success text-white" : "border-[rgb(17_22_43/0.2)]",
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      <span className="text-[12.5px] text-ink">{label}</span>
    </button>
  );
}
