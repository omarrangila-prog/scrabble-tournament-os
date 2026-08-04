import { describe, expect, it } from "vitest";
import { EventState } from "./events";
import {
  AlertInput,
  ChecklistInput,
  eventAlerts,
  isWorkspaceTab,
  phaseGuidance,
  setupChecklist,
  WORKSPACE_TABS,
} from "./eventPhase";

const ALL_STATES: EventState[] = [
  "draft",
  "registration-open",
  "registration-closed",
  "preparing",
  "check-in-open",
  "check-in-closed",
  "round-published",
  "round-active",
  "result-entry",
  "break",
  "final-review",
  "completed",
  "archived",
];

describe("workspace tabs", () => {
  it("exposes the eight tabs in order", () => {
    expect(WORKSPACE_TABS.map((t) => t.id)).toEqual([
      "overview",
      "registrations",
      "payments",
      "scrabble",
      "live",
      "awards",
      "analytics",
      "settings",
    ]);
  });

  /**
   * Seeding, pairings, scores and standings are one activity. Splitting them
   * across separate tabs made a director running the competition move between
   * screens to do a single job.
   */
  it("keeps the whole Scrabble competition under one tab", () => {
    const ids = WORKSPACE_TABS.map((t) => t.id);
    expect(ids).toContain("scrabble");
    expect(ids).not.toContain("scores");
    expect(ids).not.toContain("players");
  });

  it("recognises real tabs and rejects anything else", () => {
    expect(isWorkspaceTab("overview")).toBe(true);
    expect(isWorkspaceTab("settings")).toBe(true);
    expect(isWorkspaceTab("nonsense")).toBe(false);
    expect(isWorkspaceTab("")).toBe(false);
  });
});

describe("phaseGuidance", () => {
  it("covers every event state", () => {
    for (const state of ALL_STATES) {
      expect(() => phaseGuidance(state)).not.toThrow();
    }
  });

  /** One dominant action per screen is the whole point of this module. */
  it("offers exactly one primary action in every state", () => {
    for (const state of ALL_STATES) {
      const g = phaseGuidance(state);
      expect(g.primary).toBeDefined();
      expect(g.primary.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps the secondary list short enough to scan", () => {
    for (const state of ALL_STATES) {
      expect(phaseGuidance(state).secondary.length).toBeLessThanOrEqual(3);
    }
  });

  it("always says where the event is and what happens next", () => {
    for (const state of ALL_STATES) {
      const g = phaseGuidance(state);
      expect(g.status.length).toBeGreaterThan(0);
      expect(g.next.length).toBeGreaterThan(0);
    }
  });

  it("leads a draft to opening registration", () => {
    const g = phaseGuidance("draft");
    expect(g.primary.kind).toBe("transition");
    expect(g.primary.to).toBe("registration-open");
  });

  it("leads an open registration to sharing the link", () => {
    expect(phaseGuidance("registration-open").primary.id).toBe("share");
  });

  it("leads a published round to starting the clock", () => {
    const g = phaseGuidance("round-published");
    expect(g.primary.to).toBe("round-active");
  });

  it("leads a completed event to certificates", () => {
    const g = phaseGuidance("completed");
    expect(g.primary.tab).toBe("awards");
  });

  /** Irreversible steps must ask first. */
  it("marks destructive transitions for confirmation", () => {
    const close = phaseGuidance("registration-open").secondary.find(
      (a) => a.to === "registration-closed",
    );
    expect(close?.confirm).toBe(true);

    const archive = phaseGuidance("completed").secondary.find((a) => a.to === "archived");
    expect(archive?.confirm).toBe(true);
  });

  it("does not offer event-day actions during registration", () => {
    const g = phaseGuidance("registration-open");
    const ids = [g.primary, ...g.secondary].map((a) => a.id);
    expect(ids).not.toContain("start-round");
    expect(ids).not.toContain("check-in");
    expect(ids).not.toContain("certificates");
  });

  it("does not offer registration actions on the event day", () => {
    const g = phaseGuidance("round-active");
    const ids = [g.primary, ...g.secondary].map((a) => a.id);
    expect(ids).not.toContain("share");
    expect(ids).not.toContain("open-registration");
  });

  it("navigates only to real tabs", () => {
    for (const state of ALL_STATES) {
      const g = phaseGuidance(state);
      for (const action of [g.primary, ...g.secondary]) {
        if (action.kind === "navigate") {
          expect(action.tab).toBeDefined();
          expect(isWorkspaceTab(action.tab!)).toBe(true);
        }
      }
    }
  });

  it("gives every transition a destination state", () => {
    for (const state of ALL_STATES) {
      const g = phaseGuidance(state);
      for (const action of [g.primary, ...g.secondary]) {
        if (action.kind === "transition") expect(action.to).toBeDefined();
      }
    }
  });

  it("treats an archived event as read-only", () => {
    const g = phaseGuidance("archived");
    const kinds = [g.primary, ...g.secondary].map((a) => a.kind);
    expect(kinds).not.toContain("transition");
  });
});

describe("setupChecklist", () => {
  const input = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
    hasForm: true,
    hasShareLink: true,
    registrationOpen: true,
    registrationCount: 0,
    paymentsReviewed: 0,
    paymentsAwaiting: 0,
    ...over,
  });

  /** A brand-new event must read as ready, not as broken. */
  it("shows a new event as set up and waiting", () => {
    const items = setupChecklist(input());
    const done = items.filter((i) => i.done).map((i) => i.id);
    expect(done).toContain("form");
    expect(done).toContain("link");
    expect(done).toContain("qr");
    expect(done).toContain("open");
  });

  it("states plainly that no registrations have arrived", () => {
    const items = setupChecklist(input());
    const reg = items.find((i) => i.id === "registrations")!;
    expect(reg.done).toBe(false);
    expect(reg.label).toBe("No registrations received yet");
    expect(reg.hint).toContain("Share your registration link");
  });

  it("counts registrations once they arrive", () => {
    const items = setupChecklist(input({ registrationCount: 1 }));
    expect(items.find((i) => i.id === "registrations")!.label).toBe("1 registration received");

    const many = setupChecklist(input({ registrationCount: 12 }));
    expect(many.find((i) => i.id === "registrations")!.label).toBe("12 registrations received");
  });

  it("marks the form and link incomplete before the event is published", () => {
    const items = setupChecklist(input({ hasShareLink: false, registrationOpen: false }));
    expect(items.find((i) => i.id === "link")!.done).toBe(false);
    expect(items.find((i) => i.id === "qr")!.done).toBe(false);
    expect(items.find((i) => i.id === "open")!.done).toBe(false);
  });

  it("treats no payments awaiting review as done", () => {
    expect(setupChecklist(input()).find((i) => i.id === "payments")!.done).toBe(true);
  });

  it("flags payments once receipts are waiting", () => {
    const items = setupChecklist(input({ paymentsAwaiting: 3 }));
    const pay = items.find((i) => i.id === "payments")!;
    expect(pay.done).toBe(false);
    expect(pay.label).toBe("3 payments awaiting review");
  });

  it("gives every incomplete item a hint", () => {
    for (const item of setupChecklist(input({ hasForm: false, hasShareLink: false }))) {
      if (!item.done) expect(item.hint).toBeDefined();
    }
  });
});

