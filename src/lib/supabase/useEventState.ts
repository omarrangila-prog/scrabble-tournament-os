"use client";

import * as React from "react";

import type { EventState } from "@/lib/domain/events";

import { supabase } from "./client";
import { subscribeToBoardChanges } from "./realtime";

/**
 * The event's phase, from the database.
 *
 * This decides what a participant sees when they open the link: register, check in,
 * find your board, or final results. It used to be read from browser storage, so
 * every device had its own copy — the director's "Open check-in" changed the
 * director's laptop and nothing else, and a participant's phone stayed on
 * `registration-open` all day. Somebody scanning the venue code to find their board
 * was sent to the registration form they had already filled in.
 *
 * Polls, and also listens for the live nudge, so a phone left open follows the day
 * without being refreshed.
 */
export function useEventState(
  eventId: string,
  refreshSeconds = 20,
): { state: EventState | null; loaded: boolean; reload: () => void } {
  const [state, setState] = React.useState<EventState | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [ticks, setTicks] = React.useState(0);

  const reload = React.useCallback(() => setTicks((n) => n + 1), []);

  React.useEffect(() => {
    const id = window.setInterval(
      () => setTicks((n) => n + 1),
      Math.max(5, refreshSeconds) * 1000,
    );
    return () => window.clearInterval(id);
  }, [refreshSeconds]);

  /*
   * The same nudge the board list uses. A phase change is exactly when a phone most
   * needs to move on — from check-in to the board list — so waiting out the poll is
   * the wrong behaviour if a message is available.
   */
  React.useEffect(() => subscribeToBoardChanges(eventId, reload), [eventId, reload]);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const db = supabase();
      if (!db) {
        /*
         * Unconfigured. Report null rather than guessing a phase: a wrong guess
         * would send a room full of people to the wrong screen, and the caller can
         * say "we cannot reach the event right now" instead.
         */
        if (live) setLoaded(true);
        return;
      }

      const { data, error } = await db.rpc("event_public_state", { p_event_id: eventId });
      if (!live) return;

      if (!error && typeof data === "string") setState(data as EventState);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, ticks]);

  return { state, loaded, reload };
}

/** Moves the event to a new phase. Staff only, enforced in the database. */
export async function setEventPhase(
  eventId: string,
  state: EventState,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_event_state", {
    p_event_id: eventId,
    p_state: state,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Changing the event phase needs migration 0022 applied." };
    }
    return { ok: false, message: "Could not change the phase. Please try again." };
  }

  return { ok: true };
}
