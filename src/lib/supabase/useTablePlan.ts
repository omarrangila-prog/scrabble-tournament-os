"use client";

import * as React from "react";

import type { DivisionTables } from "@/lib/domain/tables";
import { supabase } from "./client";

/**
 * Which tables each division sits at, read from the event.
 *
 * Stored on the event rather than in a browser because it describes a room. The wall
 * display, the director's phone and every participant have to agree about where table 7 is,
 * and a plan held in one laptop's storage would be known only to that laptop.
 */

export async function readTablePlan(eventId: string): Promise<DivisionTables[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_table_plan", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[])
    .map((row) => ({
      division: String(row.division ?? ""),
      tables: Array.isArray(row.tables) ? row.tables.map(Number).filter(Number.isFinite) : [],
    }))
    .filter((row) => row.division !== "");
}

export async function writeTablePlan(
  eventId: string,
  plan: DivisionTables[],
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_table_plan", {
    p_event_id: eventId,
    p_plan: plan,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "The table plan needs migration 0032 applied." };
    }
    return { ok: false, message: "The table plan was not saved." };
  }
  return { ok: true };
}

export interface TablePlanState {
  plan: DivisionTables[];
  loaded: boolean;
  reload: () => void;
}

export function useTablePlan(eventId: string): TablePlanState {
  const [plan, setPlan] = React.useState<DivisionTables[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const next = await readTablePlan(eventId);
      if (!live) return;
      setPlan(next);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  return { plan, loaded, reload };
}

/* -------------------------------------------------------------------------- */
/* Break, or lunch                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether the current break is a break or lunch.
 *
 * Both are the same phase — the room stops and the next round is prepared — so this is a
 * label rather than a state. What differs is only what the wall says, and a room reads
 * "lunch" very differently from "back shortly".
 */
export async function readBreakKind(eventId: string): Promise<"break" | "lunch"> {
  const db = supabase();
  if (!db) return "break";

  const { data, error } = await db.rpc("event_break_kind", { p_event_id: eventId });
  return !error && data === "lunch" ? "lunch" : "break";
}

export async function writeBreakKind(
  eventId: string,
  kind: "break" | "lunch",
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_set_break_kind", { p_event_id: eventId, p_kind: kind });
  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, message: "Lunch mode needs migration 0035 applied." };
    }
    return { ok: false, message: "That was not saved." };
  }
  return { ok: true };
}
