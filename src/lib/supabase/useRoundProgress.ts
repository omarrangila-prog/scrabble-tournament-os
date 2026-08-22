"use client";

import * as React from "react";

import { supabase } from "./client";

/**
 * Which round it is and how many boards are in — for a screen with no account.
 *
 * The wall used the staff games read, which returns nothing to a browser that has never
 * signed in. On a laptop that already holds a session it looked correct; on an actual
 * television it announced "Round 0" and "0 / 0 boards in" during result entry.
 *
 * Two numbers and a round, and nothing about anybody. The board list has its own public read.
 */

export interface RoundProgress {
  round: number;
  boards: number;
  verified: number;
}

const NONE: RoundProgress = { round: 0, boards: 0, verified: 0 };

export function useRoundProgress(eventId: string, refreshSeconds = 8) {
  const [progress, setProgress] = React.useState<RoundProgress>(NONE);
  const [loaded, setLoaded] = React.useState(false);
  const [ticks, setTicks] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(
      () => setTicks((n) => n + 1),
      Math.max(3, refreshSeconds) * 1000,
    );
    return () => window.clearInterval(id);
  }, [refreshSeconds]);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const db = supabase();
      if (!db) {
        if (live) setLoaded(true);
        return;
      }

      const { data, error } = await db.rpc("event_round_progress", { p_event_id: eventId });
      if (!live) return;

      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0] as Record<string, unknown>;
        setProgress({
          round: Number(row.out_round ?? 0),
          boards: Number(row.out_boards ?? 0),
          verified: Number(row.out_verified ?? 0),
        });
      }
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, ticks]);

  return { ...progress, loaded };
}
