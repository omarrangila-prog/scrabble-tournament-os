"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar, Badge, Button, Drawer } from "@/components/ui";
import Link from "next/link";
import { useStore } from "@/lib/store/useStore";
import { useRoster } from "@/lib/supabase/useRoster";
import { computeStandings } from "@/lib/engine/standings";
import { signed } from "@/lib/utils";
import { Player } from "@/lib/domain/types";

/* -------------------------------------------------------------------------- */
/* Player detail drawer                                                        */
/* -------------------------------------------------------------------------- */


export function PlayerDrawer({
  player,
  onClose,
}: {
  player: Player | null;
  onClose: () => void;
}) {
  const store = useStore();
  const { pairings, tournament } = store;
  // Same roster the list came from, so names resolve here too.
  const players = useRoster(ACTIVE_EVENT_ID).players;

  if (!player) return null;

  const games = pairings
    .filter(
      (p) =>
        (p.playerAId === player.id || p.playerBId === player.id) &&
        (p.status === "verified" || p.status === "bye"),
    )
    .sort((a, b) => a.round - b.round);

  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  // Rank after each round, for the progression chart.
  const progression = Array.from({ length: tournament.currentRound }, (_, i) => {
    const table = computeStandings(players, pairings, tournament, {
      division: player.division,
      upToRound: i + 1,
    });
    const row = table.find((r) => r.playerId === player.id);
    return { round: i + 1, rank: row?.rank ?? 0, spread: row?.spread ?? 0 };
  });

  const current = pairings.find(
    (p) => p.round === tournament.currentRound && (p.playerAId === player.id || p.playerBId === player.id),
  );

  const table = computeStandings(players, pairings, tournament, { division: player.division });
  const row = table.find((r) => r.playerId === player.id);

  return (
    <Drawer
      open={!!player}
      onClose={onClose}
      title={player.fullName}
      subtitle={`${player.playerId} · ${player.club} · ${player.city}`}
      width="lg"
      footer={
        <Link href={`/app/players/${player.playerId}`}>
          <Button variant="primary" className="w-full">
            Open full profile
          </Button>
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center gap-4 rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <Avatar initials={player.initials} hue={player.avatarHue} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">Rank {row?.rank ?? "—"}</Badge>
              <Badge tone="neutral">Seed {player.seed}</Badge>
              <Badge tone={player.ratingStatus === "rated" ? "success" : "warning"}>
                {player.ratingStatus === "unrated" ? "Unrated" : `${player.rating} ${player.ratingStatus}`}
              </Badge>
            </div>
            <p className="mt-1.5 text-[13px] text-muted num">
              {row?.wins ?? 0}–{row?.losses ?? 0}
              {row?.draws ? `–${row.draws}` : ""} · spread {signed(row?.spread ?? 0)} · performance{" "}
              {row?.performance ?? "—"}
            </p>
          </div>
        </div>

        {/* Current pairing */}
        {current ? (
          <div className="rounded-compact bg-primary-050/60 p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-primary-600">
              Current pairing
            </p>
            <p className="mt-1 text-[13.5px] text-ink">
              {current.playerBId === null
                ? "Bye this round"
                : `Board ${current.board} versus ${nameOf(
                    current.playerAId === player.id ? current.playerBId : current.playerAId,
                  )}`}
            </p>
          </div>
        ) : null}

        {/* Rank progression */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Rank progression</p>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progression} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="round"
                  tick={{ fontSize: 11, fill: "#667085" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  reversed
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#667085" }}
                  axisLine={false}
                  tickLine={false}
                />
                <RTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.9)",
                    background: "rgba(255,255,255,0.96)",
                    fontSize: 12,
                  }}
                  formatter={(v) => [`Rank ${v}`, ""] as [string, string]}
                  labelFormatter={(l) => `Round ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="rank"
                  stroke="#6D5DFB"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#6D5DFB" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Round by round */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Round-by-round results</p>
          <div className="mt-2 space-y-1.5">
            {games.length === 0 ? (
              <p className="text-[12.5px] text-muted">No completed games yet.</p>
            ) : (
              games.map((g) => {
                const isA = g.playerAId === player.id;
                const mine = isA ? g.scoreA : g.scoreB;
                const theirs = isA ? g.scoreB : g.scoreA;
                const opp = nameOf(isA ? g.playerBId : g.playerAId);
                const won = g.playerBId === null || (mine ?? 0) > (theirs ?? 0);
                const tie = mine === theirs;
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2"
                  >
                    <span className="w-14 shrink-0 text-[11.5px] text-muted">Round {g.round}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{opp}</span>
                    <span className="shrink-0 text-[12.5px] num text-muted">
                      {g.playerBId === null ? "Bye" : `${mine} – ${theirs}`}
                    </span>
                    <Badge tone={g.playerBId === null ? "neutral" : tie ? "warning" : won ? "success" : "critical"}>
                      {g.playerBId === null ? "Bye" : tie ? "Tie" : won ? "Won" : "Lost"}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Player details */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Player record</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <Detail label="Division" value={player.division.replace(/-/g, " ")} />
            <Detail label="City" value={player.city} />
            <Detail label="Club / school" value={player.club} />
            <Detail label="Check-in" value={player.checkIn.replace(/-/g, " ")} />
            <Detail label="Payment" value={player.payment} />
            <Detail label="Boards played" value={player.boardHistory.join(", ") || "—"} />
            <Detail
              label="Emergency contact"
              value={`${player.emergencyContact.name} (${player.emergencyContact.relationship})`}
            />
            <Detail label="Contact number" value={player.emergencyContact.phone} />
          </dl>
          {player.accommodation ? (
            <p className="mt-3 rounded-control bg-warning-050 px-3 py-2 text-[12.5px] text-[#b4741f]">
              Special accommodation: {player.accommodation}
            </p>
          ) : null}
        </div>

        {/* Tournament history */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Tournament history</p>
          <ul className="mt-2 space-y-1">
            {player.tournamentHistory.map((h, i) => (
              <li key={i} className="flex justify-between rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2 text-[12.5px]">
                <span className="text-ink">
                  {h.year} · {h.event}
                </span>
                <span className="text-muted">{h.place}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 capitalize text-ink">{value}</dd>
    </div>
  );
}
