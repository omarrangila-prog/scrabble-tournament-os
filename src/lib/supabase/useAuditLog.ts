"use client";

import * as React from "react";

import { supabase } from "./client";

/** One row of the real audit trail — who did what, and what changed. */
export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
}

export async function readAuditLog(eventId: string, limit = 300): Promise<AuditEntry[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("staff_audit_log", { p_event_id: eventId, p_limit: limit });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.out_id),
    at: String(r.out_created_at),
    actor: String(r.out_actor ?? "unknown"),
    action: String(r.out_action ?? ""),
    detail: (r.out_detail as Record<string, unknown> | null) ?? {},
  }));
}

/**
 * The real audit trail for one event.
 *
 * `audit_logs` has been written to since Phase 1 — every score correction, dispute, check-in,
 * payment decision, phase change, publish and settings change carries a row. Nothing had ever
 * read it back: Settings' "Audit log" tab showed `store.audit`, a browser-only array seeded
 * once and never touched by a real write. This is that screen's real data source.
 */
export function useAuditLog(eventId: string) {
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const rows = await readAuditLog(eventId);
      if (!live) return;
      setEntries(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  return { entries, loaded, reload };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Turns a detail object into one readable line.
 *
 * Every mutation this app makes logs its own shape of `detail` — a round and a board count, a
 * before/after pair of whole rows, a reason someone typed. Rather than a raw JSON dump, a
 * `before`/`after` pair of objects is diffed down to just the keys that actually changed —
 * "qrEnabled: false → true" says what happened; the other ten unchanged settings columns
 * repeated twice do not. Everything else prints as `key: value`.
 */
export function summarizeAuditDetail(detail: Record<string, unknown>): string {
  const { before, after, ...rest } = detail;
  const parts: string[] = [];

  if (before !== undefined || after !== undefined) {
    if (isPlainObject(before) && isPlainObject(after)) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of keys) {
        const b = before[key];
        const a = after[key];
        if (JSON.stringify(b) !== JSON.stringify(a)) parts.push(`${key}: ${fmt(b)} → ${fmt(a)}`);
      }
    } else {
      parts.push(`${fmt(before)} → ${fmt(after)}`);
    }
  }

  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    parts.push(`${key}: ${fmt(value)}`);
  }

  return parts.length > 0 ? parts.join(", ") : "—";
}
