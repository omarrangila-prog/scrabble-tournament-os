"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Grid3x3, Megaphone, Pause, Play, Timer, Trophy } from "lucide-react";
import { Avatar, Badge, Button } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useLiveEvent } from "@/lib/supabase/useLiveEvent";
import { useGames } from "@/lib/supabase/useGames";
import { useRoster } from "@/lib/supabase/useRoster";
import { RoundClock } from "@/components/public/RoundClock";
import { useRoundTimer } from "@/lib/supabase/useRoundTimer";
import { computeStandings } from "@/lib/engine/standings";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { usePublicEventSettings } from "@/lib/supabase/useEventSettings";
import { cn, signed } from "@/lib/utils";

type PanelId = "standings" | "pairings" | "announcements" | "sponsors" | "countdown";

const PANELS: { id: PanelId; label: string; seconds: number }[] = [
  { id: "standings", label: "Standings", seconds: 12 },
  { id: "pairings", label: "Live pairings", seconds: 12 },
  { id: "announcements", label: "Announcements", seconds: 9 },
  { id: "countdown", label: "Round clock", seconds: 7 },
  { id: "sponsors", label: "Sponsors", seconds: 7 },
];

/**
 * Full-screen display for the venue projector. Large type, high contrast and
 * auto-rotating panels so it can run unattended through a round.
 */
function TvDisplay() {
  const store = useStore();
  const { tournament, announcements } = store;

  /*
   * Which tournament this screen is showing. Resolved rather than hardcoded — `?event=` when
   * a venue runs two rooms, otherwise whichever event is actually mid-day.
   */
  const liveEvent = useLiveEvent();
  const eventId = liveEvent.eventId ?? "";

  /*
   * The wall reads the same database as everything else.
   *
   * It used to read this browser's demo store, so the screen the whole room looks at
   * would have shown demo players, demo pairings and a division this event does not
   * have — in front of the people whose real names and real games were in the database
   * all along.
   */
  const roster = useRoster(eventId);
  const games = useGames(eventId, tournament.id);
  const players = roster.players;
  const pairings = games.pairings;
  const round = games.round;

  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [secondsLeft, setSecondsLeft] = React.useState(PANELS[0].seconds);
  const [controlsVisible, setControlsVisible] = React.useState(true);

  /* QR is event-experience, never tournament-core — see the same flag on `/live/display`. */
  const { qrEnabled } = usePublicEventSettings(eventId);

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

  /*
   * Whichever division actually has players, rather than a hardcoded "masters" that this
   * event does not have — that panel would have been permanently empty on the wall.
   */
  const shownDivision = store.divisions.map((d) => d.id).find((id) => players.some((p) => p.division === id));

  const standings = shownDivision
    ? computeStandings(players, pairings, tournament, { division: shownDivision }).slice(0, 10)
    : [];
  const divisionName = shownDivision
    ? (store.divisions.find((d) => d.id === shownDivision)?.name ?? shownDivision)
    : "";

  /* The room's clock, for the header badge as well as the panel. */
  const roomClock = useRoundTimer(eventId, round);
  const clockPhase = roomClock.phase;

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  /*
   * Built from the origin this screen is actually being served from, so the QR works on a
   * laptop at the venue as well as on the deployed site. Empty on the server, where there is
   * no origin — the block is simply absent until it renders in a browser.
   */
  const submitUrl = origin && liveEvent.slug ? `${origin}/events/${liveEvent.slug}/submit-score` : "";

  const livePairings = pairings
    .filter((p) => p.round === round && p.playerBId)
    .sort((a, b) => a.board - b.board)
    .slice(0, 12);

  if (!liveEvent.resolved) return <TvMessage>Loading…</TvMessage>;
  if (!liveEvent.eventId) return <TvMessage>No tournament is running right now.</TvMessage>;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4 border-b border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] px-6 py-4 backdrop-blur-xl sm:px-10">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
            {tournament.name.replace(" — Demo", "")}
          </h1>
          <p className="mt-0.5 text-[15px] text-muted sm:text-[17px]">
            {round > 0
              ? `Round ${round} of ${tournament.totalRounds}`
              : "Not started"}
            {store.venue.totalBoards > 0 ? ` · ${store.venue.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/*
            * Live when the room is actually playing, taken from the shared clock rather
            * than from this browser's stored tournament status — which said "Not started"
            * on the wall while a round was under way.
            */}
          {clockPhase === "running" ? (
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
                  {divisionName ? `${divisionName} standings` : "Standings"}
                </h2>
                {/*
                  * An empty grid on a projector reads as a broken screen. Say why there is
                  * nothing yet instead, in type the room can read from the back.
                  */}
                {standings.length === 0 ? (
                  <p className="text-[19px] text-muted sm:text-[22px]">
                    {players.length === 0
                      ? "Waiting for the roster."
                      : "No results yet — standings appear as soon as the first games are verified."}
                  </p>
                ) : null}
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
                  Round {round} pairings
                </h2>
                {livePairings.length === 0 ? (
                  <p className="text-[19px] text-muted sm:text-[22px]">
                    {round === 0
                      ? "No round has been published yet."
                      : "This round has no boards on the sheet yet."}
                  </p>
                ) : null}
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
                  {/*
                    * The room's real clock. This read 18:42 — a number typed into the
                    * page, counting nothing, on the largest screen in the venue. Every
                    * player who looked up was being told the wrong time.
                    */}
                  {round > 0 ? (
                    <>
                      <p className="mt-4 text-[19px] text-muted sm:text-[22px]">
                        Round {round}
                      </p>
                      <RoundClock
                        eventId={eventId}
                        round={round}
                        size="large"
                        className="mt-2 bg-transparent"
                      />
                    </>
                  ) : (
                    <p className="mt-4 text-[19px] text-muted sm:text-[22px]">
                      Waiting for the first round to be published.
                    </p>
                  )}
                  <p className="mt-4 text-[17px] text-muted sm:text-[19px]">
                    Please stay at your board until your result has been recorded.
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

      {/*
        The result QR, always on the wall once a round is up.

        Pinned rather than given a slot in the rotation: somebody who has just finished a game
        should not have to stand and wait for the right panel to come round. It is small
        because it is not the point of the screen — but a phone camera reads it from across a
        room at this size.
      */}
      {qrEnabled && round > 0 && submitUrl ? (
        <div className="flex items-center justify-center gap-4 px-6 pb-2 sm:px-10">
          {/*
            A plain <img>. The source is a data URI generated in the browser, so there is
            nothing for the image optimiser to fetch, resize or cache — routing it through
            next/image would add work and change nothing.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrToDataUri(submitUrl, { size: 280 })}
            alt=""
            aria-hidden
            className="size-[92px] rounded-compact bg-white p-1.5 sm:size-[104px]"
          />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink sm:text-[17px]">
              Finished your game? Scan to enter your result.
            </p>
            <p className="mt-0.5 text-[13px] text-muted sm:text-[15px]">
              One player per board. You will need your check-in code.
            </p>
          </div>
        </div>
      ) : null}

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

/**
 * Full-screen display for the venue projector. Large type, high contrast and
 * auto-rotating panels so it can run unattended through a round.
 */
export default function TvDisplayPage() {
  /* `useSearchParams` (behind `useLiveEvent`) needs a Suspense boundary to prerender. */
  return (
    <React.Suspense fallback={<TvMessage>Loading…</TvMessage>}>
      <TvDisplay />
    </React.Suspense>
  );
}

function TvMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <p className="text-[28px] font-extrabold text-muted">{children}</p>
    </div>
  );
}
