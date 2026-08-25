"use client";

import * as React from "react";

import { activePlayerIds, lockActivePlayers } from "./games";

/**
 * Who the tournament is actually running on.
 *
 * Pairing used to read whoever was checked in at the instant the button was pressed, with
 * nothing recorded afterward about who the tournament considered present. This reads back
 * the snapshot `staff_lock_active_players` writes — `null` while nothing has been locked
 * yet, at which point the caller falls back to the live roster.
 */
export interface ActiveLockState {
  ids: string[] | null;
  loaded: boolean;
  reload: () => void;
  lock: (by: string) => Promise<{ ok: boolean; count: number; alreadyPublished: boolean }>;
}

export function useActiveLock(eventId: string): ActiveLockState {
  const [ids, setIds] = React.useState<string[] | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const next = await activePlayerIds(eventId);
      if (!live) return;
      setIds(next);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  const lock = React.useCallback(
    async (by: string) => {
      const outcome = await lockActivePlayers(eventId, by);
      if (!outcome.ok) return { ok: false, count: 0, alreadyPublished: false };
      reload();
      return { ok: true, count: outcome.count, alreadyPublished: outcome.alreadyPublished };
    },
    [eventId, reload],
  );

  return { ids, loaded, reload, lock };
}
