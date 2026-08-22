"use client";

import * as React from "react";

import { ACTIVE_EVENT, ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { EVENT_STATE_LABEL, type EventState } from "@/lib/domain/events";
import { useEventState } from "@/lib/supabase/useEventState";
import { arrivalTotals } from "@/lib/supabase/registrations";
import { readBreakKind } from "@/lib/supabase/useTablePlan";
import { publicStandings, type PublicStanding } from "@/lib/supabase/submitResult";
import { useRoundTimer } from "@/lib/supabase/useRoundTimer";
import { useStore } from "@/lib/store/useStore";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { SongRound } from "@/components/public/SongRound";
import { useRoundProgress } from "@/lib/supabase/useRoundProgress";
import { cn } from "@/lib/utils";

/**
 * The wall.
 *
 * Nobody touches this screen. It is put on a television at the start of the day and it
 * follows the event by itself, because the phase already lives in the database and every
 * other screen reads it — a display that had to be switched by hand would be one more thing
 * to remember while a room is waiting.
 *
 * Each state answers the one question the room is asking at that moment, and shows the QR
 * that answers it: where do I check in, where do I sit, how long have I got, where do I put
 * my score. Everything is sized for reading from the back of a room rather than from a desk.
 *
 * The rotating panels at `/live/tv` still exist for standings between rounds. This is the
 * screen for the moment somebody looks up.
 */

const NIGHT = "#060F0A";
const FELT = "#123021";
const IVORY = "#F4EBD9";
const BRASS = "#D8AC5A";
const EMERALD = "#279A60";

/** What the room needs from the screen, for each phase the event can be in. */
type Scene =
  | "closed"
  | "check-in"
  | "pairings"
  | "playing"
  | "results"
  | "break"
  | "standings";

const SCENE_FOR: Record<EventState, Scene> = {
  draft: "closed",
  "registration-open": "check-in",
  "registration-closed": "check-in",
  preparing: "check-in",
  "check-in-open": "check-in",
  "check-in-closed": "pairings",
  "round-published": "pairings",
  "round-active": "playing",
  "result-entry": "results",
  break: "break",
  "final-review": "standings",
  completed: "standings",
  archived: "closed",
};

export default function LiveDisplayPage() {
  /*
   * No store, and no signed-in read of any kind. Everything on this screen comes from
   * functions a television can call without an account — which is what a television is.
   */
  const phase = useEventState(ACTIVE_EVENT_ID, 8);
  /*
   * The round, read the way a television can read it.
   *
   * `useGames` goes through a staff-only function, so on a screen that has never signed in it
   * returns nothing and the wall announced "Round 0 complete · 0 / 0 boards in" — during the
   * one scene whose whole job is telling the room what to do.
   */
  const live = useRoundProgress(ACTIVE_EVENT_ID);
  const round = live.round;
  const clock = useRoundTimer(ACTIVE_EVENT_ID, round);

  /* Once a second, so the clock on the wall is the clock in the room. */
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const state = phase.state ?? "registration-open";
  const scene = SCENE_FOR[state] ?? "closed";

  /*
   * Arrivals from the public counter, not from the roster.
   *
   * The roster needs a signed-in staff session, and a television is not signed in — so
   * reading it there showed "0 / 0" all through check-in, on the one screen the room looks
   * at to know whether it is waiting for ten people or for one. `checkin_counts` returns two
   * numbers and nothing about anybody, which is exactly what a wall should have.
   */
  const [arrivals, setArrivals] = React.useState({ expected: 0, checkedIn: 0 });

  /* Break, or lunch. The room reads the two very differently. */
  const [breakKind, setBreakKind] = React.useState<"break" | "lunch">("break");

  React.useEffect(() => {
    let live = true;

    const read = async () => {
      const kind = await readBreakKind(ACTIVE_EVENT_ID);
      if (live) setBreakKind(kind);
    };

    void read();
    const id = window.setInterval(read, 15_000);

    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    let live = true;

    const read = async () => {
      const totals = await arrivalTotals(ACTIVE_EVENT_ID);
      if (live) setArrivals(totals);
    };

    void read();
    const id = window.setInterval(read, 10_000);

    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const checkedIn = arrivals.checkedIn;
  const expected = arrivals.expected;

  const base = `${origin}/events/${ACTIVE_EVENT.slug}`;


  /*
   * One code, all day, in every scene.
   *
   * There used to be two — one for check-in and one for everything after — and a room does
   * not track which QR is which. The same page now finds you by name, offers to check you in
   * if you have not, shows your table when the boards go up, takes your score, and asks you
   * to confirm your opponent's. Somebody who scanned it at the door never needs another.
   *
   * Nothing personal is ever typed on the television: the code is public, and who you are is
   * settled on the phone in your hand.
   */
  const playUrl = origin ? `${base}/play` : "";

  const minutesLeft = Math.max(0, Math.floor(clock.remaining / 60000));
  const lastMinute = clock.phase === "running" && clock.remaining > 0 && clock.remaining <= 60_000;

  return (
    <main
      className="relative flex min-h-dvh flex-col px-[4vw] py-[3vh]"
      style={{
        background: `radial-gradient(120% 80% at 50% -10%, ${FELT} 0%, ${NIGHT} 72%)`,
        color: IVORY,
      }}
    >
      {/* The banner never changes, so somebody walking in knows where they are. */}
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <p
          className="text-[2.4vw] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: BRASS }}
        >
          Blufy&rsquo;s AlphaBattle
        </p>
        <p className="text-[1.5vw] font-semibold" style={{ color: `${IVORY}99` }}>
          {EVENT_STATE_LABEL[state]}
          {round > 0 && scene !== "check-in" ? ` · Round ${round}` : ""}
        </p>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {/* ---- Nothing happening yet ------------------------------------ */}
        {scene === "closed" ? (
          <Headline sub="Nothing to do just yet.">{ACTIVE_EVENT.name}</Headline>
        ) : null}

        {/* ---- Come in and check in ------------------------------------- */}
        {scene === "check-in" ? (
          <>
            <Headline sub="Scan with your phone. Find your name, and you are in.">
              Welcome — check in
            </Headline>
            <Qr url={playUrl} />
            {/*
              The count is the one number worth putting on a wall during check-in: it tells
              the room whether it is waiting for ten people or for one.
            */}
            <p className="mt-[2vh] text-[2.6vw] font-extrabold" style={{ color: EMERALD }}>
              {checkedIn}
              <span style={{ color: `${IVORY}66` }}> / {expected} checked in</span>
            </p>
          </>
        ) : null}

        {/* ---- Boards are up -------------------------------------------- */}
        {scene === "pairings" ? (
          <>
            <Headline sub="Scan to find your table, or look for your name on the boards.">
              {round > 0 ? `Round ${round} — tables are up` : "Getting the first round ready"}
            </Headline>
            <Qr url={playUrl} />
          </>
        ) : null}

        {/* ---- Playing --------------------------------------------------- */}
        {scene === "playing" ? (
          <>
            <p className="text-[2vw] font-bold uppercase tracking-[0.2em]" style={{ color: BRASS }}>
              Round {round}
            </p>
            {/*
              The clock is the whole screen while a round is on. Everything else can wait —
              this is the only thing anybody looks up for.
            */}
            <p
              className={cn("num font-extrabold leading-none", lastMinute && "animate-pulse")}
              style={{
                fontSize: "22vw",
                color: lastMinute ? "#E2703A" : IVORY,
                letterSpacing: "-0.02em",
              }}
            >
              {clock.clock}
            </p>
            <p className="mt-[1vh] text-[2vw] font-semibold" style={{ color: `${IVORY}99` }}>
              {clock.phase === "paused"
                ? "Paused"
                : lastMinute
                  ? "One minute remaining"
                  : `${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} remaining`}
            </p>

            {/*
              The same code, small, in the corner.
              The clock owns this screen while a round is on — but somebody who arrives late,
              or whose game finished early, still needs the one address that does everything.
              Making them wait for the round to end is how a person ends up at the desk.
            */}
            <div className="absolute bottom-[3vh] right-[3vw] text-center">
              {/* A data URI generated in the page — next/image has nothing to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrToDataUri(playUrl, { size: 360 })}
                alt=""
                aria-hidden
                className="size-[7vw] rounded-[0.6vw]"
              />
              <p className="mt-[0.6vh] text-[0.9vw] font-semibold" style={{ color: `${IVORY}66` }}>
                Scan any time
              </p>
            </div>
          </>
        ) : null}

        {/* ---- Round over, send your score ------------------------------- */}
        {scene === "results" ? (
          <>
            <Headline sub="One player per board. You will need your player number.">
              Round {round} complete — submit your result
            </Headline>
            <Qr url={playUrl} />
            <p className="mt-[2vh] text-[2.2vw] font-bold" style={{ color: EMERALD }}>
              {live.verified}
              <span style={{ color: `${IVORY}66` }}> / {live.boards} boards in</span>
            </p>

            {/*
              The song round, while the room is between games.
              Silent and invisible if no clips have been added.
            */}
            <SongRound round={round} playing />
          </>
        ) : null}

        {/* ---- Break ------------------------------------------------------ */}
        {scene === "break" ? (
          <>
            <Headline
              sub={
                breakKind === "lunch"
                  ? "Lunch and chai for everybody. Your next table appears on your phone."
                  : "Back shortly. Your next table appears on your phone."
              }
            >
              {breakKind === "lunch" ? "Lunch break" : "Break"}
            </Headline>
            <p className="mt-[1vh] text-[7vw]">{breakKind === "lunch" ? "🍽️" : "☕"}</p>
          </>
        ) : null}

        {/* ---- Standings, and the finish --------------------------------- */}
        {scene === "standings" ? <Standings final={state === "completed"} /> : null}
      </div>

      <footer className="text-center text-[1.2vw]" style={{ color: `${IVORY}55` }}>
        {ACTIVE_EVENT.venueName} · {ACTIVE_EVENT.city}
      </footer>
    </main>
  );
}

function Headline({ children, sub }: { children: React.ReactNode; sub: string }) {
  return (
    <>
      <h1
        className="font-display text-[6vw] font-semibold leading-[1.05] tracking-[-0.02em]"
        style={{ color: IVORY }}
      >
        {children}
      </h1>
      <p className="mt-[1.5vh] text-[1.9vw]" style={{ color: `${IVORY}A6` }}>
        {sub}
      </p>
    </>
  );
}

/**
 * A QR big enough to scan from a seat.
 *
 * White plate behind it deliberately: a code rendered directly onto a dark background is a
 * code half the phones in the room will not read.
 */
function Qr({ url }: { url: string }) {
  if (!url) return null;

  return (
    <div className="mt-[3vh] rounded-[1.4vw] bg-white p-[1.2vw]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrToDataUri(url, { size: 720 })} alt="" aria-hidden className="size-[22vw]" />
    </div>
  );
}

/** The top of each division, once results exist. */
function Standings({ final }: { final: boolean }) {
  const app = useStore();

  /*
   * Read publicly, because this screen has no session. The roster needs staff auth, so
   * computing standings from it left the final screen — the one the whole day builds to —
   * saying "nothing to show yet" with the results sitting in the database.
   */
  const [rows, setRows] = React.useState<PublicStanding[]>([]);

  React.useEffect(() => {
    let live = true;

    const read = async () => {
      const next = await publicStandings(ACTIVE_EVENT_ID);
      if (live) setRows(next);
    };

    void read();
    const id = window.setInterval(read, 15_000);

    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  /*
   * The reveal, once the event is finished.
   *
   * Third, then second, then the champion, eight seconds apart, and then the podium stays.
   * Building to the winner is the only reason to put results on a wall rather than on a
   * phone. Nothing loops: a room does not need to be told who won on repeat.
   */
  const [revealed, setRevealed] = React.useState(0);

  React.useEffect(() => {
    if (!final) return;
    const id = window.setInterval(() => setRevealed((n) => (n >= 3 ? n : n + 1)), 8000);
    return () => window.clearInterval(id);
  }, [final]);

  const divisions = app.divisions
    .map((d) => ({
      name: d.name,
      rows: rows.filter((r) => r.division === d.id).slice(0, 3),
    }))
    .filter((d) => d.rows.length > 0);

  if (divisions.length === 0) {
    return <Headline sub="Standings appear here once results are in.">Nothing to show yet</Headline>;
  }

  /* One division gets the ceremony; every division is listed once it is over. */
  const ceremony = divisions[0];

  if (final && revealed < 3) {
    const place = 2 - revealed;
    const row = ceremony.rows[place];

    if (row) {
      return (
        <div className="flex flex-col items-center">
          <p className="text-[9vw] leading-none">{["🥇", "🥈", "🥉"][place]}</p>
          <p
            className="mt-[2vh] text-[2vw] font-bold uppercase tracking-[0.2em]"
            style={{ color: BRASS }}
          >
            {["Champion", "Runner-up", "Third place"][place]} · {ceremony.name}
          </p>
          <p
            className="font-display mt-[1vh] text-[6vw] font-semibold leading-none"
            style={{ color: IVORY }}
          >
            {row.name}
          </p>
          <p className="num mt-[2vh] text-[2vw]" style={{ color: `${IVORY}99` }}>
            {row.wins} won · {row.spread > 0 ? "+" : ""}
            {row.spread} spread
          </p>
        </div>
      );
    }
  }

  return (
    <>
      <h1
        className="font-display text-[5vw] font-semibold leading-none"
        style={{ color: final ? BRASS : IVORY }}
      >
        {final ? "Final results" : "Standings"}
      </h1>

      <div className="mt-[3vh] grid w-full gap-[2vw] sm:grid-cols-2 lg:grid-cols-3">
        {divisions.map((d) => (
          <div
            key={d.name}
            className="rounded-[1vw] px-[1.6vw] py-[1.6vh] text-left"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <p
              className="text-[1.3vw] font-bold uppercase tracking-[0.14em]"
              style={{ color: BRASS }}
            >
              {d.name}
            </p>
            {d.rows.map((row, i) => (
              <p key={row.name} className="mt-[0.8vh] flex items-baseline gap-[0.8vw]">
                <span className="num text-[1.8vw] font-extrabold" style={{ color: BRASS }}>
                  {["🥇", "🥈", "🥉"][i] ?? i + 1}
                </span>
                <span className="flex-1 truncate text-[1.7vw] font-semibold">{row.name}</span>
                <span className="num text-[1.5vw]" style={{ color: `${IVORY}99` }}>
                  {row.wins}–{row.losses}
                </span>
              </p>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
