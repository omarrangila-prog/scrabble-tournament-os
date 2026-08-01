"use client";

/**
 * Guided demo controller.
 *
 * Drives the presenter through the exact ten-step story in the specification.
 * Each step names the route it belongs on and, where relevant, the element it
 * highlights, so the walkthrough can spotlight real interface elements rather
 * than a slideshow.
 */

import { create } from "zustand";

export interface DemoStep {
  id: number;
  route: string;
  title: string;
  message: string;
  /** data-tour attribute of the element to highlight. */
  anchor?: string;
  /** Instruction shown to the presenter for the manual action. */
  action?: string;
}

export const TOURNAMENT_STEPS: DemoStep[] = [
  {
    id: 1,
    route: "/app",
    title: "Command Centre",
    message: "See the entire tournament in one place.",
    anchor: "command-stats",
  },
  {
    id: 2,
    route: "/app/check-in",
    title: "Check-in",
    message: "Players are verified in seconds.",
    action: "Scan the QR code to check in the late player.",
    anchor: "qr-scanner",
  },
  {
    id: 3,
    route: "/app/pairings?tab=preview",
    title: "Pairing Preview",
    message: "The system detects issues before pairings are published.",
    action: "Generate the Round 6 preview and open the conflict.",
    anchor: "pairing-preview",
  },
  {
    id: 4,
    route: "/app/pairings?tab=preview",
    title: "Resolve the conflict",
    message: "The Tournament Director remains in full control.",
    action: "Swap one opponent, then lock the corrected pairing.",
    anchor: "conflict-drawer",
  },
  {
    id: 5,
    route: "/app/score-entry",
    title: "Score Entry",
    message: "Results are entered in seconds, with validation as you type.",
    action: "Enter Board 3 — Ahmad Raza 498, Usman Ali 472.",
    anchor: "score-table",
  },
  {
    id: 6,
    route: "/app/score-entry",
    title: "Verify the result",
    message: "Standings update immediately after verification.",
    action: "Verify board 3.",
    anchor: "score-table",
  },
  {
    id: 7,
    route: "/app/standings",
    title: "Live Standings",
    message: "Ahmad Raza moves from rank 3 to rank 1.",
    anchor: "standings-table",
  },
  {
    id: 8,
    route: "/live",
    title: "Public website",
    message: "Players and spectators see the update instantly.",
    anchor: "public-home",
  },
  {
    id: 9,
    route: "/app/copilot",
    title: "Tournament Copilot",
    message:
      "Ask whether Round 6 can be generated safely — the answer comes from live tournament data.",
    action: "Ask: Can Round 6 be generated safely?",
    anchor: "copilot-panel",
  },
  {
    id: 10,
    route: "/app/pairings?tab=preview",
    title: "Generate Round 6",
    message:
      "Complete the remaining results, then generate and publish the next round.",
    action: "Verify the pending boards and publish Round 6.",
    anchor: "pairing-preview",
  },
];


/**
 * Seeding walkthrough — the fifteen-step story a director follows when setting
 * up a division from scratch, ending with the seeded order building round one.
 */
