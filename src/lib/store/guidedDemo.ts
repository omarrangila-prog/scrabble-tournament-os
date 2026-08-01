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

export const DEMO_STEPS: DemoStep[] = [
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

interface GuidedState {
  active: boolean;
  step: number;
  completed: boolean;
  start: () => void;
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
  start: () => set({ active: true, step: 0, completed: false }),
  stop: () => set({ active: false }),
  next: () => {
    const { step } = get();
    if (step >= DEMO_STEPS.length - 1) set({ completed: true, active: false });
    else set({ step: step + 1 });
  },
  prev: () => set({ step: Math.max(0, get().step - 1) }),
  goTo: (step) => set({ step: Math.max(0, Math.min(DEMO_STEPS.length - 1, step)) }),
  finish: () => set({ completed: true, active: false }),
}));
