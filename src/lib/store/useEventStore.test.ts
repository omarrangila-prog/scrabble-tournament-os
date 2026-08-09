import { describe, expect, it } from "vitest";
import {
  EVENT_STATE_VERSION,
  migrateEventState,
  type EventStore,
} from "./useEventStore";

/**
 * A persisted store from before the events were corrected: both August events
 * still drafts, the old AlphaBattle price, and one registration somebody
 * actually submitted.
 */
const stale = () =>
  ({
    events: [
      {
        id: "evt-alphabattle-23-august",
        slug: "alphabattle-23-august",
        state: "draft",
        fee: 1250,
      },
    ],
    forms: [],
    discounts: [],
    tokens: [],
    registrations: [
      { id: "reg-1", eventId: "evt-alphabattle-23-august", fullName: "Real Entrant" },
    ],
    activeEventId: "evt-alphabattle-23-august",
    activeOrganizationId: "org-federation",
  }) as unknown as Partial<EventStore>;

describe("migrateEventState", () => {
  /**
   * The bug this exists for. A browser that cached the events while they were
   * drafts kept being told "Registration Not Open" no matter how often the seed
   * was fixed, because the persisted copy always won.
   */
  it("replaces stale event definitions with the current ones", () => {
    const next = migrateEventState(stale(), 1);
    const alphaBattle = next.events.find((e) => e.slug === "alphabattle-23-august");

    expect(alphaBattle?.state).toBe("registration-open");
    expect(alphaBattle?.fee).toBe(1250);
  });

  it("brings back an event the cached copy never had", () => {
    const next = migrateEventState(stale(), 1);
    expect(next.events.map((e) => e.slug)).toContain("game-on-8-august");
  });

  /**
   * The line that matters most. Refreshing reference data must never discard a
   * registration — losing one is worse than the stale-cache bug, because the
   * entrant has paid and has no way to tell.
   */
  it("keeps every registration somebody submitted", () => {
    const next = migrateEventState(stale(), 1);
    expect(next.registrations).toHaveLength(1);
    expect(next.registrations[0]).toMatchObject({ fullName: "Real Entrant" });
  });

  it("clears a selection that may no longer resolve", () => {
    const next = migrateEventState(stale(), 1);
    expect(next.activeEventId).toBeNull();
    expect(next.activeOrganizationId).toBeNull();
  });

  /** Already-current state is passed through untouched. */
  it("does nothing once the state is at the current version", () => {
    const current = stale();
    const next = migrateEventState(current, EVENT_STATE_VERSION);
    expect(next.events[0].state).toBe("draft");
  });

  it("survives an empty or missing persisted state", () => {
    expect(migrateEventState(undefined, 1).events.length).toBeGreaterThan(0);
    expect(migrateEventState({}, 1).registrations).toEqual([]);
  });
});
