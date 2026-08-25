"use client";

import * as React from "react";

import { supabase } from "./client";

/**
 * Real, server-backed event settings.
 *
 * Before this, nothing in the codebase had a genuine feature-flag mechanism. The closest
 * thing was four toggles on the Settings page — two hardcoded on with a no-op handler, two
 * writing to a Zustand/localStorage model no Supabase-backed screen ever read. This is the
 * real thing: one row in Postgres, read from the same place by every screen that cares,
 * writable only by staff, every change audited.
 */

export interface EventSettings {
  qrEnabled: boolean;
  selfCheckinEnabled: boolean;
  playerScoreEntryEnabled: boolean;
  opponentConfirmationEnabled: boolean;
  certificatesEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  firstSecondEnabled: boolean;
}

/** Every flag on, except first/second — the behaviour this app already had before flags existed. */
export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  qrEnabled: true,
  selfCheckinEnabled: true,
  playerScoreEntryEnabled: true,
  opponentConfirmationEnabled: true,
  certificatesEnabled: true,
  emailEnabled: true,
  whatsappEnabled: true,
  firstSecondEnabled: false,
};

function fromRow(row: Record<string, unknown> | null | undefined): EventSettings {
  if (!row) return DEFAULT_EVENT_SETTINGS;
  return {
    qrEnabled: Boolean(row.qr_enabled ?? true),
    selfCheckinEnabled: Boolean(row.self_checkin_enabled ?? true),
    playerScoreEntryEnabled: Boolean(row.player_score_entry_enabled ?? true),
    opponentConfirmationEnabled: Boolean(row.opponent_confirmation_enabled ?? true),
    certificatesEnabled: Boolean(row.certificates_enabled ?? true),
    emailEnabled: Boolean(row.email_enabled ?? true),
    whatsappEnabled: Boolean(row.whatsapp_enabled ?? true),
    firstSecondEnabled: Boolean(row.first_second_enabled ?? false),
  };
}

/** Staff read of every setting. */
export async function readEventSettings(eventId: string): Promise<EventSettings> {
  const db = supabase();
  if (!db) return DEFAULT_EVENT_SETTINGS;

  const { data, error } = await db.rpc("staff_get_event_settings", { p_event_id: eventId });
  if (error || !data) return DEFAULT_EVENT_SETTINGS;
  return fromRow(data as Record<string, unknown>);
}

/**
 * The four flags a participant's own phone needs — public, because that screen has no
 * session. Nothing sensitive: booleans, nothing else.
 */
export async function readPublicEventSettings(eventId: string): Promise<{
  qrEnabled: boolean;
  selfCheckinEnabled: boolean;
  playerScoreEntryEnabled: boolean;
  opponentConfirmationEnabled: boolean;
}> {
  const fallback = {
    qrEnabled: true,
    selfCheckinEnabled: true,
    playerScoreEntryEnabled: true,
    opponentConfirmationEnabled: true,
  };
  const db = supabase();
  if (!db) return fallback;

  const { data, error } = await db.rpc("event_public_settings", { p_event_id: eventId });
  if (error || !Array.isArray(data) || data.length === 0) return fallback;

  const row = data[0] as Record<string, unknown>;
  return {
    qrEnabled: Boolean(row.out_qr_enabled ?? true),
    selfCheckinEnabled: Boolean(row.out_self_checkin_enabled ?? true),
    playerScoreEntryEnabled: Boolean(row.out_player_score_entry_enabled ?? true),
    opponentConfirmationEnabled: Boolean(row.out_opponent_confirmation_enabled ?? true),
  };
}

/** Updates the given keys only; everything else holds. Staff only, audited server-side. */
export async function writeEventSettings(
  eventId: string,
  patch: Partial<EventSettings>,
  by: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_event_settings", {
    p_event_id: eventId,
    p_patch: patch,
    p_by: by,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Event settings need migration 0048 applied." };
    }
    return { ok: false, message: "Not saved. Please try again." };
  }
  return { ok: true };
}

export interface EventSettingsState {
  settings: EventSettings;
  loaded: boolean;
  reload: () => void;
}

/** Staff hook: the current event's settings, reloadable after a save. */
export function useEventSettings(eventId: string): EventSettingsState {
  const [settings, setSettings] = React.useState<EventSettings>(DEFAULT_EVENT_SETTINGS);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const next = await readEventSettings(eventId);
      if (!live) return;
      setSettings(next);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  return { settings, loaded, reload };
}

export interface PublicEventSettingsState {
  qrEnabled: boolean;
  selfCheckinEnabled: boolean;
  playerScoreEntryEnabled: boolean;
  opponentConfirmationEnabled: boolean;
  loaded: boolean;
}

/**
 * Participant-page hook: no session, no staff check, just the four flags a phone or a TV
 * needs to decide what to show. Defaults to everything on until the read completes, which
 * matches this app's behaviour before flags existed — a slow read never hides something a
 * fast one would have shown.
 */
export function usePublicEventSettings(eventId: string): PublicEventSettingsState {
  const [state, setState] = React.useState<PublicEventSettingsState>({
    qrEnabled: true,
    selfCheckinEnabled: true,
    playerScoreEntryEnabled: true,
    opponentConfirmationEnabled: true,
    loaded: false,
  });

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const next = await readPublicEventSettings(eventId);
      if (!live) return;
      setState({ ...next, loaded: true });
    })();

    return () => {
      live = false;
    };
  }, [eventId]);

  return state;
}
