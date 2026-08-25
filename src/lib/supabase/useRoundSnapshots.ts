"use client";

import * as React from "react";

import { supabase } from "./client";

/** One board as `staff_snapshot_round` recorded it — names, not ids, since a snapshot is read
 * on its own, without the roster loaded alongside it. */
export interface SnapshotBoard {
  board: number;
  division: string;
  playerA: string;
  playerB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
}

/** One standings row as `event_standings` reported it at the moment of the snapshot. */
export interface SnapshotStanding {
  out_division: string;
  out_name: string;
  out_played: number;
  out_wins: number;
  out_losses: number;
  out_draws: number;
  out_spread: number;
}

export interface RoundSnapshot {
  round: number;
  createdAt: string;
  createdBy: string;
  pairings: SnapshotBoard[] | null;
  standings: SnapshotStanding[] | null;
}

export async function readRoundSnapshots(eventId: string): Promise<RoundSnapshot[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("staff_round_snapshots", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  const byRound = new Map<number, RoundSnapshot>();
  for (const row of data as Record<string, unknown>[]) {
    const round = Number(row.out_round);
    const existing = byRound.get(round) ?? {
      round,
      createdAt: String(row.out_created_at ?? ""),
      createdBy: String(row.out_created_by ?? "system"),
      pairings: null,
      standings: null,
    };

    if (row.out_kind === "pairings") existing.pairings = (row.out_payload as SnapshotBoard[]) ?? [];
    if (row.out_kind === "standings") existing.standings = (row.out_payload as SnapshotStanding[]) ?? [];

    byRound.set(round, existing);
  }

  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

/**
 * Immutable per-round records — pairings and standings exactly as they stood the moment a
 * round finalized.
 *
 * Not the source of truth for anything currently displayed: standings everywhere else in
 * this app are still derived live from verified games, which is what keeps them correct after
 * a later correction. This is the answer to a different question — what did round 2's
 * standings actually say at the time, before that correction — which live derivation cannot
 * answer once the underlying data has moved. Written once per round by `staff_snapshot_round`
 * and never edited.
 */
export function useRoundSnapshots(eventId: string) {
  const [snapshots, setSnapshots] = React.useState<RoundSnapshot[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const rows = await readRoundSnapshots(eventId);
      if (!live) return;
      setSnapshots(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  return { snapshots, loaded, reload };
}
