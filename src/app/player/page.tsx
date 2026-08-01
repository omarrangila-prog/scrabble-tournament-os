"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  Flag,
  Home,
  ListOrdered,
  MapPin,
  MoreHorizontal,
  Send,
  Swords,
  Trophy,
} from "lucide-react";
import { Avatar, Badge, Button, Field, Input, Select } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { computeStandings } from "@/lib/engine/standings";
import { DEMO_PLAYER_A } from "@/lib/domain/seed";
import { cn, formatTime, signed } from "@/lib/utils";

type Tab = "home" | "pairing" | "standings" | "results" | "more";

const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "pairing", label: "Pairing", icon: Swords },
  { id: "standings", label: "Standings", icon: ListOrdered },
  { id: "results", label: "Results", icon: Trophy },
  { id: "more", label: "More", icon: MoreHorizontal },
];

/**
 * Player-facing mobile view. Rendered inside a phone frame on desktop so the
 * client can see the mobile experience during the presentation.
 */
export default function PlayerAppPage() {
  const store = useStore();
  const { players, pairings, tournament, announcements } = store;
  const [tab, setTab] = React.useState<Tab>("home");
  const [playerId, setPlayerId] = React.useState(DEMO_PLAYER_A);

  const me = players.find((p) => p.playerId === playerId) ?? players[0];

  const myPairing = pairings.find(
    (p) => p.round === tournament.currentRound && (p.playerAId === me.id || p.playerBId === me.id),
  );
  const opponentId = myPairing
    ? myPairing.playerAId === me.id
      ? myPairing.playerBId
      : myPairing.playerAId
    : null;
  const opponent = opponentId ? players.find((p) => p.id === opponentId) : null;

  const table = computeStandings(players, pairings, tournament, { division: me.division });
  const myRow = table.find((r) => r.playerId === me.id);

  const myGames = pairings
    .filter(
      (p) =>
        (p.playerAId === me.id || p.playerBId === me.id) &&
        (p.status === "verified" || p.status === "bye"),
    )
    .sort((a, b) => b.round - a.round);

  const previousMeeting = pairings.find(
    (p) =>
      p.round < tournament.currentRound &&
      opponentId &&
      ((p.playerAId === me.id && p.playerBId === opponentId) ||
        (p.playerBId === me.id && p.playerAId === opponentId)),
  );

  const notifications = [
    { id: 1, text: `Round ${tournament.currentRound + 1} pairings are available`, time: "2 min ago", tone: "primary" as const },
    { id: 2, text: "Your board has changed from 18 to 22", time: "14 min ago", tone: "warning" as const },
    { id: 3, text: `Your Round ${tournament.currentRound - 1} result has been verified`, time: "48 min ago", tone: "success" as const },
    { id: 4, text: "Next round begins in 10 minutes", time: "1 h ago", tone: "info" as const },
  ];

  return (
    <div className="min-h-dvh px-0 py-0 sm:px-6 sm:py-8">
      {/* Desktop framing */}
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
        <div className="hidden max-w-sm lg:block">
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">
            Player mobile experience
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Every player sees their own pairing, board number and result submission on their phone.
            Nothing here requires an app store download — it runs in the browser.
          </p>

          <div className="mt-5">
            <Field label="Preview as player">
              <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                {players.slice(0, 40).map((p) => (
                  <option key={p.id} value={p.playerId}>
                    {p.fullName} — {p.playerId}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <ul className="mt-5 space-y-2">
            {[
              "Next pairing with board number and start time",
              "Submit a result and confirm the opponent's score",
              "Live standings and personal rank movement",
              "Push notifications for board changes and round starts",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13.5px] text-ink">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                {f}
              </li>
            ))}
          </ul>

          <Link href="/live" className="mt-5 inline-block text-[13px] text-primary underline underline-offset-2">
            View the public tournament site
          </Link>
        </div>

        {/* Phone frame */}
        <div className="w-full sm:w-[390px]">
          <div className="glass-raised flex h-dvh w-full flex-col overflow-hidden rounded-none sm:h-[780px] sm:rounded-[38px] sm:border-[10px] sm:border-[#11162b]/85">
            {/* Status bar */}
            <div className="flex items-center justify-between px-5 pt-3 text-[11.5px] text-muted">
              <span className="num">{formatTime(new Date().toISOString())}</span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-success pulse-dot" />
                Live
              </span>
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3">
              <Avatar initials={me.initials} hue={me.avatarHue} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {me.fullName}
                </p>
                <p className="truncate text-[12px] text-muted">
                  {me.playerId} · <span className="capitalize">{me.division.replace(/-/g, " ")}</span>
                </p>
              </div>
              <button
                className="relative rounded-full p-2 text-muted hover:bg-[rgb(var(--c-line))]"
                onClick={() => setTab("more")}
                aria-label="Notifications"
              >
                <Bell className="size-4.5" />
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-critical" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 scroll-slim">
              {tab === "home" ? (
                <div className="space-y-3">
                  {/* Next pairing */}
                  <div className="rounded-card bg-primary p-4 text-white">
                    <p className="text-[11.5px] uppercase tracking-[0.08em] opacity-85">
                      Round {tournament.currentRound} · your game
                    </p>
                    {myPairing?.playerBId === null ? (
                      <p className="mt-2 text-[19px] font-semibold">You have a bye this round</p>
                    ) : (
                      <>
                        <p className="mt-2 text-[21px] font-semibold tracking-[-0.02em]">
                          Board {myPairing?.board ?? "—"}
                        </p>
                        <p className="mt-1 text-[14px] opacity-95">
                          versus {opponent?.fullName ?? "—"}
                        </p>
                        <div className="mt-3 flex items-center gap-3 text-[12px] opacity-90">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" />
                            Hall A
                          </span>
                          <span>Start 11:15</span>
                        </div>
                      </>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3 w-full !bg-[rgb(var(--c-surface-strong))] !text-primary"
                      onClick={() => setTab("pairing")}
                    >
                      View pairing details
                    </Button>
                  </div>

                  {/* Personal standing */}
                  <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                      Your standing
                    </p>
                    <div className="mt-2 flex items-end gap-4">
                      <div>
                        <p className="text-[30px] font-semibold leading-none text-ink num">
                          {myRow?.rank ?? "—"}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-muted">Rank</p>
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[16px] font-semibold text-ink num">{myRow?.wins ?? 0}</p>
                          <p className="text-[10.5px] text-muted">Won</p>
                        </div>
                        <div>
                          <p className="text-[16px] font-semibold text-ink num">{myRow?.losses ?? 0}</p>
                          <p className="text-[10.5px] text-muted">Lost</p>
                        </div>
                        <div>
                          <p className="text-[16px] font-semibold text-ink num">
                            {signed(myRow?.spread ?? 0)}
                          </p>
                          <p className="text-[10.5px] text-muted">Spread</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tournament progress */}
                  <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[12.5px] text-muted">Tournament progress</p>
                      <p className="text-[13px] font-semibold text-ink num">
                        Round {tournament.currentRound} of {tournament.totalRounds}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {Array.from({ length: tournament.totalRounds }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1.5 flex-1 rounded-full",
                            i < tournament.currentRound - 1
                              ? "bg-success"
                              : i === tournament.currentRound - 1
                                ? "bg-primary"
                                : "bg-[rgb(var(--c-line-strong))]",
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Latest announcement */}
                  {announcements[0] ? (
                    <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                        Latest announcement
                      </p>
                      <p className="mt-1.5 text-[13.5px] font-semibold text-ink">
                        {announcements[0].title}
                      </p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                        {announcements[0].body}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === "pairing" ? (
                <PairingTab
                  me={me}
                  opponent={opponent ?? null}
                  board={myPairing?.board}
                  previousMeeting={!!previousMeeting}
                  pairingId={myPairing?.id}
                />
              ) : null}

              {tab === "standings" ? (
                <div className="space-y-1.5">
                  <p className="px-1 py-2 text-[12.5px] text-muted">
                    {me.division.replace(/-/g, " ")} · {table.length} players
                  </p>
                  {table.slice(0, 25).map((r) => {
                    const p = players.find((x) => x.id === r.playerId);
                    if (!p) return null;
                    const mine = r.playerId === me.id;
                    const move = r.previousRank - r.rank;
                    return (
                      <div
                        key={r.playerId}
                        className={cn(
                          "flex items-center gap-2.5 rounded-control px-3 py-2",
                          mine ? "bg-primary-050 ring-1 ring-primary/25" : "bg-[rgb(var(--c-surface))]",
                        )}
                      >
                        <span className="w-6 shrink-0 text-center text-[13px] font-semibold text-ink num">
                          {r.rank}
                        </span>
                        <Avatar initials={p.initials} hue={p.avatarHue} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-ink">
                            {p.fullName}
                          </span>
                          <span className="block text-[11px] text-muted num">
                            {r.wins}–{r.losses} · {signed(r.spread)}
                          </span>
                        </span>
                        {move !== 0 ? (
                          <span
                            className={cn(
                              "shrink-0 text-[11px] font-semibold num",
                              move > 0 ? "text-success" : "text-critical",
                            )}
                          >
                            {move > 0 ? "▲" : "▼"}
                            {Math.abs(move)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {tab === "results" ? (
                <div className="space-y-2">
                  <p className="px-1 py-2 text-[12.5px] text-muted">Your completed games</p>
                  {myGames.length === 0 ? (
                    <p className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-6 text-center text-[12.5px] text-muted">
                      No completed games yet.
                    </p>
                  ) : (
                    myGames.map((g) => {
                      const isA = g.playerAId === me.id;
                      const mine = isA ? g.scoreA : g.scoreB;
                      const theirs = isA ? g.scoreB : g.scoreA;
                      const oppName = g.playerBId === null
                        ? "Bye"
                        : players.find((p) => p.id === (isA ? g.playerBId : g.playerAId))?.fullName;
                      const won = g.playerBId === null || (mine ?? 0) > (theirs ?? 0);
                      const tie = mine === theirs && g.playerBId !== null;
                      return (
                        <div key={g.id} className="rounded-compact bg-[rgb(var(--c-surface))] p-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11.5px] text-muted">
                              Round {g.round} · Board {g.board || "—"}
                            </span>
                            <Badge tone={g.playerBId === null ? "neutral" : tie ? "warning" : won ? "success" : "critical"}>
                              {g.playerBId === null ? "Bye" : tie ? "Tie" : won ? "Won" : "Lost"}
                            </Badge>
                          </div>
                          <p className="mt-1.5 truncate text-[13.5px] font-medium text-ink">
                            {oppName}
                          </p>
                          {g.playerBId !== null ? (
                            <p className="mt-0.5 text-[17px] font-semibold text-ink num">
                              {mine} – {theirs}
                            </p>
                          ) : null}
                          <p className="mt-1 flex items-center gap-1 text-[11.5px] text-success">
                            <CheckCircle2 className="size-3.5" />
                            Verified and included in standings
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}

              {tab === "more" ? (
                <div className="space-y-3">
                  <div>
                    <p className="px-1 py-2 text-[12.5px] font-semibold text-muted">Notifications</p>
                    <div className="space-y-1.5">
                      {notifications.map((n) => (
                        <div key={n.id} className="flex items-start gap-2.5 rounded-control bg-[rgb(var(--c-surface))] px-3 py-2.5">
                          <span
                            className={cn(
                              "mt-1 size-1.5 shrink-0 rounded-full",
                              n.tone === "primary" && "bg-primary",
                              n.tone === "warning" && "bg-warning",
                              n.tone === "success" && "bg-success",
                              n.tone === "info" && "bg-secondary",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-[12.5px] text-ink">{n.text}</p>
                            <p className="text-[11px] text-muted">{n.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="px-1 py-2 text-[12.5px] font-semibold text-muted">Your details</p>
                    <dl className="space-y-1">
                      {[
                        ["Player ID", me.playerId],
                        ["Division", me.division.replace(/-/g, " ")],
                        ["Rating", me.rating ? String(me.rating) : "Unrated"],
                        ["Seed", String(me.seed)],
                        ["Club", me.club],
                        ["City", me.city],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between rounded-control bg-[rgb(var(--c-surface))] px-3 py-2 text-[12.5px]">
                          <dt className="text-muted">{k}</dt>
                          <dd className="capitalize text-ink">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <Link href="/live">
                    <Button variant="secondary" className="w-full">
                      Open the public tournament site
                    </Button>
                  </Link>
                </div>
              ) : null}
            </div>

            {/* Bottom navigation */}
            <nav className="flex shrink-0 items-center justify-around border-t border-line bg-[rgb(var(--c-surface-strong))] px-2 py-2 backdrop-blur-xl">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 rounded-control px-1 py-1.5 transition-colors",
                    tab === n.id ? "text-primary" : "text-faint hover:text-muted",
                  )}
                  aria-current={tab === n.id ? "page" : undefined}
                >
                  <n.icon className="size-5" />
                  <span className="text-[10.5px] font-medium">{n.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PairingTab({
  me,
  opponent,
  board,
  previousMeeting,
  pairingId,
}: {
  me: { id: string; fullName: string; initials: string; avatarHue: number; rating: number };
  opponent: { id: string; fullName: string; initials: string; avatarHue: number; rating: number } | null;
  board?: number;
  previousMeeting: boolean;
  pairingId?: string;
}) {
  const store = useStore();
  const [myScore, setMyScore] = React.useState("");
  const [theirScore, setTheirScore] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  if (!opponent) {
    return (
      <div className="rounded-compact bg-[rgb(var(--c-surface))] p-5 text-center">
        <p className="text-[14px] font-semibold text-ink">You have a bye this round</p>
        <p className="mt-1 text-[12.5px] text-muted">
          A bye is scored as a win. Your next game is in the following round.
        </p>
      </div>
    );
  }

  const valid = myScore !== "" && theirScore !== "" && !Number.isNaN(Number(myScore)) && !Number.isNaN(Number(theirScore));

  return (
    <div className="space-y-3">
      {/* Versus card */}
      <div className="rounded-card bg-[rgb(var(--c-surface))] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 text-center">
            <Avatar initials={me.initials} hue={me.avatarHue} size={52} className="mx-auto" />
            <p className="mt-1.5 truncate text-[13px] font-semibold text-ink">{me.fullName}</p>
            <p className="text-[11.5px] text-muted num">{me.rating || "Unrated"}</p>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-faint">vs</span>
          <div className="flex-1 text-center">
            <Avatar initials={opponent.initials} hue={opponent.avatarHue} size={52} className="mx-auto" />
            <p className="mt-1.5 truncate text-[13px] font-semibold text-ink">{opponent.fullName}</p>
            <p className="text-[11.5px] text-muted num">{opponent.rating || "Unrated"}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          <Badge tone="primary">Board {board ?? "—"}</Badge>
          {previousMeeting ? (
            <Badge tone="warning">You have met before</Badge>
          ) : (
            <Badge tone="neutral">First meeting</Badge>
          )}
        </div>
      </div>

      {/* Directions */}
      <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <MapPin className="size-4 text-primary" />
          Finding your board
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Hall A, row {Math.ceil((board ?? 1) / 8)}. Enter through the main doors and turn left. Boards
          are numbered from the stage.
        </p>
      </div>

      {/* Result submission */}
      <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
        <p className="text-[13px] font-semibold text-ink">Submit your result</p>
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3 rounded-control bg-success-050 p-3.5 text-center"
          >
            <CheckCircle2 className="mx-auto size-6 text-success" />
            <p className="mt-1.5 text-[13px] font-semibold text-ink">Result submitted</p>
            <p className="mt-0.5 text-[12px] text-muted">
              Waiting for {opponent.fullName} to confirm. The scorekeeper verifies the final score.
            </p>
          </motion.div>
        ) : (
          <>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <Field label="Your score">
                <Input value={myScore} onChange={(e) => setMyScore(e.target.value)} inputMode="numeric" className="num text-center" />
              </Field>
              <Field label="Opponent">
                <Input value={theirScore} onChange={(e) => setTheirScore(e.target.value)} inputMode="numeric" className="num text-center" />
              </Field>
            </div>
            {valid ? (
              <p className="mt-2 rounded-control bg-primary-050/70 px-3 py-2 text-center text-[12px] text-primary-600">
                {Number(myScore) === Number(theirScore)
                  ? "Tie — both players receive half a point."
                  : `${Number(myScore) > Number(theirScore) ? "You win" : `${opponent.fullName} wins`} by ${Math.abs(Number(myScore) - Number(theirScore))}.`}
              </p>
            ) : null}
            <Button
              variant="primary"
              className="mt-2.5 w-full"
              disabled={!valid}
              icon={<Send className="size-4" />}
              onClick={() => {
                setSubmitted(true);
                if (pairingId) {
                  store.toast({
                    title: "Result submitted",
                    description: "Your opponent has been asked to confirm the score.",
                    tone: "success",
                  });
                }
              }}
            >
              Submit result
            </Button>
          </>
        )}
      </div>

      <Button
        variant="secondary"
        className="w-full"
        icon={<Flag className="size-4" />}
        onClick={() =>
          store.toast({
            title: "Issue reported",
            description: "A floor arbiter has been notified and will come to your board.",
            tone: "info",
          })
        }
      >
        Report an issue
      </Button>
    </div>
  );
}
