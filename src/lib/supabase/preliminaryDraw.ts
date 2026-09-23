"use client";

import type { PreliminaryDraw } from "@/lib/domain/preliminary";

import { supabase } from "./client";

/**
 * The night-before draw, read and written.
 *
 * Stored on the event, not in this browser. The laptop at midnight is not always the laptop
 * at nine, and a draw that only one machine knows about is a draw the morning cannot find.
 */

export interface StoredPreliminaryDraw extends PreliminaryDraw {
  /** The seed it was drawn with, so regenerating gives the same sheet the director printed. */
  seed: number;
  savedAt?: string;
  savedBy?: string;
}

export async function readPreliminaryDraw(eventId: string): Promise<StoredPreliminaryDraw | null> {
  const db = supabase();
  if (!db || !eventId) return null;

  const { data, error } = await db.rpc("event_preliminary_draw", { p_event_id: eventId });
  if (error || !data || typeof data !== "object") return null;

  const raw = data as Record<string, unknown>;
  if (!Array.isArray(raw.pairs)) return null;

  return raw as unknown as StoredPreliminaryDraw;
}

export async function savePreliminaryDraw(
  eventId: string,
  draw: StoredPreliminaryDraw | null,
  by: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_save_preliminary_draw", {
    p_event_id: eventId,
    p_draw: draw,
    p_by: by,
  });

  if (error) {
    /* The database's refusals name the problem; "could not save" would not. */
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }

  return { ok: true };
}
