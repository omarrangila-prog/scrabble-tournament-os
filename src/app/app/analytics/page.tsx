"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Clock, TrendingUp, Zap } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, Progress, Stat } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { computeStandings } from "@/lib/engine/standings";
import { useGames } from "@/lib/supabase/useGames";
import { useRoster } from "@/lib/supabase/useRoster";
import { RosterGate } from "@/components/organizer/RosterGate";
import { cn } from "@/lib/utils";

const TOOLTIP = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.97)",
  fontSize: 12,
} as const;

const DIVISION_COLOR: Record<string, string> = {
  masters: "#6D5DFB",
  open: "#4BA8FF",
  "recreational": "#32C997",
  "beginner": "#F5A94A",
};


export default function AnalyticsPage() {
  const store = useStore();
  const { tournament, divisions, audit } = store;

  /*
   * Players and games come from the database. Every figure on this page is derived
   * from them, so reading an empty browser store meant every chart showed zero
   * however much had actually happened.
   */
  const roster = useRoster(ACTIVE_EVENT_ID);
  const players = roster.players;
  const games = useGames(ACTIVE_EVENT_ID, tournament.id);
  const pairings = games.pairings;

  const verified = pairings.filter((p) => p.status === "verified" && p.scoreA !== undefined);

  /* Round completion --------------------------------------------------- */
  const roundCompletion = Array.from({ length: tournament.currentRound }, (_, i) => {
    const r = i + 1;
    const inRound = pairings.filter((p) => p.round === r && p.playerBId);
    const done = inRound.filter((p) => p.status === "verified").length;
    return {
      round: `R${r}`,
      completion: inRound.length ? Math.round((done / inRound.length) * 100) : 0,
      played: done,
      total: inRound.length,
    };
  });

  /* Scores -------------------------------------------------------------- */
  const winningScores = verified.map((p) => Math.max(p.scoreA!, p.scoreB!));
  const spreads = verified.map((p) => Math.abs(p.scoreA! - p.scoreB!));
  const avgWinning = winningScores.length
    ? Math.round(winningScores.reduce((a, b) => a + b, 0) / winningScores.length)
    : 0;
  const avgSpread = spreads.length
    ? Math.round(spreads.reduce((a, b) => a + b, 0) / spreads.length)
    : 0;

  /* Upsets: lower-rated player beat a higher-rated one ------------------- */
  const upsetsByRound = Array.from({ length: tournament.currentRound }, (_, i) => {
    const r = i + 1;
    let upsets = 0;
    for (const p of verified.filter((x) => x.round === r)) {
      const a = players.find((x) => x.id === p.playerAId);
      const b = players.find((x) => x.id === p.playerBId);
      if (!a || !b || !a.rating || !b.rating) continue;
      const aWon = p.scoreA! > p.scoreB!;
      const favourite = a.rating >= b.rating ? a : b;
      const winner = aWon ? a : b;
      // Only count a meaningful rating gap as an upset.
      if (winner.id !== favourite.id && Math.abs(a.rating - b.rating) > 80) upsets += 1;
    }
    return { round: `R${r}`, upsets };
  });
  const totalUpsets = upsetsByRound.reduce((a, b) => a + b.upsets, 0);

  /* Division progress --------------------------------------------------- */
  const divisionProgress = divisions.map((d) => {
    const inDiv = pairings.filter(
      (p) => p.round === tournament.currentRound && p.division === d.id && p.playerBId,
    );
    const done = inDiv.filter((p) => p.status === "verified").length;
    return {
      id: d.id,
      name: d.name,
      short: d.shortName,
      done,
      total: inDiv.length,
      pct: inDiv.length ? Math.round((done / inDiv.length) * 100) : 100,
    };
  });
  const slowest = [...divisionProgress].sort((a, b) => a.pct - b.pct)[0];

  /* Score corrections by round ------------------------------------------ */
  const corrections = audit.filter((a) => a.action.toLowerCase().includes("correct"));
  const correctionsByRound = Array.from({ length: tournament.currentRound }, (_, i) => {
    const r = i + 1;
    return {
      round: `R${r}`,
      corrections: corrections.filter((c) => c.target.includes(`Round ${r}`)).length,
    };
  });

  /* Board utilisation and late submissions ------------------------------ */
  const boardStats = React.useMemo(() => {
    const map = new Map<number, { board: number; games: number; late: number }>();
    for (const p of pairings.filter((x) => x.playerBId && x.board > 0)) {
      const entry = map.get(p.board) ?? { board: p.board, games: 0, late: 0 };
      entry.games += 1;
      // A completion after 12:30 counts as a late submission in the demo data.
      if (p.completedAt && new Date(p.completedAt).getUTCHours() >= 7) entry.late += 1;
      map.set(p.board, entry);
    }
    return [...map.values()].sort((a, b) => b.late - a.late).slice(0, 10);
  }, [pairings]);

  /* Attendance ---------------------------------------------------------- */
  const attendance = {
    checkedIn: players.filter((p) => p.checkIn === "checked-in").length,
    late: players.filter((p) => p.checkIn === "late").length,
    absent: players.filter((p) => p.checkIn === "absent").length,
    withdrawn: players.filter((p) => p.checkIn === "withdrawn").length,
  };

  const byes = pairings.filter((p) => p.playerBId === null);
  const byesByDivision = divisions.map((d) => ({
    name: d.shortName,
    byes: byes.filter((b) => b.division === d.id).length,
  }));

  /* Rank movement -------------------------------------------------------- */
  const movement = React.useMemo(() => {
    /*
     * Over the divisions this event has. This asked for "masters", which the user
     * removed, so the movement chart was always empty.
     */
    const table = divisions.flatMap((d) =>
      computeStandings(players, pairings, tournament, { division: d.id }),
    );
    return table
      .map((r) => ({
        name: players.find((p) => p.id === r.playerId)?.fullName.split(" ")[0] ?? "",
        change: r.previousRank - r.rank,
      }))
      .filter((r) => r.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 8);
  }, [players, pairings, tournament, divisions]);

  /* Forecast ------------------------------------------------------------- */
  // Counted from the rounds actually played, not a stored counter.
  const remainingRounds = Math.max(0, tournament.totalRounds - games.round);
  const minutesPerRound = tournament.gameMinutes + tournament.breakMinutes;
  const forecastMinutes = remainingRounds * minutesPerRound;
  const forecastHours = Math.floor(forecastMinutes / 60);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Analytics"
        badge={
          games.round > 0 ? (
            <Badge tone="primary">Round {games.round}</Badge>
          ) : (
            <Badge tone="neutral">Not started</Badge>
          )
        }
        subtitle="Operational reporting: what is slowing the tournament down, where corrections happen, and how the field is performing."
      />

      <RosterGate access={roster.access} loaded={roster.loaded && games.loaded}>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Games completed" value={verified.length} icon={<BarChart3 className="size-4.5" />} tone="success" />
        <Stat label="Average winning score" value={avgWinning} sub="Across verified games" />
        <Stat label="Average spread" value={avgSpread} sub="Points" />
        <Stat label="Upsets by rating" value={totalUpsets} icon={<Zap className="size-4.5" />} tone="warning" />
        <Stat label="Score corrections" value={corrections.length} tone={corrections.length ? "warning" : "success"} />
        <Stat
          label="Forecast finish"
          value={`${forecastHours}h`}
          sub={`${remainingRounds} rounds remaining`}
          icon={<Clock className="size-4.5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Which division is delaying the tournament? */}
        <Card>
          <CardHeader
            title="Which division is delaying the tournament?"
            subtitle={
              slowest && slowest.pct < 100
                ? `${slowest.name} is furthest behind at ${slowest.pct}% of round ${tournament.currentRound} verified.`
                : "All divisions have completed the current round."
            }
          />
          <div className="space-y-2 px-5 pb-5">
            {divisionProgress.map((d) => (
              <div key={d.id} className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <span className="size-2 rounded-full" style={{ background: DIVISION_COLOR[d.id] }} />
                    {d.name}
                  </span>
                  <span className="text-[12px] text-muted num">
                    {d.done}/{d.total} verified · {d.pct}%
                  </span>
                </div>
                <Progress
                  value={d.pct}
                  className="mt-1.5"
                  tone={d.pct >= 90 ? "success" : d.pct >= 50 ? "primary" : "warning"}
                  label={`${d.name} progress`}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Round completion */}
        <Card>
          <CardHeader
            title="Round completion rate"
            subtitle="Share of boards verified in each round"
          />
          <div className="h-64 px-4 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roundCompletion} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.07)" vertical={false} />
                <XAxis dataKey="round" tick={{ fontSize: 12, fill: "#667085" }} axisLine={false} tickLine={false} />
                <YAxis unit="%" tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                <RTooltip
                  cursor={{ fill: "rgba(109,93,251,0.06)" }}
                  contentStyle={TOOLTIP}
                  formatter={(v) => [`${v}% verified`, ""] as [string, string]}
                />
                <Bar dataKey="completion" radius={[8, 8, 0, 0]}>
                  {roundCompletion.map((r) => (
                    <Cell key={r.round} fill={r.completion === 100 ? "#32C997" : "#F5A94A"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Upsets */}
        <Card>
          <CardHeader
            title="How many upsets occurred?"
            subtitle="Games won by the lower-rated player, by round"
          />
          <div className="h-64 px-4 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={upsetsByRound} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.07)" vertical={false} />
                <XAxis dataKey="round" tick={{ fontSize: 12, fill: "#667085" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                <RTooltip contentStyle={TOOLTIP} formatter={(v) => [`${v} upsets`, ""] as [string, string]} />
                <Line type="monotone" dataKey="upsets" stroke="#EF5B72" strokeWidth={2.5} dot={{ r: 3.5, fill: "#EF5B72" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Corrections */}
        <Card>
          <CardHeader
            title="Which rounds had the most score corrections?"
            subtitle={
              corrections.length === 0
                ? "No corrections have been recorded in this tournament."
                : `${corrections.length} correction${corrections.length === 1 ? "" : "s"} recorded so far.`
            }
          />
          <div className="h-64 px-4 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={correctionsByRound} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.07)" vertical={false} />
                <XAxis dataKey="round" tick={{ fontSize: 12, fill: "#667085" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                <RTooltip cursor={{ fill: "rgba(239,91,114,0.06)" }} contentStyle={TOOLTIP} />
                <Bar dataKey="corrections" fill="#EF5B72" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Late boards */}
        <Card>
          <CardHeader
            title="Which boards repeatedly submit late?"
            subtitle="Boards with the most late result submissions"
          />
          <div className="px-5 pb-5">
            {boardStats.length === 0 ? (
              <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-4 text-center text-[12.5px] text-muted">
                No late submissions recorded.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {boardStats.map((b) => (
                  <li key={b.board} className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-primary-050 text-[12px] font-semibold text-primary num">
                      {b.board}
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] text-ink">
                      {b.games} game{b.games === 1 ? "" : "s"} played
                    </span>
                    <Badge tone={b.late > 2 ? "warning" : "neutral"}>
                      {b.late} late
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Rank movement */}
        <Card>
          <CardHeader
            title="Rank movement"
            subtitle="Largest changes in the Masters standings"
            icon={<TrendingUp className="size-4.5" />}
          />
          <div className="px-5 pb-5">
            {movement.length === 0 ? (
              <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-4 text-center text-[12.5px] text-muted">
                No rank changes since the last verified result.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {movement.map((m) => (
                  <li key={m.name} className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{m.name}</span>
                    <span
                      className={cn(
                        "text-[12.5px] font-semibold num",
                        m.change > 0 ? "text-success" : "text-critical",
                      )}
                    >
                      {m.change > 0 ? "▲" : "▼"} {Math.abs(m.change)} place
                      {Math.abs(m.change) === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Attendance + byes */}
        <Card>
          <CardHeader title="Player attendance" subtitle="Current status across the field" />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Checked in", attendance.checkedIn, "success"],
                ["Late", attendance.late, "warning"],
                ["Absent", attendance.absent, "critical"],
                ["Withdrawn", attendance.withdrawn, "critical"],
              ].map(([label, value, tone]) => (
                <div
                  key={String(label)}
                  className={cn(
                    "rounded-control px-3.5 py-2.5",
                    tone === "success" && "bg-success-050/70",
                    tone === "warning" && "bg-warning-050/70",
                    tone === "critical" && "bg-critical-050/70",
                  )}
                >
                  <p className="text-[19px] font-semibold text-ink num">{value as number}</p>
                  <p className="text-[11.5px] text-muted">{label as string}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bye allocation" subtitle={`${byes.length} byes allocated in total`} />
          <div className="px-5 pb-5">
            {byes.length === 0 ? (
              <p className="rounded-control bg-success-050/60 px-3.5 py-4 text-center text-[12.5px] text-[#1b8f68]">
                No byes were required — every division had an even field in every round.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {byesByDivision.map((b) => (
                  <li key={b.name} className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2">
                    <span className="text-[12.5px] text-ink">{b.name}</span>
                    <span className="text-[12.5px] font-semibold text-ink num">{b.byes}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </RosterGate>
    </div>
  );
}
