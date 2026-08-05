"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Grid3x3, Megaphone, Pause, Play, Timer, Trophy } from "lucide-react";
import { Avatar, Badge, Button } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { computeStandings } from "@/lib/engine/standings";
import { cn, signed } from "@/lib/utils";

type PanelId = "standings" | "pairings" | "announcements" | "sponsors" | "countdown";

const PANELS: { id: PanelId; label: string; seconds: number }[] = [
  { id: "standings", label: "Standings", seconds: 12 },
  { id: "pairings", label: "Live pairings", seconds: 12 },
  { id: "announcements", label: "Announcements", seconds: 9 },
  { id: "countdown", label: "Next round", seconds: 7 },
  { id: "sponsors", label: "Sponsors", seconds: 7 },
];

/**
 * Full-screen display for the venue projector. Large type, high contrast and
 * auto-rotating panels so it can run unattended through a round.
 */
export default function TvDisplayPage() {
  const store = useStore();
  const { tournament, players, pairings, announcements } = store;

  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [secondsLeft, setSecondsLeft] = React.useState(PANELS[0].seconds);
  const [controlsVisible, setControlsVisible] = React.useState(true);

  const panel = PANELS[index];

  // Rotate panels on a timer.
  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setIndex((i) => (i + 1) % PANELS.length);
          return PANELS[(index + 1) % PANELS.length].seconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, index]);

  // Hide the controls after a period of inactivity.
  React.useEffect(() => {
    let timer = window.setTimeout(() => setControlsVisible(false), 4000);
    const wake = () => {
      setControlsVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setControlsVisible(false), 4000);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  const goFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  const standings = computeStandings(players, pairings, tournament, { division: "masters" }).slice(0, 10);
  const livePairings = pairings
    .filter((p) => p.round === tournament.currentRound && p.playerBId)
    .sort((a, b) => a.board - b.board)
    .slice(0, 12);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4 border-b border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] px-6 py-4 backdrop-blur-xl sm:px-10">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
            {tournament.name.replace(" — Demo", "")}
          </h1>
          <p className="mt-0.5 text-[15px] text-muted sm:text-[17px]">
            {tournament.currentRound > 0
              ? `Round ${tournament.currentRound} of ${tournament.totalRounds}`
              : "Not started"}
            {store.venue.totalBoards > 0 ? ` · ${store.venue.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tournament.status === "live" ? (
            <Badge tone="success" dot pulse className="!px-4 !py-2 !text-[15px]">
              Live
            </Badge>
          ) : (
            <Badge tone="neutral" className="!px-4 !py-2 !text-[15px]">
              Not started
            </Badge>
          )}
          <p className="text-[15px] font-medium text-muted num sm:text-[17px]">{panel.label}</p>
        </div>
      </header>

      {/* Panel */}
      <main className="relative flex-1 overflow-hidden px-6 py-6 sm:px-10 sm:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={panel.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
            className="h-full"
          >
            {panel.id === "standings" ? (
              <div>
                <h2 className="mb-4 flex items-center gap-3 text-[22px] font-semibold text-ink sm:text-[26px]">
                  <Trophy className="size-6 text-primary" />
                  Masters standings
                </h2>
                <div className="grid gap-2 lg:grid-cols-2">
                  {standings.map((r) => {
                    const p = players.find((x) => x.id === r.playerId);
                    if (!p) return null;
                    const move = r.previousRank - r.rank;
                    return (
                      <div key={r.playerId} className="glass flex items-center gap-4 rounded-compact px-5 py-3">
                        <span className="w-10 shrink-0 text-center text-[26px] font-semibold text-ink num sm:text-[30px]">
                          {r.rank}
                        </span>
                        <Avatar initials={p.initials} hue={p.avatarHue} size={44} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[19px] font-semibold text-ink sm:text-[21px]">
                            {p.fullName}
                          </p>
                          <p className="truncate text-[14px] text-muted">{p.club}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[19px] font-semibold text-ink num sm:text-[21px]">
                            {r.wins}–{r.losses}
                          </p>
                          <p className="text-[14px] text-muted num">{signed(r.spread)}</p>
                        </div>
                        {move !== 0 ? (
                          <span
                            className={cn(
                              "w-10 shrink-0 text-right text-[17px] font-semibold num",
                              move > 0 ? "text-success" : "text-critical",
                            )}
                          >
                            {move > 0 ? "▲" : "▼"}
                            {Math.abs(move)}
                          </span>
                        ) : (
                          <span className="w-10 shrink-0 text-right text-[17px] text-faint">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {panel.id === "pairings" ? (
              <div>
                <h2 className="mb-4 flex items-center gap-3 text-[22px] font-semibold text-ink sm:text-[26px]">
                  <Grid3x3 className="size-6 text-primary" />
                  Round {tournament.currentRound} pairings
                </h2>
                <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {livePairings.map((p) => (
                    <div key={p.id} className="glass rounded-compact px-5 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] font-semibold text-primary num">
                          Board {p.board}
                        </span>
                        <Badge tone={p.status === "verified" ? "neutral" : "success"} dot pulse={p.status === "live"}>
                          {p.status === "verified" ? "Final" : "Playing"}
                        </Badge>
                      </div>
                      <p className="mt-1.5 truncate text-[18px] font-medium text-ink">
                        {nameOf(p.playerAId)}
                      </p>
                      <p className="truncate text-[18px] font-medium text-ink">
                        {nameOf(p.playerBId)}
                      </p>
                      {p.scoreA !== undefined ? (
                        <p className="mt-1 text-[16px] font-semibold text-muted num">
                          {p.scoreA} – {p.scoreB}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {panel.id === "announcements" ? (
              <div>
                <h2 className="mb-4 flex items-center gap-3 text-[22px] font-semibold text-ink sm:text-[26px]">
                  <Megaphone className="size-6 text-primary" />
                  Announcements
                </h2>
                <div className="space-y-3">
                  {announcements.slice(0, 4).map((a) => (
                    <div key={a.id} className="glass rounded-card px-6 py-4">
                      <p className="text-[21px] font-semibold text-ink sm:text-[24px]">{a.title}</p>
                      <p className="mt-1.5 text-[16px] leading-relaxed text-muted sm:text-[18px]">
                        {a.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {panel.id === "countdown" ? (
              <div className="grid h-full place-items-center">
                <div className="text-center">
                  <Timer className="mx-auto size-12 text-primary" />
                  <p className="mt-4 text-[19px] text-muted sm:text-[22px]">
                    Round {tournament.currentRound + 1} begins in
                  </p>
                  <p className="mt-2 text-[72px] font-semibold leading-none tracking-[-0.03em] text-ink num sm:text-[96px]">
                    18:42
                  </p>
                  <p className="mt-4 text-[17px] text-muted sm:text-[19px]">
                    Please return to your boards five minutes before the start.
                  </p>
                </div>
              </div>
            ) : null}

            {panel.id === "sponsors" ? (
              <div className="grid h-full place-items-center">
                <div className="w-full max-w-4xl text-center">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-faint">
                    Official sponsors
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {tournament.sponsors.map((s) => (
                      <div key={s} className="glass board-motif grid h-28 place-items-center rounded-card">
                        <p className="px-3 text-center text-[17px] font-semibold text-ink">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Rotation progress */}
      <div className="flex gap-1 px-6 pb-1 sm:px-10">
        {PANELS.map((p, i) => (
          <div key={p.id} className="h-1 flex-1 overflow-hidden rounded-full bg-[rgb(var(--c-line))]">
            <div
              className={cn("h-full rounded-full bg-primary transition-all", i < index && "w-full")}
              style={{
                width: i === index ? `${((p.seconds - secondsLeft) / p.seconds) * 100}%` : i < index ? "100%" : "0%",
              }}
            />
          </div>
        ))}
      </div>

      {/* Controls */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-2 px-6 py-3 transition-opacity sm:px-10",
          controlsVisible ? "opacity-100" : "opacity-0",
        )}
      >
        <Button size="sm" variant="secondary" onClick={() => setPlaying((v) => !v)} icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}>
          {playing ? "Pause rotation" : "Resume rotation"}
        </Button>
        {PANELS.map((p, i) => (
          <Button
            key={p.id}
            size="sm"
            variant={i === index ? "primary" : "ghost"}
            onClick={() => {
              setIndex(i);
              setSecondsLeft(p.seconds);
            }}
          >
            {p.label}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={goFullscreen}>
          Full screen
        </Button>
      </div>
    </div>
  );
}
