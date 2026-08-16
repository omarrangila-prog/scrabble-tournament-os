"use client";

import * as React from "react";

import {
  latestRound,
  pairingsFromGames,
  roundProgress,
  type GameRow,
  type RoundProgress,
} from "@/lib/domain/games";
import type { Pairing } from "@/lib/domain/types";

import { listGames } from "./games";
import { subscribeToGames } from "./realtime";

export interface GamesState {
  games: GameRow[];
  /** The same games in the shape the standings and awards engines expect. */
  pairings: Pairing[];
  /** Highest round with boards, or 0 before anything is paired. */
  round: number;
  progress: RoundProgress;
  loaded: boolean;
  reload: () => void;
}

/**
 * Every game for an event, read from the database.
 *
 * Pairings and scores used to live in one browser, which meant a second laptop
 * could not enter results, closing the tab lost the tournament, and nothing
 * outside that browser knew what the boards were. Reading them from Postgres is
 * what lets the score table, the standings and the participant board list agree.
 *
 * Concurrent callers share one request, in the same way the roster does — several
 * screens want the games at once and each mount should not be its own round trip.
 */
const inflight = new Map<string, Promise<GameRow[]>>();

function readShared(eventId: string): Promise<GameRow[]> {
  const existing = inflight.get(eventId);
  if (existing) return existing;

  const promise = listGames(eventId).finally(() => {
    if (inflight.get(eventId) === promise) inflight.delete(eventId);
  });
  inflight.set(eventId, promise);
  return promise;
}

const NO_PROGRESS: RoundProgress = {
  totalBoards: 0,
  verified: 0,
  outstanding: 0,
  percentComplete: 0,
};

export function useGames(eventId: string, tournamentId = eventId): GamesState {
  const [games, setGames] = React.useState<GameRow[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  // A counter, so a refresh is a state change rather than a call from an effect.
  const [reloads, setReloads] = React.useState(0);
  const reload = React.useCallback(() => {
    /*
     * Drop any read already running. A refresh that follows a score entry must not
     * join a request that started before the write landed, or the board would still
     * look empty and somebody would type the score again.
     */
    inflight.delete(eventId);
    setReloads((n) => n + 1);
  }, [eventId]);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const rows = await readShared(eventId);
      if (!live) return;
      setGames(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  /*
   * Live updates, so a score entered on one laptop appears on the other without
   * anybody pressing Refresh. Depends only on the event id — re-subscribing every
   * time the data reloads would tear the connection down and rebuild it on every
   * score entered.
   *
   * This is an optimisation, not the mechanism: `reload` still works on its own,
   * so a device that misses a message is a few seconds late rather than wrong.
   */
  React.useEffect(() => subscribeToGames(eventId, reload), [eventId, reload]);

  /*
   * A slow poll behind the live subscription.
   *
   * Realtime is the fast path and usually the only one that matters — a score appears on
   * every screen in about a second. But it is best-effort: a dropped socket, a backgrounded
   * tab or a phone that slept can miss a message, and nothing tells the page it missed one.
   *
   * That was tolerable when a person was watching. It is not now that the last result of a
   * round is what triggers the next round being paired: a missed message would leave a room
   * waiting for something that had already happened. Fifteen seconds is far below the
   * interval anybody would notice and far above anything that troubles the database.
   */
  React.useEffect(() => {
    if (!eventId) return;
    const id = window.setInterval(reload, 15_000);
    return () => window.clearInterval(id);
  }, [eventId, reload]);

  const pairings = React.useMemo(
    () => pairingsFromGames(games, tournamentId),
    [games, tournamentId],
  );

  const round = React.useMemo(() => latestRound(games), [games]);

  const progress = React.useMemo(
    () => (round > 0 ? roundProgress(games, round) : NO_PROGRESS),
    [games, round],
  );

  return { games, pairings, round, progress, loaded, reload };
}
