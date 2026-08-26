"use client";

import * as React from "react";

import { supabase } from "./client";
import { listEvents, type EventDetails, type StoredEvent } from "./events";

/**
 * The event's own details, and the rules it pairs by — both editable.
 *
 * The "Tournament" card in Settings offered Name, Organizer, City, Time zone and Total
 * rounds. Name and Total rounds wrote to a browser-only store nothing has read since this app
 * moved to Postgres; Organizer, City and Time zone had no handler at all, so typing in them
 * did nothing whatsoever. The card looked editable for the whole life of the app and changed
 * nothing. This is what it should have been doing.
 */

export interface PairingRules {
  /** Never put two players together twice while any alternative exists. */
  avoidRepeatOpponents: boolean;
  /** Keep clubmates apart where possible. Only meaningful once players have a real club. */
  avoidSameClub: boolean;
  /** How many byes one player may receive across the tournament. At least one — a field with
   *  an odd number of players has to sit somebody out. */
  maxByesPerPlayer: number;
}

export const DEFAULT_PAIRING_RULES: PairingRules = {
  avoidRepeatOpponents: true,
  avoidSameClub: true,
  maxByesPerPlayer: 1,
};

export function pairingRulesFrom(payload: unknown): PairingRules {
  if (typeof payload !== "object" || payload === null) return DEFAULT_PAIRING_RULES;
  const r = payload as Record<string, unknown>;

  const byes = Number(r.maxByesPerPlayer);

  return {
    avoidRepeatOpponents: r.avoidRepeatOpponents !== false,
    avoidSameClub: r.avoidSameClub !== false,
    /* A stored zero or a missing value would deadlock an odd field, so it never reaches the
       engine — the database refuses to save one, and this refuses to read one back. */
    maxByesPerPlayer: Number.isFinite(byes) && byes >= 1 ? Math.min(5, Math.round(byes)) : 1,
  };
}

export async function readPairingRules(eventId: string): Promise<PairingRules> {
  const db = supabase();
  if (!db || !eventId) return DEFAULT_PAIRING_RULES;

  const { data, error } = await db.rpc("event_pairing_rules", { p_event_id: eventId });
  if (error) return DEFAULT_PAIRING_RULES;
  return pairingRulesFrom(data);
}

export async function writePairingRules(
  eventId: string,
  rules: PairingRules,
  by: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_pairing_rules", {
    p_event_id: eventId,
    p_rules: rules,
    p_by: by,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Editing pairing rules needs migration 0057 applied." };
    }
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }
  return { ok: true };
}

export async function writeEventDetails(
  eventId: string,
  input: { name: string; subtitle: string; details: EventDetails },
  by: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_event_details", {
    p_event_id: eventId,
    p_name: input.name,
    p_subtitle: input.subtitle,
    p_details: input.details,
    p_by: by,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Editing event details needs migration 0057 applied." };
    }
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }
  return { ok: true };
}

export interface EventDetailsState {
  event: StoredEvent | null;
  rules: PairingRules;
  loaded: boolean;
  reload: () => void;
}

export function useEventDetails(eventId: string): EventDetailsState {
  const [event, setEvent] = React.useState<StoredEvent | null>(null);
  const [rules, setRules] = React.useState<PairingRules>(DEFAULT_PAIRING_RULES);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const [events, pairing] = await Promise.all([listEvents(), readPairingRules(eventId)]);
      if (!live) return;
      setEvent(events.find((e) => e.id === eventId) ?? null);
      setRules(pairing);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  return { event, rules, loaded, reload };
}
