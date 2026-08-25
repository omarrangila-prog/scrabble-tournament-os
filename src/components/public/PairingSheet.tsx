"use client";

import * as React from "react";

import { boardsForRound, type PublicBoard } from "@/lib/supabase/games";
import { publicArrivals, type PublicArrival } from "@/lib/supabase/submitResult";
import { useRoundProgress } from "@/lib/supabase/useRoundProgress";

const NIGHT = "#0E1512";
const FELT = "#14261C";
const IVORY = "#F4EFE4";
const BRASS = "#C89B3C";
const EMERALD = "#4FA87A";

const DIVISIONS = ["beginner", "recreational", "advanced"] as const;
const LABEL: Record<string, string> = {
  beginner: "Beginner",
  recreational: "Recreational",
  advanced: "Advanced",
};

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
export function PairingSheet({ eventId, eventName }: { eventId: string; eventName: string }) {
  const live = useRoundProgress(eventId, 10);
  const [boards, setBoards] = React.useState<PublicBoard[]>([]);
  const [arrivals, setArrivals] = React.useState<PublicArrival[]>([]);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [found, here] = await Promise.all([
        live.round >= 1 ? boardsForRound(eventId, live.round) : Promise.resolve([]),
        publicArrivals(eventId),
      ]);
      if (!alive) return;
      setBoards(found);
      setArrivals(here);
    })();
    return () => {
      alive = false;
    };
  }, [eventId, live.round, tick]);

  const showingBoards = boards.length > 0;
  const done = boards.filter((b) => b.scoreA !== null && b.scoreB !== null).length;
  const playable = boards.filter((b) => b.playerB !== null).length;

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
            ? `Round ${live.round} — find your table`
            : `Checked in — ${arrivals.length} here`}
        </p>
        <p className="text-[1.2vw]" style={{ color: `${IVORY}88` }}>
          {showingBoards
            ? `${done} of ${playable} ${playable === 1 ? "result" : "results"} in`
            : "Boards go up when the round starts"}
        </p>
      </header>

      {showingBoards ? (
        <BoardSheet boards={boards} />
      ) : (
        <ArrivalSheet arrivals={arrivals} />
      )}
    </main>
  );
}

/** Every board of the round, grouped by category, with the score once it is settled. */
function BoardSheet({ boards }: { boards: PublicBoard[] }) {
  const groups = DIVISIONS.map((division) => ({
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
