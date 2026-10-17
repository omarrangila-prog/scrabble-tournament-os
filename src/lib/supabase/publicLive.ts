"use client";

/**
 * Reading public live data in the browser, and hearing that it changed.
 *
 * Anonymous callers cannot subscribe to table changes: row-level security hides `games` and
 * `records` from them, and it is right to. So the database broadcasts a ping on a public channel
 * — `event:<id>`, carrying only a timestamp — whenever a game or a registration changes, and the
 * page answers it by asking the same safe functions it asked the first time. The ping is a reason
 * to re-ask; it contains nothing to leak.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";

import { registrationsFrom, type PublicRegistrations } from "@/lib/domain/publicRegistrations";
import type { PublicGame } from "@/lib/domain/publicResults";

import { supabase } from "./client";

export async function readPublicRegistrationFeed(slug: string): Promise<PublicRegistrations | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("public_registrations", { p_slug: slug });
  if (error) throw new Error(error.message);
  return registrationsFrom(data);
}

export async function readPublicGames(eventId: string): Promise<PublicGame[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_public_games", { p_event_id: eventId });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    round: Number(r.out_round),
    board: Number(r.out_board),
    division: String(r.out_division ?? ""),
    playerA: String(r.out_player_a ?? ""),
    playerB: r.out_player_b === null || r.out_player_b === undefined ? null : String(r.out_player_b),
    scoreA: r.out_score_a === null || r.out_score_a === undefined ? null : Number(r.out_score_a),
    scoreB: r.out_score_b === null || r.out_score_b === undefined ? null : Number(r.out_score_b),
    status: String(r.out_status ?? ""),
    aFirst: r.out_a_first === null || r.out_a_first === undefined ? null : Boolean(r.out_a_first),
  }));
}

export interface CheckedInPlayer {
  number: string;
  name: string;
  division: string;
}

/** Who has arrived, by name and category. The same function the check-in screens already use. */
export async function readCheckedInPlayers(eventId: string): Promise<CheckedInPlayer[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_checked_in", { p_event_id: eventId });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    number: String(r.out_number ?? ""),
    name: String(r.out_name ?? ""),
    division: String(r.out_division ?? ""),
  }));
}

/**
 * Calls back whenever the event changes. Returns the way to stop listening.
 *
 * `onStatus` reports whether the channel is actually connected, so a page can say LIVE only when
 * it is — and fall back to polling, which it does regardless, when it is not.
 */
export function subscribeToEventPings(
  eventId: string,
  onPing: () => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  const db = supabase();
  if (!db || !eventId) return () => {};

  let channel: RealtimeChannel | null = null;

  try {
    channel = db
      .channel(`event:${eventId}`)
      .on("broadcast", { event: "changed" }, () => onPing())
      .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
  } catch {
    onStatus?.(false);
  }

  return () => {
    if (channel) void db.removeChannel(channel);
  };
}
