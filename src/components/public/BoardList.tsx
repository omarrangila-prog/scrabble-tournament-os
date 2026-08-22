"use client";

import * as React from "react";

import { boardsForRound, currentPublicRound, type PublicBoard } from "@/lib/supabase/games";
import { subscribeToBoardChanges } from "@/lib/supabase/realtime";
import { RoundClock } from "./RoundClock";

/**
 * "Which board am I on?"
 *
 * The only question a participant has between rounds, and until now the app could
 * not answer it: pairings lived in the director's browser, so a phone opening the
 * live page saw nothing. This reads the published round from the database, needs no
 * login, and works on the venue screen as well as in a hand.
 *
 * Names appear without a login because this is a pairing sheet — the thing that
 * would otherwise be printed and taped to a wall. Row ids do not appear at all.
 */
export function BoardList({
  eventId,
  refreshSeconds = 30,
  highlight = "",
}: {
  eventId: string;
  /** How often to re-read. Between rounds a stale sheet sends people to the wrong table. */
  refreshSeconds?: number;
  /** A name to pick out, if the visitor has told us who they are. */
  highlight?: string;
}) {
  const [round, setRound] = React.useState(0);
  const [boards, setBoards] = React.useState<PublicBoard[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [ticks, setTicks] = React.useState(0);

  /*
   * The poll is the guarantee. A phone in a pocket with no signal misses the live
   * message and still catches up on its next tick, so being briefly late is the
   * worst case rather than being wrong.
   */
  React.useEffect(() => {
    const id = window.setInterval(
      () => setTicks((n) => n + 1),
      Math.max(5, refreshSeconds) * 1000,
    );
    return () => window.clearInterval(id);
  }, [refreshSeconds]);

  /*
   * The live nudge, which makes it instant when it arrives. It carries no data —
   * anyone can join this channel, so a score arriving over it would be a score
   * nobody authenticated. It only says "look again", and the re-read goes through
   * the same function as always.
   */
  React.useEffect(
    () => subscribeToBoardChanges(eventId, () => setTicks((n) => n + 1)),
    [eventId],
  );

  React.useEffect(() => {
    let live = true;

    (async () => {
      const current = await currentPublicRound(eventId);
      if (!live) return;

      const rows = current > 0 ? await boardsForRound(eventId, current) : [];
      if (!live) return;

      setRound(current);
      setBoards(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, ticks]);

  const term = query.trim().toLowerCase() || highlight.trim().toLowerCase();

  const shown = React.useMemo(() => {
    if (!term) return boards;
    return boards.filter(
      (b) =>
        b.playerA.toLowerCase().includes(term) ||
        (b.playerB ?? "").toLowerCase().includes(term) ||
        String(b.board) === term,
    );
  }, [boards, term]);

  if (!loaded) {
    return (
      <p className="rounded-[14px] bg-black/5 px-4 py-6 text-center text-[14px] text-black/60">
        Loading the board list…
      </p>
    );
  }

  if (round === 0) {
    return (
      <div className="rounded-[14px] bg-black/5 px-4 py-8 text-center">
        <p className="text-[15px] font-bold">No round on the boards yet</p>
        <p className="mt-1 text-[13.5px] text-black/60">
          Pairings appear here as soon as the first round is published. This page updates
          itself — no need to refresh.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/*
        * The same clock the director and the wall are looking at. A player at a board
        * should not have to ask how long is left.
        */}
      <RoundClock eventId={eventId} round={round} className="mb-3" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-black/50">
          Round {round} · {boards.length} {boards.length === 1 ? "board" : "boards"}
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type your name"
          aria-label="Find your board by name"
          className="ml-auto w-full rounded-[10px] border border-black/15 bg-white px-3 py-2 text-[15px] outline-none focus:border-black/40 sm:w-56"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[14px] bg-black/5 px-4 py-6 text-center text-[14px] text-black/60">
          No board matches “{query.trim()}”. Check the spelling, or ask a volunteer.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((b) => {
            const mine =
              term.length > 0 &&
              (b.playerA.toLowerCase().includes(term) ||
                (b.playerB ?? "").toLowerCase().includes(term));

            return (
              <li
                key={b.board}
                className={
                  mine
                    ? "flex items-center gap-3 rounded-[12px] border-2 border-[#2F5D3A] bg-[#2F5D3A]/8 px-3.5 py-3"
                    : "flex items-center gap-3 rounded-[12px] bg-black/4 px-3.5 py-3"
                }
              >
                {/*
                  A bye carries a board number for storage — a round is one row per board and
                  they have to differ — but it is not a table and must not be shown as one.
                  Sending somebody with a bye to "table 7" is exactly the confusion the bye
                  row exists to prevent.
                */}
                <span
                  className={
                    b.playerB
                      ? "grid size-11 shrink-0 place-items-center rounded-[10px] bg-[#2F5D3A] text-[17px] font-extrabold text-white"
                      : "grid size-11 shrink-0 place-items-center rounded-[10px] bg-black/12 text-[17px] font-extrabold text-black/45"
                  }
                >
                  {b.playerB ? b.board : "—"}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{b.playerA}</span>
                  <span className="block truncate text-[13.5px] text-black/60">
                    {b.playerB ? `v ${b.playerB}` : "Bye — no game this round"}
                  </span>
                </span>

                {/* Scores only once they are in. A blank is not a nil-nil draw. */}
                {b.scoreA !== null ? (
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-extrabold tabular-nums">
                      {b.scoreA}
                      {b.playerB ? ` – ${b.scoreB}` : ""}
                    </span>
                    <span className="block text-[11.5px] uppercase tracking-[0.1em] text-black/45">
                      final
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-black/40">
                    playing
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
