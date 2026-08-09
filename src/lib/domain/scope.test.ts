import { describe, expect, it } from "vitest";
import {
  activeEvent,
  EMPTY_SCOPE,
  isResolved,
  isStale,
  Scope,
  scoped,
  scopedToOrg,
  scopeStatus,
} from "./scope";

const ORG = "org-psa";
const OTHER_ORG = "org-other";

const events = [
  { id: "ev-bluffy", organizationId: ORG, name: "Blufy's AlphaBattle" },
  { id: "ev-champs", organizationId: ORG, name: "Pakistan Championship" },
  { id: "ev-foreign", organizationId: OTHER_ORG, name: "Another Org Event" },
];

const registrations = [
  { id: "r1", eventId: "ev-bluffy", name: "Hunain" },
  { id: "r2", eventId: "ev-champs", name: "Ayesha" },
  { id: "r3", eventId: "ev-champs", name: "Bilal" },
];

const scope = (eventId: string | null, organizationId: string | null = ORG): Scope => ({
  organizationId,
  eventId,
});

describe("isResolved", () => {
  it("is false until both ids are present", () => {
    expect(isResolved(EMPTY_SCOPE)).toBe(false);
    expect(isResolved(scope(null))).toBe(false);
    expect(isResolved(scope("ev-bluffy", null))).toBe(false);
    expect(isResolved(scope("ev-bluffy"))).toBe(true);
  });
});

describe("scoped", () => {
  it("returns only the active event's records", () => {
    expect(scoped(registrations, scope("ev-champs")).map((r) => r.name)).toEqual([
      "Ayesha",
      "Bilal",
    ]);
  });

  /** The reported bug: Blufy's AlphaBattle showing Championship registrations. */
  it("never leaks another event's records into the active one", () => {
    const rows = scoped(registrations, scope("ev-bluffy"));
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.eventId === "ev-bluffy")).toBe(true);
  });

  it("returns nothing rather than falling back to the first event", () => {
    expect(scoped(registrations, EMPTY_SCOPE)).toEqual([]);
  });

  it("returns nothing for an event with no records yet", () => {
    expect(scoped(registrations, scope("ev-brand-new"))).toEqual([]);
  });
});

describe("scopedToOrg", () => {
  it("keeps another organization's events out of the list", () => {
    const rows = scopedToOrg(events, scope(null));
    expect(rows.map((e) => e.id)).toEqual(["ev-bluffy", "ev-champs"]);
  });

  it("returns nothing without an organization", () => {
    expect(scopedToOrg(events, EMPTY_SCOPE)).toEqual([]);
  });
});

describe("activeEvent", () => {
  it("resolves the selected event", () => {
    expect(activeEvent(events, scope("ev-bluffy"))?.name).toBe("Blufy's AlphaBattle");
  });

  it("does not resolve an event belonging to another organization", () => {
    expect(activeEvent(events, scope("ev-foreign"))).toBeUndefined();
  });

  it("returns undefined for an unknown id rather than a fallback", () => {
    expect(activeEvent(events, scope("ev-deleted"))).toBeUndefined();
  });

  it("returns undefined with no selection", () => {
    expect(activeEvent(events, EMPTY_SCOPE)).toBeUndefined();
  });
});

describe("isStale", () => {
  it("detects a scope pointing at a deleted event", () => {
    expect(isStale(events, scope("ev-deleted"))).toBe(true);
  });

  it("is not stale when the event exists", () => {
    expect(isStale(events, scope("ev-bluffy"))).toBe(false);
  });

  it("treats no selection as not stale", () => {
    expect(isStale(events, EMPTY_SCOPE)).toBe(false);
  });

  it("treats another organization's event as stale", () => {
    expect(isStale(events, scope("ev-foreign"))).toBe(true);
  });
});

describe("scopeStatus", () => {
  it("reports loading before the store hydrates, even with a selection", () => {
    expect(scopeStatus(events, scope("ev-bluffy"), false)).toBe("loading");
  });

  it("reports no selection once hydrated with nothing chosen", () => {
    expect(scopeStatus(events, EMPTY_SCOPE, true)).toBe("no-selection");
  });

  it("reports ready for a resolvable event", () => {
    expect(scopeStatus(events, scope("ev-bluffy"), true)).toBe("ready");
  });

  it("reports not-found for a deleted event rather than showing another", () => {
    expect(scopeStatus(events, scope("ev-deleted"), true)).toBe("not-found");
  });

  /**
   * Loading must win over not-found: an unhydrated store has an empty event
   * list, so a restored selection would briefly read as deleted and flash a
   * "not found" screen before the real data arrives.
   */
  it("does not report not-found while the store is still empty", () => {
    expect(scopeStatus([], scope("ev-bluffy"), false)).toBe("loading");
  });
});

/**
 * Events and tournaments are separate records: an event exists from creation,
 * its games only once a tournament is set up for it. An earlier awards screen
 * read whichever tournament happened to be loaded, which would have written one
 * event's certificates from another event's games once a second event existed.
 */
describe("event to tournament linkage", () => {
  interface LinkedEvent {
    id: string;
    organizationId: string;
    tournamentId?: string;
  }

  /** Mirrors the guard the awards screen applies. */
  const resolveTournament = (event: LinkedEvent, loadedTournamentId: string) =>
    event.tournamentId && event.tournamentId === loadedTournamentId
      ? loadedTournamentId
      : null;

  it("resolves a tournament only when the event names it", () => {
    const event = { id: "ev-a", organizationId: ORG, tournamentId: "t-1" };
    expect(resolveTournament(event, "t-1")).toBe("t-1");
  });

  it("resolves nothing for an event with no tournament yet", () => {
    const event = { id: "ev-new", organizationId: ORG };
    expect(resolveTournament(event, "t-1")).toBeNull();
  });

  /** The bug this guards: borrowing another event's games. */
  it("refuses a tournament the event does not name", () => {
    const event = { id: "ev-b", organizationId: ORG, tournamentId: "t-2" };
    expect(resolveTournament(event, "t-1")).toBeNull();
  });
});
