/**
 * What the organizer should do next.
 *
 * The complaint this answers: every possible action shown at all times, so the
 * organizer has to work out which one applies right now. Instead each event
 * state names one primary action and a short list of secondary ones, and
 * anything belonging to a different phase is simply absent.
 *
 * Nothing here performs an action — it decides what to offer. Screens render
 * the result and own the behaviour, so the same phase logic drives the
 * workspace header, the setup checklist and the dashboard alert.
 */

import { EventState } from "./events";

/** A workspace tab. The order is the order the organizer sees. */
export type WorkspaceTab =
  | "overview"
  | "registrations"
  | "payments"
  | "scrabble"
  | "live"
  | "awards"
  | "analytics"
  | "settings";

/**
 * The workspace tabs.
 *
 * Eight rather than nine: seeding, pairings, rounds, scores and standings all
 * belong to one activity, so they live together under Speed Scrabble instead of
 * being split across "Players & Divisions" and "Scores & Standings". A director
 * running the competition works in one place.
 */
export const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "registrations", label: "Registrations" },
  { id: "payments", label: "Payments" },
  { id: "scrabble", label: "Speed Scrabble" },
  { id: "live", label: "Live Event" },
  { id: "awards", label: "Awards & Certificates" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

export function isWorkspaceTab(value: string): value is WorkspaceTab {
  return WORKSPACE_TABS.some((t) => t.id === value);
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * An offered action.
 *
 * `kind` tells the screen what to do: navigate somewhere, move the event to a
 * new state, or run a screen-specific handler such as copying a link.
 */
export interface PhaseAction {
  id: string;
  label: string;
  /** Why this action, in the organizer's terms. Shown on the primary action. */
  hint?: string;
  kind: "navigate" | "transition" | "handler";
  /** Tab to open, for navigate actions. */
  tab?: WorkspaceTab;
  /** State to move to, for transition actions. */
  to?: EventState;
  /** True when the action cannot be undone and should confirm first. */
  confirm?: boolean;
}

export interface PhaseGuidance {
  /** Plain-language description of where the event is. */
  status: string;
  /** What happens next, in one sentence. */
  next: string;
  /** The single dominant action for this phase. */
  primary: PhaseAction;
  /** Related actions, never more than a handful. */
  secondary: PhaseAction[];
}

const nav = (id: string, label: string, tab: WorkspaceTab, hint?: string): PhaseAction => ({
  id,
  label,
  tab,
  hint,
  kind: "navigate",
});

const move = (
  id: string,
  label: string,
  to: EventState,
  hint?: string,
  confirm = false,
): PhaseAction => ({ id, label, to, hint, kind: "transition", confirm });

const run = (id: string, label: string, hint?: string): PhaseAction => ({
  id,
  label,
  hint,
  kind: "handler",
});

/**
 * The guidance for one event state.
 *
 * Written as a table rather than a chain of conditionals so that every state is
 * visibly accounted for — a missing case is a type error, not a blank screen.
 */
const GUIDANCE: Record<EventState, PhaseGuidance> = {
  draft: {
    status: "This event is a draft. Nobody can see it yet.",
    next: "Supply the details the poster does not state, then open registration.",
    /*
     * Settings rather than a direct transition. Registration cannot open until
     * a payment account exists, so offering "Open registration" here would be a
     * button that refuses — sending the organizer to the screen that unblocks it
     * is the honest action.
     */
    primary: nav(
      "complete-setup",
      "Complete event setup",
      "settings",
      "Payment details are needed before registration can open.",
    ),
    secondary: [nav("preview-form", "Preview registration form", "registrations")],
  },

  "registration-open": {
    status: "Registration is open.",
    next: "Share the link so people can register.",
    primary: run("share", "Share registration", "Copy the link or show the QR code."),
    secondary: [
      nav("view-registrations", "View registrations", "registrations"),
      nav("review-payments", "Review payments", "payments"),
      move("close-registration", "Close registration", "registration-closed", undefined, true),
    ],
  },

  "registration-closed": {
    status: "Registration is closed.",
    next: "Confirm divisions and seeding before the event day.",
    primary: nav("confirm-divisions", "Confirm divisions", "scrabble", "Review requested against final divisions."),
    secondary: [
      nav("review-payments", "Review payments", "payments"),
      move("start-preparing", "Start preparing", "preparing"),
    ],
  },

  preparing: {
    status: "Preparing for the event day.",
    next: "Open check-in when players start arriving.",
    primary: move("open-check-in", "Open check-in", "check-in-open", "Players can mark themselves present."),
    secondary: [
      nav("seeding", "Review seeding", "scrabble"),
      nav("payments", "Review payments", "payments"),
    ],
  },

  "check-in-open": {
    status: "Check-in is open.",
    next: "Close check-in once everyone has arrived, then publish the first round.",
    primary: nav("check-in", "Open check-in screen", "live", "Mark players present as they arrive."),
    secondary: [move("close-check-in", "Close check-in", "check-in-closed")],
  },

  "check-in-closed": {
    status: "Check-in is closed.",
    next: "Publish the pairings for this round.",
    primary: nav("publish-pairings", "Publish pairings", "live", "Assigns boards and shows them to players."),
    secondary: [nav("standings", "View standings", "scrabble")],
  },

  "round-published": {
    status: "Pairings are published. Players are finding their boards.",
    next: "Start the round clock when everyone is seated.",
    primary: move("start-round", "Start round", "round-active", "Starts the clock on every screen."),
    secondary: [
      nav("pairings", "View pairings", "live"),
      nav("venue-display", "Open venue display", "live"),
    ],
  },

  "round-active": {
    status: "The round is being played.",
    next: "Results can be submitted once games finish.",
    primary: nav("round-control", "Open round control", "live", "Timer, extensions and board progress."),
    secondary: [
      move("open-results", "Open result entry", "result-entry"),
      nav("venue-display", "Open venue display", "live"),
    ],
  },

  "result-entry": {
    status: "Results are being submitted and confirmed.",
    next: "Every board must be verified before the next round.",
    primary: nav("verify-scores", "Verify scores", "scrabble", "Confirm results and settle any conflicts."),
    secondary: [
      move("start-break", "Start break", "break"),
      nav("standings", "View standings", "scrabble"),
    ],
  },

  break: {
    status: "The event is on a break.",
    next: "Prepare the next round, or move to final review after the last one.",
    primary: nav("next-round", "Prepare next round", "live", "Pairs the next round from current standings."),
    secondary: [
      nav("standings", "View standings", "scrabble"),
      move("final-review", "Go to final review", "final-review"),
    ],
  },

  "final-review": {
    status: "All rounds are complete. Results are under final review.",
    next: "Lock the standings, then generate certificates.",
    primary: nav("review-standings", "Review final standings", "scrabble", "Check every result before locking."),
    secondary: [
      nav("awards", "Assign prizes", "awards"),
      move("complete", "Mark event complete", "completed", undefined, true),
    ],
  },

  completed: {
    status: "The tournament is complete.",
    next: "Generate and send certificates, then review how the event went.",
    primary: nav("certificates", "Generate certificates", "awards", "Winners, awards and participation."),
    secondary: [
      nav("analytics", "View analytics", "analytics"),
      nav("standings", "Final standings", "scrabble"),
      move("archive", "Archive event", "archived", undefined, true),
    ],
  },

  archived: {
    status: "This event is archived and read-only.",
    next: "Its results and certificates remain available.",
    primary: nav("analytics", "View analytics", "analytics", "The full record of the event."),
    secondary: [nav("standings", "Final standings", "scrabble")],
  },
};

/** What to offer the organizer in the event's current state. */
export function phaseGuidance(state: EventState): PhaseGuidance {
  return GUIDANCE[state];
}

/* -------------------------------------------------------------------------- */
/* Setup checklist                                                             */
/* -------------------------------------------------------------------------- */

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** Shown when the item is not yet done. */
  hint?: string;
}

export interface ChecklistInput {
  hasForm: boolean;
  hasShareLink: boolean;
  registrationOpen: boolean;
  registrationCount: number;
  paymentsReviewed: number;
  paymentsAwaiting: number;
}

/**
 * The guided empty state for a new event.
 *
 * A newly created event has no registrations, which must read as "ready and
 * waiting" rather than as a broken screen. Each item states what is already
 * true, so the organizer can see the event is set up before anyone has
 * registered.
 */
export function setupChecklist(input: ChecklistInput): ChecklistItem[] {
  return [
    {
      id: "form",
      label: "Registration form created",
      done: input.hasForm,
      hint: "Build the form participants will fill in.",
    },
    {
      id: "link",
      label: "Registration link ready",
      done: input.hasShareLink,
      hint: "Publish the event to generate its public link.",
    },
    {
      id: "qr",
      label: "QR code ready",
      done: input.hasShareLink,
      hint: "Generated with the registration link.",
    },
    {
      id: "open",
      label: input.registrationOpen ? "Registration is open" : "Registration not open yet",
      done: input.registrationOpen,
      hint: "Open registration so people can sign up.",
    },
    {
      id: "registrations",
      label: input.registrationCount
        ? `${input.registrationCount} registration${input.registrationCount === 1 ? "" : "s"} received`
        : "No registrations received yet",
      done: input.registrationCount > 0,
      hint: "Share your registration link to start receiving entries.",
    },
    {
      id: "payments",
      label: input.paymentsAwaiting
        ? `${input.paymentsAwaiting} payment${input.paymentsAwaiting === 1 ? "" : "s"} awaiting review`
        : "No payments awaiting review",
      done: input.paymentsAwaiting === 0,
      hint: "Review uploaded receipts before the event day.",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Alerts                                                                      */
/* -------------------------------------------------------------------------- */

export interface AlertInput {
  paymentsAwaiting: number;
  scoreConflicts: number;
  unverifiedBoards: number;
  unassignedPlayers: number;
  capacityUsed: number;
}

export interface EventAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  tab: WorkspaceTab;
}

/**
 * Things needing the organizer's attention, most urgent first.
 *
 * Deliberately terse and countable — an alert that cannot be acted on is
 * noise, so each one names a number and the tab that resolves it.
 */
export function eventAlerts(input: AlertInput): EventAlert[] {
  const alerts: EventAlert[] = [];

  if (input.scoreConflicts > 0)
    alerts.push({
      id: "conflicts",
      severity: "critical",
      message: `${input.scoreConflicts} score conflict${input.scoreConflicts === 1 ? " needs" : "s need"} a ruling.`,
      tab: "scrabble",
    });

  if (input.paymentsAwaiting > 0)
    alerts.push({
      id: "payments",
      severity: "warning",
      message: `${input.paymentsAwaiting} payment${input.paymentsAwaiting === 1 ? " needs" : "s need"} review.`,
      tab: "payments",
    });

  if (input.unverifiedBoards > 0)
    alerts.push({
      id: "boards",
      severity: "warning",
      message: `${input.unverifiedBoards} board${input.unverifiedBoards === 1 ? " has" : "s have"} no verified result.`,
      tab: "scrabble",
    });

  if (input.unassignedPlayers > 0)
    alerts.push({
      id: "divisions",
      severity: "info",
      message: `${input.unassignedPlayers} player${input.unassignedPlayers === 1 ? " has" : "s have"} no confirmed division.`,
      tab: "scrabble",
    });

  if (input.capacityUsed >= 100)
    alerts.push({
      id: "capacity",
      severity: "warning",
      message: "The event is at capacity. Further entries go to the waiting list.",
      tab: "registrations",
    });

  return alerts;
}
