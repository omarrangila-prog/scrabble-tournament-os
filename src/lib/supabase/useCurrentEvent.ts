"use client";

import * as React from "react";

import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";

import { listEvents, type StoredEvent } from "./events";

/**
 * Which event a director is working on right now.
 *
 * Every staff screen used to import a single hardcoded event id, which is why there was never
 * a way to switch: there was nothing to switch between, because there was nowhere this could
 * have been stored even if a picker existed. A prior attempt at a picker (still visible as a
 * removed-code comment in AppShell.tsx) read its list from browser storage seeded with exactly
 * one event, so it had nothing real to offer either.
 *
 * This is per-browser, not per-organization — each staff member's own tab remembers its own
 * choice, the same way a theme or a collapsed sidebar does. It is not how two staff members
 * agree on which event they are both looking at; the event's own id in the URL
 * (`/app/events/[eventId]/...`) is what does that, and stays authoritative wherever it is
 * present. This is only the default a flat screen — Desk, Score entry, Settings — falls back
 * to when no id is in its own URL at all.
 */

const STORAGE_KEY = "bluffy-current-event-id";

const listeners = new Set<() => void>();

function getSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Sets the stored choice and notifies every mounted `useCurrentEvent` in this tab at once. */
export function writeCurrentEventId(eventId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, eventId);
  } catch {
    /* Private browsing or a full quota — the picker still works for this render, it just
       will not be remembered next visit. */
  }
  listeners.forEach((callback) => callback());
}

/** The raw stored choice, or null if nothing has been picked in this browser yet. */
function useStoredEventId(): string | null {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface CurrentEventState {
  /** Always resolves to something real once `loaded` is true and at least one event exists. */
  eventId: string;
  events: StoredEvent[];
  loaded: boolean;
  setCurrentEventId: (eventId: string) => void;
  reload: () => void;
}

/**
 * Resolves to the stored choice if it still names a real event, otherwise the most recently
 * created event that is not archived — so an archived or deleted event never leaves a director
 * silently stuck looking at data for something that no longer exists.
 *
 * Falls back to `ACTIVE_EVENT_ID` only if Supabase has no events at all to offer, which keeps
 * the app from breaking outright rather than pretending that fallback is a real choice.
 */
export function useCurrentEvent(): CurrentEventState {
  const stored = useStoredEventId();
  const [events, setEvents] = React.useState<StoredEvent[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const rows = await listEvents();
      if (!live) return;
      setEvents(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [reloads]);

  const eventId = React.useMemo(() => {
    if (stored && events.some((e) => e.id === stored)) return stored;

    const current = events.filter((e) => e.status !== "archived");
    const pool = current.length > 0 ? current : events;
    const newest = [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return newest?.id ?? ACTIVE_EVENT_ID;
  }, [stored, events]);

  return { eventId, events, loaded, setCurrentEventId: writeCurrentEventId, reload };
}

export interface EventByIdState {
  event: StoredEvent | null;
  loaded: boolean;
  reload: () => void;
}

/**
 * One specific event, by id — for a screen inside `/app/events/[eventId]/...`, where the URL
 * itself decides which event is shown, not whatever is currently picked in the nav. A link to
 * a specific event should always open that event, regardless of what a director happened to
 * have selected the last time they used this browser.
 */
export function useEventById(eventId: string): EventByIdState {
  const [events, setEvents] = React.useState<StoredEvent[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;

    (async () => {
      const rows = await listEvents();
      if (!live) return;
      setEvents(rows);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  return { event: events.find((e) => e.id === eventId) ?? null, loaded, reload };
}
