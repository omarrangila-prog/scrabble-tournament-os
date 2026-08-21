import { beforeEach, describe, expect, it } from "vitest";
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

  /** The finished 8 August event must not come back with the refresh. */
  it("does not restore an event that is no longer active", () => {
    const next = migrateEventState(stale(), 1);
    expect(next.events.map((e) => e.slug)).toEqual(["alphabattle-23-august"]);
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

/* -------------------------------------------------------------------------- */
/* Self check-in                                                              */
/* -------------------------------------------------------------------------- */

import { arrivalCounts } from "../domain/checkIn";
import { useEventStore } from "./useEventStore";

/** A registration made through the real action, so codes and tokens are real. */
const submitOne = (fullName: string, over: Record<string, unknown> = {}) => {
  const store = useEventStore.getState();
  const eventId = store.events[0].id;
  return store.submitRegistration({
    eventId,
    fullName,
    email: `${fullName.split(" ")[0].toLowerCase()}@example.com`,
    mobile: "03001234567",
    dateOfBirth: "",
    city: "Karachi",
    club: "Unaffiliated",
    experience: "",
    preferredDivision: "recreational",
    answers: {},
    /*
     * Cash at the venue, because these tests are about check-in and a payment still being
     * checked is blocked from checking itself in. Left as a bank transfer, they would have
     * been asserting the payment gate by accident — which is what happened when receipts
     * stopped verifying themselves and four of them turned red.
     */
    paymentMethod: "cash",
    receiptFileName: "",
    amountDue: 1250,
    discountAmount: 0,
    currency: "PKR",
    ...over,
  } as never);
};

describe("check-in through the store", () => {
  beforeEach(() => {
    useEventStore.getState().resetEvents();
  });

  it("issues a six-digit code with every registration", () => {
    submitOne("Ahmed Khan");
    const [r] = useEventStore.getState().registrations;
    expect(r.checkInCode).toMatch(/^\d{6}$/);
  });

  /** Two participants sharing a code would check each other in. */
  it("issues a different code to each participant", () => {
    for (let i = 0; i < 25; i += 1) submitOne(`Player ${i}`);
    const codes = useEventStore.getState().registrations.map((r) => r.checkInCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  /**
   * The consequence of a receipt no longer declaring itself paid: the person holding it
   * cannot wave themselves in, and the desk settles the money first.
   */
  it("stops somebody whose receipt has not been checked from checking themselves in", () => {
    submitOne("Unchecked Receipt", { paymentMethod: "bank-transfer", receiptFileName: "r.jpg" });
    const r = useEventStore.getState().registrations.at(-1)!;

    // The precondition, so this cannot pass because the fixture drifted to some other state.
    expect(r.paymentStatus).toBe("receipt-uploaded");

    const outcome = useEventStore.getState().checkIn(r.id, "venue_qr");
    expect(outcome.result).toBe("blocked");
    expect(useEventStore.getState().registrations.at(-1)!.checkedInAt).toBeFalsy();
  });

  it("records the arrival with its method", () => {
    submitOne("Ahmed Khan");
    const { id } = useEventStore.getState().registrations[0];
    const outcome = useEventStore.getState().checkIn(id, "venue_qr");

    expect(outcome.result).toBe("checked-in");
    const after = useEventStore.getState().registrations[0];
    expect(after.checkedInAt).toBeTruthy();
    expect(after.checkInMethod).toBe("venue_qr");
  });

  /**
   * The guarantee the arrivals figure rests on. A second tap, or a scan
   * followed by opening the personal link, must not count twice or move the
   * time somebody actually arrived.
   */
  it("never counts a second check-in or moves the arrival time", () => {
    submitOne("Ahmed Khan");
    const { id } = useEventStore.getState().registrations[0];

    const first = useEventStore.getState().checkIn(id, "venue_qr");
    const firstAt = first.result === "checked-in" ? first.at : "";

    const second = useEventStore.getState().checkIn(id, "personal_link");
    expect(second).toEqual({ result: "already-checked-in", at: firstAt });

    const after = useEventStore.getState().registrations[0];
    expect(after.checkedInAt).toBe(firstAt);
    expect(after.checkInMethod).toBe("venue_qr");
    expect(arrivalCounts(useEventStore.getState().registrations).checkedIn).toBe(1);
  });

  it("names the staff member on a manual check-in", () => {
    submitOne("Ahmed Khan");
    const { id } = useEventStore.getState().registrations[0];
    useEventStore.getState().checkIn(id, "staff_manual", "Sir Hani");
    expect(useEventStore.getState().registrations[0].checkedInBy).toBe("Sir Hani");
  });

  it("refuses an unknown registration without throwing", () => {
    expect(useEventStore.getState().checkIn("reg-nope", "venue_qr").result).toBe("blocked");
  });

  it("keeps the arrivals count in step as people arrive", () => {
    submitOne("A One");
    submitOne("B Two");
    submitOne("C Three");
    const ids = useEventStore.getState().registrations.map((r) => r.id);

    expect(arrivalCounts(useEventStore.getState().registrations).checkedIn).toBe(0);
    useEventStore.getState().checkIn(ids[0], "venue_qr");
    useEventStore.getState().checkIn(ids[1], "personal_link");
    const counts = arrivalCounts(useEventStore.getState().registrations);
    expect(counts.checkedIn).toBe(2);
    expect(counts.expected).toBe(3);
    expect(counts.notArrived).toBe(1);
  });
});

/**
 * Capacity 0 means "no limit set", not "full".
 *
 * This fault has now appeared twice: once in the public status badge, and again
 * in the write path that stores the record. With no capacity configured, 0 >= 0
 * held and every entrant was stored as waitlisted — so everybody registering for
 * an event with unlimited room was told they were on a waiting list.
 */
describe("capacity and the waiting list", () => {
  beforeEach(() => {
    useEventStore.getState().resetEvents();
  });

  it("does not waitlist anybody when no capacity is set", () => {
    submitOne("First Entrant");
    const [r] = useEventStore.getState().registrations;

    expect(useEventStore.getState().events[0].capacity).toBe(0);
    expect(r.status).toBe("submitted");
    expect(r.status).not.toBe("waitlisted");
  });

  it("still waitlists past a real capacity", () => {
    const store = useEventStore.getState();
    store.updateEvent(store.events[0].id, { capacity: 2, waitingList: true });

    submitOne("One");
    submitOne("Two");
    submitOne("Three");

    const statuses = useEventStore.getState().registrations.map((r) => r.status);
    expect(statuses.filter((s) => s === "waitlisted")).toHaveLength(1);
  });
});
