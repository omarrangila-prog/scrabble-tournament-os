"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Crown,
  Download,
  MapPin,
  Maximize2,
  MessageSquare,
  Printer,
  QrCode,
  Share2,
  Trophy,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Lightbox } from "./primitives";
import {
  CareerStats,
  flagOf,
  isVerified,
  onlineStatus,
  PLAYER_COUNTRY,
} from "@/lib/domain/profile";
import { Player } from "@/lib/domain/types";
import { cn, signed } from "@/lib/utils";

/**
 * Profile hero — the visual centrepiece. Cover banner, large portrait with
 * status and verification overlays, identity, headline figures and the quick
 * actions a director reaches for most often.
 */
export function ProfileHero({
  player,
  rank,
  previousRank,
  divisionName,
  record,
  stats,
  onAction,
}: {
  player: Player;
  rank?: number;
  previousRank?: number;
  divisionName: string;
  record: { wins: number; losses: number; draws: number; spread: number };
  stats: CareerStats;
  onAction: (action: "message" | "print" | "export" | "share") => void;
}) {
  const [lightbox, setLightbox] = React.useState(false);
  const status = onlineStatus(player);
  const verified = isVerified(player);
  const move = (previousRank ?? rank ?? 0) - (rank ?? 0);

  return (
    <>
      <div className="glass overflow-hidden rounded-feature">
        {/* Cover banner */}
        <div className="relative h-32 overflow-hidden sm:h-40">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, #6D5DFB 0%, #4BA8FF 46%, #32C997 100%)",
            }}
          />
          <div className="board-motif absolute inset-0 opacity-25" aria-hidden />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 120% at 15% 0%, rgba(255,255,255,0.32), transparent 60%)",
            }}
            aria-hidden
          />

          {/* Championship badges, top-right of the banner */}
          <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-1.5">
            {stats.titlesWon > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--c-surface-strong))] px-2.5 py-1 text-[11.5px] font-semibold text-[#b4741f] backdrop-blur-sm">
                <Crown className="size-3.5" />
                {stats.titlesWon > 1 ? `${stats.titlesWon}× Champion` : "Champion"}
              </span>
            ) : null}
            {player.seed <= 5 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--c-surface-strong))] px-2.5 py-1 text-[11.5px] font-semibold text-primary-600 backdrop-blur-sm">
                <Trophy className="size-3.5" />
                Seed {player.seed}
              </span>
            ) : null}
          </div>
        </div>

        {/* Identity row */}
        <div className="px-5 pb-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            {/* Portrait */}
            <motion.button
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              onClick={() => setLightbox(true)}
              aria-label={`Enlarge portrait of ${player.fullName}`}
              className="group relative -mt-14 shrink-0 self-start sm:-mt-16"
            >
              <span
                className="grid size-[104px] place-items-center rounded-[26px] text-[34px] font-semibold ring-4 ring-white transition-transform duration-300 group-hover:scale-[1.03] sm:size-[120px] sm:text-[40px]"
                style={{
                  background: `linear-gradient(135deg, hsl(${player.avatarHue} 78% 92%), hsl(${(player.avatarHue + 40) % 360} 76% 84%))`,
                  color: `hsl(${player.avatarHue} 55% 30%)`,
                  boxShadow: "0 16px 40px rgba(44,55,96,0.18)",
                }}
              >
                {player.initials}
              </span>

              {/* Online status */}
              <span
                className={cn(
                  "absolute bottom-2 right-2 size-5 rounded-full ring-4 ring-white",
                  status.online ? "bg-success" : "bg-faint",
                )}
                title={status.label}
                aria-hidden
              />

              {/* Verified overlay */}
              {verified ? (
                <span
                  className="absolute -left-1 top-2 grid size-7 place-items-center rounded-full bg-secondary text-white ring-3 ring-white"
                  title="Verified player"
                >
                  <BadgeCheck className="size-4" />
                </span>
              ) : null}

              {/* Rank badge */}
              {rank ? (
                <span
                  className={cn(
                    "absolute -top-1 right-0 grid min-w-7 place-items-center rounded-full px-1.5 py-0.5 text-[11.5px] font-bold text-white ring-3 ring-white num",
                    rank === 1 ? "bg-[#e0a32e]" : rank <= 3 ? "bg-primary" : "bg-ink/75",
                  )}
                >
                  #{rank}
                </span>
              ) : null}

              <span className="absolute inset-0 grid place-items-center rounded-[26px] bg-ink/0 opacity-0 transition-all duration-200 group-hover:bg-ink/25 group-hover:opacity-100">
                <Maximize2 className="size-6 text-white" />
              </span>
            </motion.button>

            {/* Name and meta */}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
                  {player.fullName}
                </h1>
                <span className="text-[20px]" aria-label={PLAYER_COUNTRY.name}>
                  {flagOf(PLAYER_COUNTRY.code)}
                </span>
                {verified ? (
                  <Badge tone="info" dot>
                    Verified
                  </Badge>
                ) : null}
                <Badge tone={status.online ? "success" : "neutral"} dot pulse={status.online}>
                  {status.label}
                </Badge>
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                <span className="font-semibold text-primary num">{player.playerId}</span>
                <span aria-hidden>·</span>
                <span>{divisionName}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {player.city}
                </span>
                <span aria-hidden>·</span>
                <span className="truncate">{player.club}</span>
              </p>
            </div>

            {/* QR + quick actions */}
            <div className="flex shrink-0 items-end gap-3">
              <div className="hidden rounded-compact border border-line-strong bg-white p-2 sm:block">
                <QrCode className="size-14 text-ink" />
                <p className="mt-1 text-center text-[9.5px] text-muted num">{player.playerId}</p>
              </div>
            </div>
          </div>

          {/* Headline figures */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            <HeroFigure label="Current rank" value={rank ? `#${rank}` : "—"} accent
              trend={move !== 0 ? { value: move, label: move > 0 ? "up" : "down" } : undefined} />
            <HeroFigure label="Rating" value={player.rating ? String(player.rating) : "Unrated"} />
            <HeroFigure label="Record" value={`${record.wins}–${record.losses}${record.draws ? `–${record.draws}` : ""}`} />
            <HeroFigure label="Spread" value={signed(record.spread)}
              tone={record.spread > 0 ? "success" : record.spread < 0 ? "critical" : "neutral"} />
            <HeroFigure label="Seed" value={`#${player.seed}`} />
            <HeroFigure label="Career win rate" value={`${stats.winRate}%`} />
          </div>

          {/* Quick actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon={<MessageSquare className="size-3.5" />} onClick={() => onAction("message")}>
              Message player
            </Button>
            <Button variant="secondary" size="sm" icon={<Printer className="size-3.5" />} onClick={() => onAction("print")}>
              Print player card
            </Button>
            <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={() => onAction("export")}>
              Export record
            </Button>
            <Button variant="ghost" size="sm" icon={<Share2 className="size-3.5" />} onClick={() => onAction("share")}>
              Copy profile link
            </Button>
          </div>
        </div>
      </div>

      <Lightbox
        open={lightbox}
        onClose={() => setLightbox(false)}
        caption={`${player.fullName} · ${player.playerId}`}
      >
        <span
          className="grid size-[min(70vw,340px)] place-items-center rounded-[40px] text-[110px] font-semibold ring-8 ring-white/25"
          style={{
            background: `linear-gradient(135deg, hsl(${player.avatarHue} 78% 92%), hsl(${(player.avatarHue + 40) % 360} 76% 84%))`,
            color: `hsl(${player.avatarHue} 55% 30%)`,
          }}
        >
          {player.initials}
        </span>
      </Lightbox>
    </>
  );
}

function HeroFigure({
  label,
  value,
  accent,
  tone = "neutral",
  trend,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "neutral" | "success" | "critical";
  trend?: { value: number; label: string };
}) {
  return (
    <div
      className={cn(
        "rounded-compact px-3 py-2.5",
        accent ? "bg-primary-050" : "bg-[rgb(var(--c-surface))]",
      )}
    >
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 flex items-baseline gap-1.5 text-[19px] font-semibold tracking-[-0.02em] num",
          tone === "success" && "text-[#1b8f68]",
          tone === "critical" && "text-[#c93a51]",
          tone === "neutral" && (accent ? "text-primary-600" : "text-ink"),
        )}
      >
        {value}
        {trend ? (
          <span
            className={cn(
              "text-[12px] font-semibold",
              trend.value > 0 ? "text-success" : "text-critical",
            )}
          >
            {trend.value > 0 ? "▲" : "▼"}
            {Math.abs(trend.value)}
          </span>
        ) : null}
      </p>
    </div>
  );
}
