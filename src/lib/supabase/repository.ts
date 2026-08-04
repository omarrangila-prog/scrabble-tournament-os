"use client";

/**
 * Supabase implementation of the repository interface.
 *
 * Every event-owned record lives in one `records` table, keyed by collection.
 * The domain payload sits in a jsonb column because these shapes change as the
 * product does, and a schema migration per field would be friction with no
 * safety gain — the TypeScript types are the contract and they are checked at
 * compile time.
 *
 * What is *not* in jsonb is anything a security policy depends on. Scope,
 * status and collection are real columns, so the database enforces access
 * without parsing JSON.
 */

import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./client";
import { CollectionName, DocumentBase, RecordStatus } from "../firebase/schema";
import { Repository, Scope, Stored } from "../firebase/repository";

/** A row as the database stores it. */
interface RecordRow {
  id: string;
  collection: string;
  organization_id: string;
  event_id: string;
  data: Record<string, unknown>;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

/** Flattens a row into the shape the application works with. */
function toStored<T>(row: RecordRow): Stored<T> {
  return {
    ...(row.data as T),
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as Stored<T>;
}

/**
 * Splits the audit fields back out of a payload.
 *
 * They are columns, not payload: storing them twice would let the two copies
 * disagree, and the policies read the columns.
 */
function toRow<T extends object>(data: T): Record<string, unknown> {
  const {
    organizationId: _org,
    eventId: _event,
    status: _status,
    createdAt: _created,
    updatedAt: _updated,
    id: _id,
    ...payload
  } = data as T & Partial<DocumentBase> & { id?: string };

  void _org;
  void _event;
  void _status;
  void _created;
  void _updated;
  void _id;

  return payload as Record<string, unknown>;
}

export class SupabaseRepository implements Repository {
  readonly backend = "firestore" as const;

  async list<T>(name: CollectionName, scope: Scope): Promise<Stored<T>[]> {
    const db = supabase();
    if (!db) return [];

    const { data, error } = await db
      .from("records")
      .select("*")
      .eq("collection", name)
      .eq("organization_id", scope.organizationId)
      .eq("event_id", scope.eventId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    // A read failure returns nothing rather than throwing: a screen showing an
    // empty list is recoverable, a crashed one is not.
    if (error || !data) return [];
    return (data as RecordRow[]).map(toStored<T>);
  }

  async create<T extends object>(
    name: CollectionName,
    scope: Scope,
    data: T,
  ): Promise<Stored<T>> {
    const db = supabase();
    if (!db) throw new Error("Supabase is not configured.");

    const { data: row, error } = await db
      .from("records")
      .insert({
        collection: name,
        organization_id: scope.organizationId,
        event_id: scope.eventId,
        data: toRow(data),
        status: "active",
      })
      .select()
      .single();

    if (error || !row) throw new Error(error?.message ?? "Could not save that record.");
    return toStored<T>(row as RecordRow);
  }

  async update<T extends object>(
    name: CollectionName,
    id: string,
    patch: Partial<T> & { status?: RecordStatus },
  ): Promise<void> {
    const db = supabase();
    if (!db) throw new Error("Supabase is not configured.");

    const { status, ...rest } = patch;

    /*
     * Read then merge, because a jsonb column is replaced wholesale on write.
     * Sending only the changed keys would silently drop every field the caller
     * did not mention.
     */
    const { data: existing } = await db
      .from("records")
      .select("data")
      .eq("id", id)
      .single();

    const merged = {
      ...((existing?.data as Record<string, unknown>) ?? {}),
      ...toRow(rest as T),
    };

    await db
      .from("records")
      .update({ data: merged, ...(status ? { status } : {}) })
      .eq("id", id);
  }

  async archive(name: CollectionName, id: string): Promise<void> {
    await this.update(name, id, { status: "archived" });
  }

  watch<T>(
    name: CollectionName,
    scope: Scope,
    onChange: (records: Stored<T>[]) => void,
  ): () => void {
    const db = supabase();
    if (!db) return () => {};

    const emit = () => void this.list<T>(name, scope).then(onChange);
    emit();

    /*
     * Re-reads on every change rather than patching the local array. A
     * registration list is small, and a full read cannot drift out of step
     * with the database the way incremental patching can.
     */
    const channel: RealtimeChannel = db
      .channel(`records:${name}:${scope.eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "records",
          filter: `event_id=eq.${scope.eventId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<RecordRow> | undefined;
          // Other collections share the table; ignore what is not ours.
          if (row?.collection && row.collection !== name) return;
          emit();
        },
      )
      .subscribe();

    return () => {
      void db.removeChannel(channel);
    };
  }
}