describe("eventAlerts", () => {
  const input = (over: Partial<AlertInput> = {}): AlertInput => ({
    paymentsAwaiting: 0,
    scoreConflicts: 0,
    unverifiedBoards: 0,
    unassignedPlayers: 0,
    capacityUsed: 40,
    ...over,
  });

  it("is silent when nothing needs attention", () => {
    expect(eventAlerts(input())).toEqual([]);
  });

  it("puts score conflicts first, as the most urgent", () => {
    const alerts = eventAlerts(
      input({ scoreConflicts: 1, paymentsAwaiting: 5, unassignedPlayers: 2 }),
    );
    expect(alerts[0].id).toBe("conflicts");
    expect(alerts[0].severity).toBe("critical");
  });

  it("counts payments and points at the tab that resolves them", () => {
    const alert = eventAlerts(input({ paymentsAwaiting: 3 }))[0];
    expect(alert.message).toBe("3 payments need review.");
    expect(alert.tab).toBe("payments");
  });

  it("uses singular wording for one item", () => {
    expect(eventAlerts(input({ paymentsAwaiting: 1 }))[0].message).toBe("1 payment needs review.");
    expect(eventAlerts(input({ scoreConflicts: 1 }))[0].message).toBe(
      "1 score conflict needs a ruling.",
    );
  });

  it("warns at capacity but not below it", () => {
    expect(eventAlerts(input({ capacityUsed: 99 })).some((a) => a.id === "capacity")).toBe(false);
    expect(eventAlerts(input({ capacityUsed: 100 })).some((a) => a.id === "capacity")).toBe(true);
  });

  it("routes every alert to a real tab", () => {
    const alerts = eventAlerts(
      input({
        paymentsAwaiting: 1,
        scoreConflicts: 1,
        unverifiedBoards: 1,
        unassignedPlayers: 1,
        capacityUsed: 100,
      }),
    );
    expect(alerts).toHaveLength(5);
    for (const a of alerts) expect(isWorkspaceTab(a.tab)).toBe(true);
  });
});
