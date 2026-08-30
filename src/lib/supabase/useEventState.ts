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

/**
 * Moves the event to a new phase.
 *
 * The database decides. `transition_event_state` holds the legal edges and the conditions
 * on them, so this is a request rather than an instruction — and the refusal it sends back
 * is the useful part.
 *
 * That refusal used to be discarded and replaced with "Could not change the phase. Please
 * try again", which was survivable while every transition succeeded and is not now: the
 * server says "1 board(s) in round 1 still have no score", and telling a director to try
 * again instead is worse than saying nothing. Postgres prefixes its errors, so only the
 * prefix is trimmed.
 */
export async function setEventPhase(
  eventId: string,
  state: EventState,
  options: { by?: string; reason?: string; force?: boolean } = {},
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = options.force
    ? await db.rpc("transition_event_state", {
        p_event_id: eventId,
        p_target: state,
        p_by: options.by ?? null,
        p_reason: options.reason ?? null,
        p_force: true,
      })
    : await db.rpc("staff_set_event_state", { p_event_id: eventId, p_state: state });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Changing the event phase needs migration 0060 applied." };
    }
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }

  return { ok: true };
}

/** One phase the event may move to, and why it cannot yet if it cannot. */
export interface NextState {
  state: EventState;
  /** Null when the move is available now. A sentence to show beside a disabled control. */
  blockedReason: string | null;
}

/**
 * The phases this event may move to next, straight from the graph.
 *
 * Blocked moves are returned rather than hidden, because "Finalize round" greyed out with
 * "2 boards still have no score" tells a director what to do, and a button that has
 * disappeared tells them the software is broken.
 */
export async function readNextStates(eventId: string): Promise<NextState[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_next_states", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    state: String(row.out_state ?? "") as EventState,
    blockedReason: (row.out_blocked_reason as string | null) ?? null,
  }));
}
