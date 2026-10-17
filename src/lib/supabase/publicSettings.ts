"use client";

import { supabase } from "./client";

/**
 * What a director may change about the public pages.
 *
 * Both are decided in the database — one needs the director role and the other the results
 * capability — so a screen that offers the button to somebody who may not use it gets an honest
 * refusal back rather than a silent no-op.
 */

export async function savePublicRegistrationSettings(input: {
  eventId: string;
  enabled: boolean;
  columns: string[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_public_registration_settings", {
    p_event_id: input.eventId,
    p_enabled: input.enabled,
    p_columns: input.columns,
    p_by: null,
  });

  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  return { ok: true };
}

export async function saveLiveDefaultCategory(
  eventId: string,
  category: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_live_default_category", {
    p_event_id: eventId,
    p_category: category,
    p_by: null,
  });

  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  return { ok: true };
}
