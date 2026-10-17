"use client";

/**
 * Outside sources, player mappings and applying an import — the browser's half.
 *
 * Fetching goes through our own server route, because another site's pages cannot be read from
 * ours. Everything that changes the tournament goes through `staff_import_round`, which applies
 * a whole round or none of it and can do nothing a person at the results table could not.
 */

import type { PlannedBoard } from "@/lib/import/plan";

import { supabase } from "./client";

export type FetchOutcome =
  | { ok: true; text: string; contentType: string; finalUrl: string }
  | { ok: false; message: string };

export async function fetchExternalSource(url: string): Promise<FetchOutcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, message: "Sign in again to import." };

  try {
    const response = await fetch("/api/import/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
      cache: "no-store",
    });
    const body = (await response.json()) as { ok?: boolean; text?: string; contentType?: string; finalUrl?: string; error?: string };
    if (!body.ok || typeof body.text !== "string")
      return { ok: false, message: body.error ?? "The source could not be read." };
    return { ok: true, text: body.text, contentType: body.contentType ?? "", finalUrl: body.finalUrl ?? url };
  } catch {
    return { ok: false, message: "The source could not be reached. Check your connection." };
  }
}

export interface ExternalSource {
  id: string;
  round: number | null;
  url: string;
  type: string;
  intervalSeconds: number;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  status: "never" | "ok" | "changes" | "error";
  error: string | null;
  fingerprint: string | null;
}

export async function listExternalSources(eventId: string): Promise<ExternalSource[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("staff_external_sources", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.out_id),
    round: r.out_round === null || r.out_round === undefined ? null : Number(r.out_round),
    url: String(r.out_url ?? ""),
    type: String(r.out_type ?? "auto"),
    intervalSeconds: Number(r.out_interval ?? 0),
    lastSyncedAt: (r.out_last_synced_at as string | null) ?? null,
    lastAttemptAt: (r.out_last_attempt_at as string | null) ?? null,
    status: (["never", "ok", "changes", "error"].includes(String(r.out_status)) ? r.out_status : "never") as ExternalSource["status"],
    error: (r.out_error as string | null) ?? null,
    fingerprint: (r.out_fingerprint as string | null) ?? null,
  }));
}

export async function saveExternalSource(input: {
  eventId: string;
  id?: string | null;
  round: number | null;
  url: string;
  intervalSeconds: number;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_save_external_source", {
    p_event_id: input.eventId,
    p_id: input.id ?? null,
    p_round: input.round,
    p_url: input.url,
    p_source_type: "auto",
    p_interval: input.intervalSeconds,
  });
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  return { ok: true, id: String(data) };
}

export async function deleteExternalSource(id: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db.rpc("staff_delete_external_source", { p_id: id });
  return !error;
}

export async function recordSourceSync(
  id: string,
  status: "ok" | "changes" | "error",
  error: string | null,
  fingerprint: string | null,
): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.rpc("staff_record_source_sync", {
    p_id: id,
    p_status: status,
    p_error: error,
    p_fingerprint: fingerprint,
  });
}

/** Outside identity → registration id, as confirmed on earlier imports. */
export async function listExternalMappings(eventId: string): Promise<Map<string, string>> {
  const db = supabase();
  const map = new Map<string, string>();
  if (!db) return map;

  const { data, error } = await db.rpc("staff_external_mappings", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return map;

  for (const r of data as Record<string, unknown>[]) map.set(String(r.out_key), String(r.out_record_id));
  return map;
}

export async function saveExternalMapping(input: {
  eventId: string;
  key: string;
  name: string;
  recordId: string;
  by: string;
}): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { error } = await db.rpc("staff_save_external_mapping", {
    p_event_id: input.eventId,
    p_external_key: input.key,
    p_external_name: input.name,
    p_record_id: input.recordId,
    p_by: input.by,
  });
  return !error;
}

export interface ImportSummary {
  published: boolean;
  recorded: number;
  corrected: number;
  unchanged: number;
  pending: number;
}

export async function importRound(input: {
  eventId: string;
  round: number;
  boards: PlannedBoard[];
  by: string;
  applyCorrections: boolean;
}): Promise<{ ok: true; summary: ImportSummary } | { ok: false; message: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_import_round", {
    p_event_id: input.eventId,
    p_round: input.round,
    p_matches: input.boards.map((b) => ({
      board: b.board,
      division: b.division,
      playerA: b.playerA,
      playerB: b.playerB,
      aPlaysFirst: b.aPlaysFirst,
      scoreA: b.scoreA,
      scoreB: b.scoreB,
    })),
    p_by: input.by,
    p_apply_corrections: input.applyCorrections,
  });

  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };

  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    summary: {
      published: d.published === true,
      recorded: Number(d.recorded ?? 0),
      corrected: Number(d.corrected ?? 0),
      unchanged: Number(d.unchanged ?? 0),
      pending: Number(d.pending ?? 0),
    },
  };
}
