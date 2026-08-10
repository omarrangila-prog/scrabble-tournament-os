"use client";

import * as React from "react";

import {
  rosterCounts,
  rosterFromRegistrations,
  type RosterCounts,
} from "@/lib/domain/roster";
import type { Player } from "@/lib/domain/types";

import {
  currentOrganizer,
  hasStaffAccess,
  listRegistrations,
  type OrganizerRegistration,
} from "./organizer";

/** Why the roster is empty, which is not the same question as whether it is. */
export type RosterAccess =
  /** The first read has not finished. Say nothing yet. */
  | "unknown"
  /** Nobody is signed in. The database will return nothing, by design. */
  | "signed-out"
  /** Signed in with an address that is not on the staff allowlist. */
  | "not-staff"
  /** Staff. An empty roster here genuinely means nobody has registered. */
  | "ok";

export interface RosterState {
  players: Player[];
  registrations: OrganizerRegistration[];
  counts: RosterCounts;
  access: RosterAccess;
  /** False until the first read finishes. */
  loaded: boolean;
  signedInAs: string | null;
  reload: () => void;
}

const NO_COUNTS: RosterCounts = { total: 0, checkedIn: 0, paid: 0, awaitingPayment: 0 };

interface Snapshot {
  registrations: OrganizerRegistration[];
  access: RosterAccess;
  signedInAs: string | null;
}

async function read(eventId: string): Promise<Snapshot> {
  const who = await currentOrganizer();
  if (!who) return { registrations: [], access: "signed-out", signedInAs: null };

  const staff = await hasStaffAccess();
  const registrations = staff ? await listRegistrations(eventId) : [];
  return { registrations, access: staff ? "ok" : "not-staff", signedInAs: who };
}

/**
 * One request per burst of mounts.
 *
 * Several components on a page need the roster — the list, the search box, the
 * drawer, the dashboard tiles — and each asks for it as it mounts. Left alone that
 * is three or four identical round trips on every page load, which on venue wifi
 * is three or four chances to be slow. Callers that arrive while a read is already
 * running share its result.
 *
 * Nothing is cached past that window, so a refresh always reaches the database.
 * On event day a stale arrival count is worse than a slow one.
 */
const inflight = new Map<string, Promise<Snapshot>>();

function readShared(eventId: string): Promise<Snapshot> {
  const existing = inflight.get(eventId);
  if (existing) return existing;

  const promise = read(eventId).finally(() => {
    /*
     * Only clear this read's own entry. A slow read that finishes after a refresh
     * has already started a new one must not delete the new entry, or the next
     * caller would start a third.
     */
    if (inflight.get(eventId) === promise) inflight.delete(eventId);
  });
  inflight.set(eventId, promise);
  return promise;
}

/**
 * Drops any read in progress for this event.
 *
 * Called before a refresh that follows a write. Without it a refresh could join a
 * read that started *before* the write landed and return data that predates it —
 * staff would tap "check in", see the arrival count not move, and tap again.
 */
function bust(eventId: string): void {
  inflight.delete(eventId);
}

/**
 * The roster for one event, read from the database.
 *
 * Shared by every organizer screen that needs to know who is playing, so there is
 * one answer to that question rather than one per page. Access is decided by the
 * database function behind `listRegistrations`, not here: a visitor who opens an
 * organizer URL without signing in gets an empty list from Postgres regardless of
 * what this hook does. Reporting *why* it is empty is this hook's job, because an
 * empty table that means "you are not signed in" looks exactly like one that means
 * "nobody has registered", and confusing those two on event day is expensive.
 */
export function useRoster(eventId: string): RosterState {
  const [registrations, setRegistrations] = React.useState<OrganizerRegistration[]>([]);
  const [access, setAccess] = React.useState<RosterAccess>("unknown");
  const [signedInAs, setSignedInAs] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  /*
   * A counter, not a callback. The React Compiler lint rule forbids setting state
   * synchronously from an effect, which a `load()` helper invoked by one does;
   * bumping this re-runs the effect and every write lands in the async
   * continuation.
   */
  const [reloads, setReloads] = React.useState(0);
  const reload = React.useCallback(() => {
    bust(eventId);
    setReloads((n) => n + 1);
  }, [eventId]);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const snap = await readShared(eventId);
      if (!live) return;

      setSignedInAs(snap.signedInAs);
      setAccess(snap.access);
      setRegistrations(snap.registrations);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  const players = React.useMemo(
    () => rosterFromRegistrations(registrations),
    [registrations],
  );

  const counts = React.useMemo(
    () => (players.length ? rosterCounts(players) : NO_COUNTS),
    [players],
  );

  return { players, registrations, counts, access, loaded, signedInAs, reload };
}
