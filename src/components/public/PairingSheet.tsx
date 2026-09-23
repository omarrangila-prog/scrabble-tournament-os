"use client";

import * as React from "react";

import { boardsForRound, type PublicBoard } from "@/lib/supabase/games";
import {
  officialOrDerivedStandings,
  publicArrivals,
  type PublicArrival,
  type PublicStanding,
} from "@/lib/supabase/submitResult";
import { useRoundProgress } from "@/lib/supabase/useRoundProgress";
import { useRoundTimer } from "@/lib/supabase/useRoundTimer";

const NIGHT = "#0E1512";
const FELT = "#14261C";
const IVORY = "#F4EFE4";
const BRASS = "#C89B3C";
const EMERALD = "#4FA87A";

/*
 * Every category this system knows, in playing order. Masters was missing here after being
 * re-added everywhere else, so a Masters board would have been on the wall in the room and
 * absent from the wall on the screen.
 */
const DIVISIONS = ["beginner", "recreational", "advanced", "masters"] as const;
const LABEL: Record<string, string> = {
  beginner: "Beginner",
  recreational: "Recreational",
  advanced: "Advanced",
  masters: "Masters",
};

/*
 * More boards than this and one screen cannot hold them legibly, so the categories take
 * turns. Under that, everything fits and nothing moves — a sheet that rotates when it does
 * not need to is a sheet somebody is always waiting for.
 */
const FITS_ON_ONE_SCREEN = 14;
const ROTATE_EVERY_MS = 9_000;

/**
 * The board sheet, on a wall.
 *
 * The main display cycles through scenes and asks people to look themselves up on a phone.
 * That is right for a pocket and wrong for the two minutes after boards go up, when fifty
 * people are standing in a room all wanting the same answer at the same time. This is the
 * printed pairing sheet, on a television, and it is the whole page: no cycling, no QR, no
 * turns to wait through.
 *
 * It shows one of two things, and picks between them by itself:
 *
 *   Before a round is paired — everybody who has checked in, by category. That is the list
 *   the room asks for while it is filling up.
 *
 *   Once boards exist — every board with its table number and both names, and each score as
 *   it is confirmed, so when the round ends the same screen is already the results sheet.
 *
 * It needs no account, because a television has none. Every read here is a public one; that
 * mistake has been made on this screen three times.
 */
