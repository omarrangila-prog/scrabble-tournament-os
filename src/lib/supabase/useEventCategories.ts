"use client";

import * as React from "react";

import type { Division } from "@/lib/domain/types";

import { supabase } from "./client";

/**
 * The categories one event runs.
 *
 * They used to be three fixed strings hardcoded in four places — the TypeScript union, the
 * seed, the roster mapping and the database's own validation — so running an Under-12 section
 * or a single Open field meant a code change. They are now a per-event setting, stored beside
 * rounds and round length, and this is how a screen reads them.
 *
 * An event that has never been given a list gets the three that used to be hardcoded, so
 * nothing that already exists behaves differently.
 */

/** What the database stores. `accent` is only a colour, so an unknown one is not an error. */
const ACCENTS: Division["accent"][] = ["primary", "secondary", "success", "warning"];

function toDivision(raw: unknown): Division | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = String(r.id ?? "").trim();
  const name = String(r.name ?? "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    /* A board sheet needs something short; the first three letters beat an empty column. */
    shortName: String(r.shortName ?? "").trim() || name.slice(0, 3).toUpperCase(),
    accent: ACCENTS.find((a) => a === r.accent) ?? "primary",
  };
}

export function categoriesFrom(payload: unknown): Division[] {
  if (!Array.isArray(payload)) return [];
  return payload.map(toDivision).filter((d): d is Division => d !== null);
}

export async function readEventCategories(eventId: string): Promise<Division[]> {
  const db = supabase();
  if (!db || !eventId) return [];

  const { data, error } = await db.rpc("event_categories", { p_event_id: eventId });
  if (error) return [];
  return categoriesFrom(data);
}

export async function writeEventCategories(
  eventId: string,
  categories: Division[],
  by: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_event_categories", {
    p_event_id: eventId,
    p_categories: categories,
    p_by: by,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Editing categories needs migration 0056 applied." };
    }
    /*
     * The database's own refusals name exactly what is wrong — somebody is entered in a
     * category being removed, two share an id, a name is blank — and each one tells the
     * director what to do about it. Flattening them would waste that.
     */
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }
  return { ok: true };
}

export interface EventCategoriesState {
  categories: Division[];
  loaded: boolean;
  reload: () => void;
}

export function useEventCategories(eventId: string): EventCategoriesState {
  const [categories, setCategories] = React.useState<Division[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const rows = await readEventCategories(eventId);
      if (!live) return;
      setCategories(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  return { categories, loaded, reload };
}
