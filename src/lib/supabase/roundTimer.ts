"use client";

import type { RoundTimer } from "@/lib/engine/roundTimer";

import { supabase } from "./client";

/**
 * The round clock, read from and written to the database.
 *
 * It lived in one browser's local storage, which made it private to the laptop that
 * started it: the wall display counted nothing and a player at a board could not see how
 * long was left. A clock only one person can see is not a clock.
 *
 * Only instants cross the wire. Phase and remaining time are derived by
 * `src/lib/engine/roundTimer.ts` on whatever screen is asking, so a phone opened late and
 * a display that just reconnected reach the same answer.
 */

export interface TimerExtension {
  minutes: number;
  reason: string;
  by: string;
  at: string;
}

function extensionsOf(value: unknown): TimerExtension[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const r = e as Record<string, unknown>;
    return [
      {
        minutes: Number(r.minutes ?? 0),
        reason: String(r.reason ?? ""),
        by: String(r.by ?? ""),
        at: String(r.at ?? ""),
      },
    ];
  });
}

/** One round's clock, or null when that round has none yet. */
export async function readRoundTimer(
  eventId: string,
  round: number,
): Promise<RoundTimer | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("event_round_timer", {
    p_event_id: eventId,
    p_round: round,
  });

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const r = data[0] as Record<string, unknown>;
  return {
    eventId,
    round: Number(r.out_round ?? round),
    plannedMinutes: Number(r.out_planned_minutes ?? 0),
    extensions: extensionsOf(r.out_extensions),
    startedAt: (r.out_started_at as string | null) ?? undefined,
    pausedAt: (r.out_paused_at as string | null) ?? undefined,
    pausedMs: Number(r.out_paused_ms ?? 0),
    endedAt: (r.out_ended_at as string | null) ?? undefined,
  };
}

/**
 * Records a clock the engine has just produced.
 *
 * The engine decides transitions; this only stores the result. Keeping the rules in one
 * language is why a round paused on the director's screen cannot come back running on
 * the display behind them.
 */
export async function saveRoundTimer(
  timer: RoundTimer,
  by: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_save_round_timer", {
    p_event_id: timer.eventId,
    p_round: timer.round,
    p_planned_minutes: timer.plannedMinutes,
    p_extensions: timer.extensions,
    p_started_at: timer.startedAt ?? null,
    p_paused_at: timer.pausedAt ?? null,
    p_paused_ms: timer.pausedMs,
    p_ended_at: timer.endedAt ?? null,
    p_by: by,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "The shared round clock needs migration 0026 applied." };
    }
    return { ok: false, message: "Could not save the round clock. Please try again." };
  }

  return { ok: true };
}