export const SEEDING_STEPS: DemoStep[] = [
  {
    id: 1,
    route: "/app/seeding",
    title: "Open the Masters division",
    message: "Every division is seeded independently, with its own rating band.",
    action: "Select Masters in the division selector.",
    anchor: "seed-list",
  },
  {
    id: 2,
    route: "/app/seeding",
    title: "32 players",
    message: "The full Masters field, ready to be ordered.",
    anchor: "seed-list",
  },
  {
    id: 3,
    route: "/app/seeding",
    title: "Rating-Based Seeding",
    message: "The simplest policy: strict descending rating.",
    action: "Choose Rating-Based Seeding as the method.",
    anchor: "seed-list",
  },
  {
    id: 4,
    route: "/app/seeding",
    title: "Generate Draft",
    message: "Nothing is applied to players until the order is published.",
    action: "Click Generate Draft.",
    anchor: "seed-list",
  },
  {
    id: 5,
    route: "/app/seeding",
    title: "The ordered seed list",
    message: "Seed 1 through 32, with each player's rating alongside.",
    anchor: "seed-list",
  },
  {
    id: 6,
    route: "/app/seeding",
    title: "Why this seed?",
    message: "Every position can be explained, factor by factor.",
    action: "Open \u201cWhy this seed?\u201d on any player.",
    anchor: "seed-list",
  },
  {
    id: 7,
    route: "/app/seeding",
    title: "Same-school warnings",
    message:
      "Adjacent seeds from one organization are flagged \u2014 a Swiss draw often pairs neighbours in round one.",
    anchor: "seed-list",
  },
  {
    id: 8,
    route: "/app/seeding",
    title: "Switch to Hybrid Seeding",
    message: "The same rating order, with same-organization neighbours separated.",
    action: "Change the method to Hybrid Seeding.",
    anchor: "seed-list",
  },
  {
    id: 9,
    route: "/app/seeding",
    title: "Fewer warnings, rating order intact",
    message:
      "The comparison strip shows the warning count falling. No player moves more than three places, so the rating order stays visible.",
    anchor: "seed-list",
  },
  {
    id: 10,
    route: "/app/seeding",
    title: "Move a protected player",
    message: "The director can override any position by hand.",
    action: "Use the move control on a player to change their seed.",
    anchor: "seed-list",
  },
  {
    id: 11,
    route: "/app/seeding",
    title: "Record the reason",
    message: "A manual seeding change always requires a reason.",
    action: "Enter an override reason and apply it.",
    anchor: "seed-list",
  },
  {
    id: 12,
    route: "/app/seeding",
    title: "Run validation",
    message: "Duplicate seeds, gaps, overrides and remaining warnings are all checked.",
    action: "Click Run Validation.",
    anchor: "seed-list",
  },
  {
    id: 13,
    route: "/app/seeding",
    title: "Lock the order",
    message: "Locked seeds survive any later regeneration.",
    action: "Click Lock all seeds.",
    anchor: "seed-list",
  },
  {
    id: 14,
    route: "/app/seeding",
    title: "Publish the seeding",
    message: "The order is written to every player record and released for pairing.",
    action: "Click Publish Seeding.",
    anchor: "seed-list",
  },
  {
    id: 15,
    route: "/app/pairings?tab=preview",
    title: "Round one from the seed list",
    message:
      "Seed 1 meets seed 17, seed 2 meets seed 18, and so on \u2014 the approved order builds the opening round.",
    anchor: "pairing-preview",
  },
];

/** Demo tracks the presenter can choose between. */
export const DEMO_TRACKS = {
  tournament: { label: "Full tournament story", steps: TOURNAMENT_STEPS },
  seeding: { label: "Seeding walkthrough", steps: SEEDING_STEPS },
} as const;

export type DemoTrackId = keyof typeof DEMO_TRACKS;

/** Backwards-compatible default export used by the overlay. */
export const DEMO_STEPS = TOURNAMENT_STEPS;

interface GuidedState {
  active: boolean;
  step: number;
  completed: boolean;
  track: DemoTrackId;
  steps: DemoStep[];
  start: (track?: DemoTrackId) => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  goTo: (step: number) => void;
  finish: () => void;
}

export const useGuidedDemo = create<GuidedState>((set, get) => ({
  active: false,
  step: 0,
  completed: false,
  track: "tournament",
  steps: TOURNAMENT_STEPS,
  start: (track = "tournament") =>
    set({ active: true, step: 0, completed: false, track, steps: DEMO_TRACKS[track].steps }),
  stop: () => set({ active: false }),
  next: () => {
    const { step, steps } = get();
    if (step >= steps.length - 1) set({ completed: true, active: false });
    else set({ step: step + 1 });
  },
  prev: () => set({ step: Math.max(0, get().step - 1) }),
  goTo: (step) => set({ step: Math.max(0, Math.min(get().steps.length - 1, step)) }),
  finish: () => set({ completed: true, active: false }),
}));