export function PairingSheet({
  eventId,
  eventName,
  mode = "auto",
}: {
  eventId: string;
  eventName: string;
  /**
   * "auto" rotates categories when the round is too big for one screen. "sheet" never
   * rotates — the whole round, for a display somebody scrolls by hand or a very tall screen.
   * "clock" is the countdown alone, for a second screen beside the pairings.
   * "winners" is the final placings, for the end of the day.
   */
  mode?: "auto" | "sheet" | "clock" | "winners";
}) {
  const live = useRoundProgress(eventId, 10);
  const clock = useRoundTimer(eventId, live.round);
  const [boards, setBoards] = React.useState<PublicBoard[]>([]);
  const [arrivals, setArrivals] = React.useState<PublicArrival[]>([]);
  const [standings, setStandings] = React.useState<PublicStanding[]>([]);
  const [tick, setTick] = React.useState(0);
  const [turn, setTurn] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  /* The rotation, only ever advancing. Which category it lands on is decided at render. */
  React.useEffect(() => {
    if (mode !== "auto") return;
    const id = window.setInterval(() => setTurn((n) => n + 1), ROTATE_EVERY_MS);
    return () => window.clearInterval(id);
  }, [mode]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [found, here, table] = await Promise.all([
        live.round >= 1 ? boardsForRound(eventId, live.round) : Promise.resolve([]),
        publicArrivals(eventId),
        officialOrDerivedStandings(eventId),
      ]);
      if (!alive) return;
      setBoards(found);
      setArrivals(here);
      setStandings(table.rows);
    })();
    return () => {
      alive = false;
    };
  }, [eventId, live.round, tick]);

  const showingBoards = boards.length > 0;
  const done = boards.filter((b) => b.scoreA !== null && b.scoreB !== null).length;
  const playable = boards.filter((b) => b.playerB !== null).length;

  /*
   * Which categories to show this turn.
   *
   * Everything, when it fits. Otherwise one category at a time, in playing order, skipping
   * any with no boards — a blank turn for an empty Masters section is nine seconds of nobody
   * finding their table.
   */
  const present = DIVISIONS.filter((d) => boards.some((b) => b.division === d));
  const rotating = mode === "auto" && playable > FITS_ON_ONE_SCREEN && present.length > 1;
  const visible = rotating ? [present[turn % present.length]] : present;

  const clockLine =
    clock.phase === "running"
      ? `Ends in ${clock.clock}`
      : clock.phase === "paused"
        ? `Paused · ${clock.clock}`
        : clock.phase === "finished"
          ? "Round over"
          : null;

  if (mode === "winners") {
    /*
     * The placings, by category, at the end of the day.
     *
     * Ordered by the database, which sorts on wins then spread — the same order the awards
     * are read out in. Top three in each category are set apart, because that is what the
     * room is looking for; everybody else is listed under them, because a player who came
     * fifth came to see their name too.
     *
     * Shown from whatever results exist, so it is usable between rounds as well as after the
     * last one. What it never does is invent a placing for a category nobody has finished.
     */
    const byDivision = DIVISIONS.map((division) => ({
      division,
      rows: standings.filter((r) => r.division === division),
    })).filter((g) => g.rows.length > 0);

    /*
     * The type shrinks to fit the longest category rather than the average one. Twelve rows
     * fit comfortably at the usual size; nineteen do not, and a screen that only fits when
     * the field happens to be small is a screen that fails on the day it is needed.
     */
    const tallest = Math.max(1, ...byDivision.map((g) => g.rows.length));
    const scale = tallest <= 12 ? 1 : tallest <= 16 ? 0.82 : 0.68;
    const size = (base: number) => `${(base * scale).toFixed(2)}vw`;
    const rowPad = tallest <= 12 ? "0.45vh" : tallest <= 16 ? "0.3vh" : "0.18vh";

    return (
      <main
        className="min-h-dvh px-[1.6vw] py-[1.2vh]"
        style={{
          background: `radial-gradient(120% 80% at 50% -10%, ${FELT} 0%, ${NIGHT} 72%)`,
          color: IVORY,
        }}
      >
        <header className="flex items-baseline justify-between gap-[2vw] border-b pb-[0.8vh]" style={{ borderColor: `${BRASS}55` }}>
          <p className="text-[1.7vw] font-extrabold uppercase tracking-[0.16em]" style={{ color: BRASS }}>
            {eventName}
          </p>
          {/* Final when the table is the published one; otherwise it is still moving. */}
          <p className="text-[1.9vw] font-extrabold">
            {standings.some((r) => r.rank)
              ? "Final standings"
              : live.round >= 1
                ? `Standings after round ${live.round}`
                : "Standings"}
          </p>
        </header>

        {byDivision.length === 0 ? (
          <p className="mt-[8vh] text-center text-[2.4vw] font-extrabold" style={{ color: `${IVORY}88` }}>
            No results yet
          </p>
        ) : (
          <div
            className="mt-[1.2vh] grid gap-[1.4vw]"
            /*
             * One column per category, up to four. Two columns held only two categories and
             * pushed the third off the bottom of the screen — a standings board that omits a
             * whole division is worse than none, because the people in it are standing there
             * looking for their names.
             */
            style={{ gridTemplateColumns: `repeat(${Math.min(byDivision.length, 4)}, minmax(0, 1fr))` }}
          >
            {byDivision.map(({ division, rows }) => (
              <section key={division}>
                <h2
                  className="border-b pb-[0.3vh] font-extrabold uppercase tracking-[0.1em]"
                  style={{ color: BRASS, borderColor: `${BRASS}33`, fontSize: size(1.5) }}
                >
                  {LABEL[division] ?? division}
                </h2>

                <ol className="mt-[0.6vh]">
                  {rows.map((r, i) => {
                    const podium = i < 3;
                    return (
                      <li
                        key={r.name + i}
                        className="flex items-baseline gap-[0.8vw] border-b"
                        style={{ borderColor: `${IVORY}14`, paddingTop: rowPad, paddingBottom: rowPad }}
                      >
                        <span
                          className="num w-[2.2vw] shrink-0 text-right font-extrabold tabular-nums"
                          style={{
                            fontSize: podium ? size(1.9) : size(1.3),
                            color: i === 0 ? BRASS : podium ? IVORY : `${IVORY}77`,
                          }}
                        >
                          {i + 1}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate font-semibold"
                          style={{ fontSize: podium ? size(1.8) : size(1.3), color: podium ? IVORY : `${IVORY}CC` }}
                        >
                          {r.name}
                        </span>
                        <span
                          className="num shrink-0 tabular-nums"
                          style={{ fontSize: podium ? size(1.5) : size(1.15), color: podium ? EMERALD : `${IVORY}88` }}
                        >
                          {r.wins}
                          <span style={{ color: `${IVORY}66` }}>/{r.played}</span>
                        </span>
                        <span
                          className="num w-[4.5vw] shrink-0 text-right tabular-nums"
                          style={{ fontSize: podium ? size(1.4) : size(1.1), color: `${IVORY}88` }}
                        >
                          {r.spread > 0 ? `+${r.spread}` : r.spread}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}

        <p className="mt-[1vh] text-center text-[1vw]" style={{ color: `${IVORY}66` }}>
          Wins / games played · spread
        </p>
      </main>
    );
  }

  if (mode === "clock") {
    /*
     * The countdown, alone, in the same hand as the pairing sheet.
     *
     * A second screen beside the boards. Nothing rotates here and nothing else competes for
     * the space — a player glancing up mid-turn gets the answer in one look, which is the
     * only reason this screen exists.
     */
    return (
      <main
        className="grid min-h-dvh place-items-center px-[2vw]"
        style={{
          background: `radial-gradient(120% 80% at 50% -10%, ${FELT} 0%, ${NIGHT} 72%)`,
          color: IVORY,
        }}
      >
        <div className="text-center">
          <p className="text-[1.6vw] font-extrabold uppercase tracking-[0.18em]" style={{ color: BRASS }}>
            {eventName}
          </p>

          {live.round >= 1 ? (
            <>
              <p className="mt-[1vh] text-[2.4vw] font-extrabold">
                Round {live.round}
                {clock.phase === "running" ? " · live" : clock.phase === "paused" ? " · paused" : ""}
              </p>
              {/*
               * Filled the moment the clock starts and not before. A screen reading 00:00
               * before anybody has begun is read as "time up" by the one person it matters
               * most to.
               */}
              {clock.phase === "not-started" ? (
                <p className="mt-[2vh] text-[6vw] font-extrabold leading-none" style={{ color: `${IVORY}66` }}>
                  Not started
                </p>
              ) : (
                <p
                  className="num mt-[1vh] font-extrabold leading-none tabular-nums"
                  style={{
                    fontSize: "17vw",
                    color: clock.phase === "finished" ? `${IVORY}66` : IVORY,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {clock.clock}
                </p>
              )}
              <p className="mt-[2vh] text-[1.5vw]" style={{ color: `${IVORY}88` }}>
                {clock.phase === "finished"
                  ? "Round over — stay at your board until your result is recorded"
                  : clock.phase === "paused"
                    ? "Paused by the director"
                    : "Remaining in this round"}
              </p>
            </>
          ) : (
            <p className="mt-[3vh] text-[3vw] font-extrabold" style={{ color: `${IVORY}88` }}>
              Waiting for the first round
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-dvh px-[1.4vw] py-[0.9vh]"
      style={{
        background: `radial-gradient(120% 80% at 50% -10%, ${FELT} 0%, ${NIGHT} 72%)`,
        color: IVORY,
      }}
    >
      <header className="flex items-baseline justify-between gap-[2vw]">
        <p className="text-[1.7vw] font-extrabold uppercase tracking-[0.16em]" style={{ color: BRASS }}>
          {eventName}
        </p>
        <p className="text-[1.7vw] font-extrabold">
          {showingBoards
            ? `Round ${live.round}${clock.phase === "running" ? " live" : ""} — find your table`
            : `Checked in — ${arrivals.length} here`}
        </p>
        {/*
         * The round clock, the one everybody in the room is playing to. Late matches have no
         * clock of their own; what is left here is what they have.
         */}
        <p className="num text-[1.7vw] font-extrabold tabular-nums" style={{ color: clockLine && clock.phase === "running" ? BRASS : `${IVORY}88` }}>
          {clockLine ?? (showingBoards
            ? `${done} of ${playable} ${playable === 1 ? "result" : "results"} in`
            : "Boards go up when the round starts")}
        </p>
      </header>

      {showingBoards ? (
        <>
          <BoardSheet boards={boards} only={visible} />
          {rotating ? (
            <p className="mt-[0.8vh] text-center text-[1vw]" style={{ color: `${IVORY}66` }}>
              {present.map((d) => LABEL[d] ?? d).join("  ·  ")} — showing {LABEL[visible[0]] ?? visible[0]}
            </p>
          ) : null}
        </>
      ) : (
        <ArrivalSheet arrivals={arrivals} />
      )}
    </main>
  );
}

/** Every board of the round, grouped by category, with the score once it is settled. */
function BoardSheet({ boards, only }: { boards: PublicBoard[]; only?: readonly string[] }) {
  const groups = DIVISIONS.filter((d) => !only || only.includes(d)).map((division) => ({
    division,
    played: boards
      .filter((b) => b.division === division && b.playerB !== null)
      .sort((a, b) => a.board - b.board),
    byes: boards.filter((b) => b.division === division && b.playerB === null),
  })).filter((g) => g.played.length > 0 || g.byes.length > 0);

  return (
    <div className="mt-[0.6vh] space-y-[0.5vh]">
      {groups.map(({ division, played, byes }) => (
        <section key={division}>
          <Heading
            label={LABEL[division] ?? division}
            note={`${played.length} ${played.length === 1 ? "board" : "boards"}`}
          />
          {/*
           * Two wide columns rather than three narrow ones. A board is two people facing each
           * other across a table, so the row is written that way — one name each side of the
           * table number — and that needs room for two long names on one line.
           */}
          <ul
            className="mt-[0.4vh] grid gap-[0.3vw]"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(42vw, 1fr))" }}
          >
            {played.map((b) => (
              <BoardRow key={b.board} board={b} />
            ))}
            {byes.map((b) => (
              <ByeRow key={`bye-${b.playerA}`} name={b.playerA} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BoardRow({ board }: { board: PublicBoard }) {
  const settled = board.scoreA !== null && board.scoreB !== null;
  const aWon = settled && (board.scoreA ?? 0) > (board.scoreB ?? 0);
  const bWon = settled && (board.scoreB ?? 0) > (board.scoreA ?? 0);

  return (
    <li
      className="flex items-center gap-[0.5vw] rounded-[0.4vw] px-[0.5vw] py-[0.25vh]"
      style={{ background: "rgba(255,255,255,0.05)" }}
    >
      <Side name={board.playerA} score={board.scoreA} won={aWon} align="right" />
      {/* The table number sits between them, where the table itself does. */}
      <span
        className="grid shrink-0 place-items-center rounded-[0.3vw] text-[1.35vw] font-extrabold tabular-nums"
        style={{ background: BRASS, color: NIGHT, width: "2.5vw", height: "2.5vw" }}
      >
        {board.board}
      </span>
      <Side name={board.playerB ?? ""} score={board.scoreB} won={bWon} align="left" />
    </li>
  );
}

/** One side of a table: the name, and the score only once there is one. */
function Side({
  name,
  score,
  won,
  align,
}: {
  name: string;
  score: number | null;
  won: boolean;
  align: "left" | "right";
}) {
  const nameEl = (
    <span
      className="min-w-0 flex-1 truncate text-[1.05vw]"
      style={{
        fontWeight: won ? 800 : 600,
        color: won ? EMERALD : IVORY,
        textAlign: align === "right" ? "right" : "left",
      }}
    >
      {name}
    </span>
  );
  const scoreEl =
    score !== null ? (
      <span
        className="shrink-0 text-[1.05vw] font-extrabold tabular-nums"
        style={{ color: won ? EMERALD : `${IVORY}AA`, width: "2.6vw", textAlign: "center" }}
      >
        {score}
      </span>
    ) : null;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-[0.4vw]">
      {align === "right" ? (
        <>
          {nameEl}
          {scoreEl}
        </>
      ) : (
        <>
          {scoreEl}
          {nameEl}
        </>
      )}
    </span>
  );
}

function ByeRow({ name }: { name: string }) {
  return (
    <li
      className="flex items-center gap-[0.5vw] rounded-[0.4vw] px-[0.5vw] py-[0.25vh]"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <span
        className="min-w-0 flex-1 truncate text-[1.05vw] font-bold"
        style={{ textAlign: "right" }}
      >
        {name}
      </span>
      {/* A bye has no table, so it is not given anything that looks like a table number. */}
      <span
        className="grid shrink-0 place-items-center rounded-[0.35vw] text-[1.3vw] font-extrabold"
        style={{ background: "rgba(255,255,255,0.1)", color: `${IVORY}88`, width: "2.5vw", height: "2.5vw" }}
      >
        &mdash;
      </span>
      <span className="min-w-0 flex-1 text-[1.05vw]" style={{ color: `${IVORY}99` }}>
        Bye &mdash; no game this round
      </span>
    </li>
  );
}

/** Everybody in the room, by category, while the boards are still being made. */
function ArrivalSheet({ arrivals }: { arrivals: PublicArrival[] }) {
  if (arrivals.length === 0) {
    return (
      <p className="mt-[20vh] text-center text-[2.6vw] font-extrabold" style={{ color: `${IVORY}88` }}>
        Nobody has checked in yet.
      </p>
    );
  }

  const groups = DIVISIONS.map((division) => ({
    division,
    people: arrivals.filter((a) => a.division === division),
  })).filter((g) => g.people.length > 0);

  return (
    <div className="mt-[1.4vh] space-y-[1.4vh]">
      {groups.map(({ division, people }) => (
        <section key={division}>
          <Heading label={LABEL[division] ?? division} note={`${people.length} here`} />
          <ul
            className="mt-[0.6vh] grid gap-[0.4vw]"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(20vw, 1fr))" }}
          >
            {people.map((p) => (
              <li
                key={p.number || p.name}
                className="flex items-center gap-[0.5vw] rounded-[0.4vw] px-[0.5vw] py-[0.4vh]"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <span
                  className="shrink-0 text-[1vw] font-extrabold tabular-nums"
                  style={{ color: BRASS }}
                >
                  {p.number}
                </span>
                <span className="min-w-0 truncate text-[1.1vw] font-semibold">{p.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Heading({ label, note }: { label: string; note: string }) {
  return (
    <p className="text-[1.4vw] font-extrabold uppercase tracking-[0.14em]" style={{ color: EMERALD }}>
      {label}
      <span style={{ color: `${IVORY}66` }}> · {note}</span>
    </p>
  );
}
