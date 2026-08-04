"use client";

/**
 * Data access.
 *
 * One interface, two implementations. Screens talk to `repository()` and never
 * know which is behind it, so the app is fully usable before a Firebase project
 * exists and becomes a Firestore client when one does — by environment variable
 * alone, with no change at any call site.
 *
 * The local implementation is not a stub. It reads and writes the same shapes
 * with the same scoping and the same audit fields, so behaviour that works
 * locally works against Firestore.
 */

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  QueryConstraint,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "./config";
import {
  CollectionName,
  DocumentBase,
  RecordStatus,
  touch,
  withBase,
} from "./schema";

export interface Scope {
  organizationId: string;
  eventId: string;
}

/** A stored record: the caller's shape plus an id and the audit fields. */
export type Stored<T> = T & DocumentBase & { id: string };

export interface Repository {
  /** Every active record in a collection, scoped to one event. */
  list<T>(name: CollectionName, scope: Scope): Promise<Stored<T>[]>;

  create<T extends object>(name: CollectionName, scope: Scope, data: T): Promise<Stored<T>>;

  update<T extends object>(
    name: CollectionName,
    id: string,
    patch: Partial<T> & { status?: RecordStatus },
  ): Promise<void>;

  /** Archives rather than deletes. Nothing in a tournament record is disposable. */
  archive(name: CollectionName, id: string): Promise<void>;

  /**
   * Watches a collection. Returns an unsubscribe function.
   *
   * Locally this fires once with current data and then on storage events from
   * other tabs, which is as close to live as a browser can get without a
   * server. Against Firestore it is a real snapshot listener.
   */
  watch<T>(
    name: CollectionName,
    scope: Scope,
    onChange: (records: Stored<T>[]) => void,
  ): () => void;

  readonly backend: "firestore" | "local";
}

/* -------------------------------------------------------------------------- */
/* Firestore                                                                   */
/* -------------------------------------------------------------------------- */

function scopeConstraints(scope: Scope): QueryConstraint[] {
  // Both, always. Scoping by event alone would let another organization's event
  // resolve if an id were ever guessed or reused.
  return [
    where("organizationId", "==", scope.organizationId),
    where("eventId", "==", scope.eventId),
    where("status", "==", "active"),
  ];
}

class FirestoreRepository implements Repository {
  readonly backend = "firestore" as const;

  async list<T>(name: CollectionName, scope: Scope): Promise<Stored<T>[]> {
    const db = firestore();
    if (!db) return [];
    const snap = await getDocs(query(collection(db, name), ...scopeConstraints(scope)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Stored<T>);
  }

  async create<T extends object>(
    name: CollectionName,
    scope: Scope,
    data: T,
  ): Promise<Stored<T>> {
    const db = firestore();
    if (!db) throw new Error("Firestore is not configured.");
    const record = withBase(data, scope);
    const ref = await addDoc(collection(db, name), record);
    return { id: ref.id, ...record } as Stored<T>;
  }

  async update<T extends object>(
    name: CollectionName,
    id: string,
    patch: Partial<T> & { status?: RecordStatus },
  ): Promise<void> {
    const db = firestore();
    if (!db) throw new Error("Firestore is not configured.");
    await updateDoc(doc(db, name, id), touch(patch));
  }

  async archive(name: CollectionName, id: string): Promise<void> {
    await this.update(name, id, { status: "archived" });
  }

  watch<T>(
    name: CollectionName,
    scope: Scope,
    onChange: (records: Stored<T>[]) => void,
  ): () => void {
    const db = firestore();
    if (!db) return () => {};
    return onSnapshot(query(collection(db, name), ...scopeConstraints(scope)), (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Stored<T>));
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Local                                                                       */
/* -------------------------------------------------------------------------- */

const LOCAL_PREFIX = "tos-db";
const uid = () => Math.random().toString(36).slice(2, 12);

/**
 * Browser-storage implementation.
 *
 * Applies the same scoping and audit rules as Firestore so the two cannot drift
 * apart in behaviour. A failed write is swallowed rather than thrown: a full
 * storage quota must not take down a registration form.
 */
class LocalRepository implements Repository {
  readonly backend = "local" as const;

  private key(name: CollectionName): string {
    return `${LOCAL_PREFIX}:${name}`;
  }

  private read<T>(name: CollectionName): Stored<T>[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(this.key(name));
      return raw ? (JSON.parse(raw) as Stored<T>[]) : [];
    } catch {
      return [];
    }
  }

  private write<T>(name: CollectionName, records: Stored<T>[]): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(this.key(name), JSON.stringify(records));
      // Same-tab listeners do not receive the native storage event.
      window.dispatchEvent(new CustomEvent(`${LOCAL_PREFIX}:changed`, { detail: name }));
    } catch {
      // Quota exceeded or storage blocked. Losing a draft is bad; breaking the
      // page the participant is filling in is worse.
    }
  }

  async list<T>(name: CollectionName, scope: Scope): Promise<Stored<T>[]> {
    return this.read<T>(name).filter(
      (r) =>
        r.organizationId === scope.organizationId &&
        r.eventId === scope.eventId &&
        r.status === "active",
    );
  }

  async create<T extends object>(
    name: CollectionName,
    scope: Scope,
    data: T,
  ): Promise<Stored<T>> {
    const record = { id: uid(), ...withBase(data, scope) } as Stored<T>;
    this.write(name, [...this.read<T>(name), record]);
    return record;
  }

  async update<T extends object>(
    name: CollectionName,
    id: string,
    patch: Partial<T> & { status?: RecordStatus },
  ): Promise<void> {
    this.write(
      name,
      this.read<T>(name).map((r) => (r.id === id ? { ...r, ...touch(patch) } : r)),
    );
  }

  async archive(name: CollectionName, id: string): Promise<void> {
    await this.update(name, id, { status: "archived" });
  }

  watch<T>(
    name: CollectionName,
    scope: Scope,
    onChange: (records: Stored<T>[]) => void,
  ): () => void {
    const emit = () => void this.list<T>(name, scope).then(onChange);
    emit();

    if (typeof window === "undefined") return () => {};

    const onLocal = (e: Event) => {
      if ((e as CustomEvent<string>).detail === name) emit();
    };
    // Cross-tab: a second device on the venue laptop should see new entries.
    const onStorage = (e: StorageEvent) => {
      if (e.key === this.key(name)) emit();
    };

    window.addEventListener(`${LOCAL_PREFIX}:changed`, onLocal);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(`${LOCAL_PREFIX}:changed`, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }
}

/* -------------------------------------------------------------------------- */

let cached: Repository | null = null;

/** The active repository. Chosen once, from configuration. */
export function repository(): Repository {
  if (!cached) {
    cached = isFirebaseConfigured() ? new FirestoreRepository() : new LocalRepository();
  }
  return cached;
}

/** Testing seam. */
export function resetRepository(): void {
  cached = null;
}
