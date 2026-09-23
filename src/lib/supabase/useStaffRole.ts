"use client";

import * as React from "react";

import { supabase } from "./client";

/**
 * What this account is allowed to do, according to the database.
 *
 * Read rather than assumed: the answer comes from `staff_role`, which resolves the caller
 * from their own session. A browser cannot make itself a director by editing anything it
 * holds, because nothing it holds is consulted.
 *
 * This is for showing the right screen, not for protecting anything. The protection is in
 * the database — since migration 0072 every staff RPC checks the capability it needs, so a
 * desk account that reached the results screen would simply be refused by every button on
 * it. What this avoids is the refusal being the first thing somebody learns.
 */

export type StaffCapability = "desk" | "results" | "director" | "viewer" | "none";

export interface StaffRoleState {
  /** The stored role, verbatim, or null when this account is not staff. */
  role: string | null;
  capability: StaffCapability;
  canDesk: boolean;
  canResults: boolean;
  isDirector: boolean;
  loaded: boolean;
}

/**
 * The older role names still in use, mapped to what they have always meant.
 *
 * `checkin` was the desk and `scorekeeper` was the results table long before either had a
 * screen of its own. Renaming the rows would have rewritten live records to buy nothing.
 */
function capabilityOf(role: string | null): StaffCapability {
  switch (role) {
    case "director":
      return "director";
    case "results":
    case "scorekeeper":
    case "arbiter":
      return "results";
    case "desk":
    case "checkin":
      return "desk";
    case "viewer":
      return "viewer";
    default:
      return "none";
  }
}

export function useStaffRole(): StaffRoleState {
  const [role, setRole] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const db = supabase();
      if (!db) {
        /*
         * No database is not "no permission". Left unloaded, so a screen shows its loading
         * state rather than telling somebody their account lacks access it may well have.
         */
        if (live) setLoaded(false);
        return;
      }

      const { data, error } = await db.rpc("staff_role", { org: "org-federation" });
      if (!live) return;

      setRole(error ? null : (data as string | null) ?? null);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, []);

  const capability = capabilityOf(role);

  return {
    role,
    capability,
    /* A director does every job. Being refused the desk at 9am would be absurd. */
    canDesk: capability === "desk" || capability === "director",
    canResults: capability === "results" || capability === "director",
    isDirector: capability === "director",
    loaded,
  };
}
