"use client";

import * as React from "react";

import type { PairingSystem } from "@/lib/domain/types";

import { supabase } from "./client";

/**
 * How many rounds, how long each one runs, and which pairing system decides them.
 *
 * Held on the event rather than in a browser, because the wall, the director's phone and
 * every participant have to agree — a length kept in one laptop would put a twenty-minute
 * clock on the television and a twenty-five-minute one on a phone.
 *
 * Rounds and round length are decisions made in the room on the morning, once the director
 * has seen how many people came and how much of the hall they have. The pairing system is
 * not — round robin's schedule is fixed the moment Round 1 is generated, so it belongs in
 * Settings, decided ahead of the day, not changed here with a room full of people waiting.
 */

export interface EventFormat {
  rounds: number;
  roundMinutes: number;
  system: PairingSystem;
}

export const ROUND_LENGTHS = [20, 25] as const;
export const ROUND_COUNTS = [4, 5] as const;

const KNOWN_SYSTEMS: PairingSystem[] = ["swiss", "round-robin", "knockout", "king-of-the-hill", "manual"];

function asPairingSystem(value: unknown): PairingSystem {
  return KNOWN_SYSTEMS.find((s) => s === value) ?? "swiss";
}

export async function readEventFormat(eventId: string): Promise<EventFormat | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("event_format", { p_event_id: eventId });
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as Record<string, unknown>;
  return {
    rounds: Number(row.out_rounds ?? 5),
    roundMinutes: Number(row.out_round_minutes ?? 20),
    system: asPairingSystem(row.out_pairing_system),
  };
}

export async function writeEventFormat(
  eventId: string,
  format: EventFormat,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_event_format", {
    p_event_id: eventId,
    p_rounds: format.rounds,
    p_round_minutes: format.roundMinutes,
    p_pairing_system: format.system,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "The round settings need migration 0040 applied." };
    }
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }
  return { ok: true };
}

/**
 * The format, kept in step with the database.
 *
 * `fallback` is whatever the caller already believed, so the screen never flashes a made-up
 * number while the real one is being read.
 */
export function useEventFormat(eventId: string, fallback: EventFormat) {
  const [format, setFormat] = React.useState<EventFormat>(fallback);
  const [loaded, setLoaded] = React.useState(false);
  const [nudge, setNudge] = React.useState(0);

  const reload = React.useCallback(() => setNudge((n) => n + 1), []);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const read = await readEventFormat(eventId);
      if (!live) return;
      if (read) setFormat(read);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, nudge]);

  const save = React.useCallback(
    async (next: EventFormat) => {
      const out = await writeEventFormat(eventId, next);
      if (out.ok) setFormat(next);
      return out;
    },
    [eventId],
  );

  return { format, loaded, save, reload };
}
