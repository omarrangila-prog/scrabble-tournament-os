"use client";

import * as React from "react";
import { BadgeCheck, Download, QrCode, ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import {
  CATEGORY_LABEL,
  PlayerIdentity,
  fullNameOf,
  qrPayload,
} from "@/lib/domain/identity";
import { cn, formatDate } from "@/lib/utils";

/**
 * The Digital Player ID — the master identity artifact. Everything else in the
 * platform references the Player ID printed here.
 */
export function DigitalPlayerCard({
  identity,
  hue,
  initials,
  rating,
  ranking,
  status,
  compact = false,
  onDownload,
}: {
  identity: PlayerIdentity;
  hue: number;
  initials: string;
  rating?: number;
  ranking?: number;
  status?: string;
  compact?: boolean;
  onDownload?: () => void;
}) {
  const name = fullNameOf(identity);

  return (
    <div className="overflow-hidden rounded-card border border-[rgb(var(--glass-border))] bg-white shadow-[0_18px_46px_rgba(44,55,96,0.16)]">
      {/* Card header */}
      <div className="relative overflow-hidden px-5 py-3.5">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(115deg,#6D5DFB 0%,#4BA8FF 55%,#32C997 100%)" }}
        />
        <div className="board-motif absolute inset-0 opacity-25" aria-hidden />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">
              Scrabble Tournament OS
            </p>
            <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-white">
              Official Player Identity
            </p>
          </div>
          {identity.verified ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--c-surface-strong))] px-2 py-0.5 text-[10.5px] font-semibold text-secondary">
              <BadgeCheck className="size-3" />
              Verified
            </span>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-4 p-5">
        <div className="shrink-0">
          <span
            className="grid size-[86px] place-items-center rounded-compact text-[30px] font-semibold ring-2 ring-white"
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 78% 92%), hsl(${(hue + 40) % 360} 76% 84%))`,
              color: `hsl(${hue} 55% 30%)`,
              boxShadow: "0 8px 22px rgba(44,55,96,0.14)",
            }}
          >
            {initials}
          </span>
          <p className="mt-1.5 text-center text-[9.5px] uppercase tracking-[0.08em] text-faint">
            Official photo
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold tracking-[-0.015em] text-ink">{name}</p>
          <p className="mt-0.5 text-[15px] font-bold text-primary num">{identity.playerId}</p>

          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
            <Field label="Category" value={CATEGORY_LABEL[identity.category]} />
            <Field label="Nationality" value={identity.nationality} />
            {rating !== undefined ? (
              <Field label="Rating" value={rating ? String(rating) : "Unrated"} />
            ) : null}
            {ranking !== undefined ? <Field label="Ranking" value={`#${ranking}`} /> : null}
            <Field label="Club" value={identity.club} />
            <Field label="Registered" value={formatDate(identity.registeredAt)} />
          </dl>
        </div>

        <div className="hidden shrink-0 flex-col items-center justify-between sm:flex">
          <div className="rounded-control border border-line-strong bg-white p-1.5">
            <QrCode className="size-[68px] text-ink" />
          </div>
          <p className="mt-1 max-w-[84px] break-all text-center text-[8px] leading-tight text-faint">
            {qrPayload(identity.playerId)}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#fbfbff] px-5 py-3">
        {status ? (
          <Badge tone={status === "checked-in" ? "success" : "neutral"} dot>
            {status.replace(/-/g, " ")}
          </Badge>
        ) : null}
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          <ShieldCheck className="size-3.5 text-success" />
          Permanent identity — valid for every event
        </span>
        {!compact && onDownload ? (
          <Button size="sm" variant="ghost" className="ml-auto" icon={<Download className="size-3.5" />} onClick={onDownload}>
            Download
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] uppercase tracking-[0.06em] text-faint">{label}</dt>
      <dd className={cn("truncate text-[11.5px] font-medium text-ink")}>{value}</dd>
    </div>
  );
}
