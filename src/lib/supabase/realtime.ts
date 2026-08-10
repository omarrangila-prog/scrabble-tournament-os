"use client";

/**
 * Live updates.
 *
 * Two mechanisms, because the two audiences have different rights and the
 * difference is deliberate rather than incidental.
 *
 * Staff subscribe to the tables. Realtime enforces row level security, and staff
 * are the only role permitted to read `games` and registrations, so a score
 * entered on one laptop reaches every other staff screen without anybody pressing
 * Refresh.
 *
 * Participants subscribe to a broadcast channel carrying no data at all — just a
 * signal that something changed. They then re-read the board list through the
 * function that returns names and no row ids. This is why they are not simply
 * given read access to the table: a participant has no use for a registration id,
 * and handing one out invites somebody to try addressing the database with it.
 *
 * Every subscription here is an optimisation. The screens all poll or reload on
 * their own as well, so a device that misses a message — asleep, out of signal,
 * Realtime disabled on the project — falls back to being a few seconds late rather
 * than being wrong. Nothing in the app depends on a message arriving.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "./client";

/** A no-op unsubscribe, for when there is nothing to subscribe to. */
const NOTHING = () => {};

function channelName(kind: string, eventId: string): string {
  return `${kind}:${eventId}`;
}

/**
 * Calls back whenever a game for this event changes.
 *
 * Staff only — Realtime applies the same policy the table has, so an anonymous
 * subscriber receives nothing. Passes no payload on purpose: the caller re-reads
 * through the usual path, so there is one code path that turns database rows into
 * screen state rather than two that can disagree.
 */
export function subscribeToGames(eventId: string, onChange: () => void): () => void {
  const db = supabase();
  if (!db) return NOTHING;

  let channel: RealtimeChannel;

  try {
    channel = db
      .channel(channelName("games", eventId))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `event_id=eq.${eventId}`,
        },
        () => onChange(),
      )
      .subscribe();
  } catch {
    /*
     * Realtime may not be enabled on the project. That is not a reason to break a
     * page whose data is already correct — it just means updates arrive on the next
     * refresh instead of instantly.
     */
    return NOTHING;
  }

  return () => {
    void db.removeChannel(channel);
  };
}

/** Calls back whenever a registration changes: a new entry, an arrival, a payment. */
export function subscribeToRegistrations(eventId: string, onChange: () => void): () => void {
  const db = supabase();
  if (!db) return NOTHING;

  let channel: RealtimeChannel;

  try {
    channel = db
      .channel(channelName("registrations", eventId))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "records",
          filter: `event_id=eq.${eventId}`,
        },
        () => onChange(),
      )
      .subscribe();
  } catch {
    return NOTHING;
  }

  return () => {
    void db.removeChannel(channel);
  };
}

/* -------------------------------------------------------------------------- */
/* The participant nudge                                                       */
/* -------------------------------------------------------------------------- */

const NUDGE = "changed";

let nudgeChannel: RealtimeChannel | null = null;
let nudgeChannelFor = "";

/**
 * The channel used for participant nudges.
 *
 * Kept as one channel per event rather than one per caller: a director publishing
 * a round and recording twelve scores should hold one connection, not thirteen.
 */
function nudgeChannelFor_(eventId: string): RealtimeChannel | null {
  const db = supabase();
  if (!db) return null;

  if (nudgeChannel && nudgeChannelFor === eventId) return nudgeChannel;

  if (nudgeChannel) void db.removeChannel(nudgeChannel);
  nudgeChannelFor = eventId;
  nudgeChannel = db.channel(channelName("boards", eventId)).subscribe();
  return nudgeChannel;
}

/**
 * Tells participants that the boards changed.
 *
 * Sends no data. Anyone can join this channel, so anything put in the message
 * would be public — and a name or a score arriving over a channel nobody
 * authenticated is exactly the kind of thing that ends up trusted by accident.
 * The message says only "look again".
 */
export function announceBoardsChanged(eventId: string): void {
  try {
    const channel = nudgeChannelFor_(eventId);
    if (!channel) return;

    void channel.send({ type: "broadcast", event: NUDGE, payload: {} });
  } catch {
    // Best-effort. Participants poll as well, so a lost nudge costs a few seconds.
  }
}

/** Listens for the nudge. Used by the public board list. */
export function subscribeToBoardChanges(eventId: string, onChange: () => void): () => void {
  const db = supabase();
  if (!db) return NOTHING;

  let channel: RealtimeChannel;

  try {
    channel = db
      .channel(channelName("boards", eventId))
      .on("broadcast", { event: NUDGE }, () => onChange())
      .subscribe();
  } catch {
    return NOTHING;
  }

  return () => {
    void db.removeChannel(channel);
  };
}

/** Testing seam. */
export function resetRealtime(): void {
  const db = supabase();
  if (db && nudgeChannel) void db.removeChannel(nudgeChannel);
  nudgeChannel = null;
  nudgeChannelFor = "";
}
