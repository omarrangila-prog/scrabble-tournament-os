import { Role } from "../domain/types";

/** Every action the demo gates by role. */
export type Capability =
  | "tournament.create"
  | "tournament.edit"
  | "players.edit"
  | "players.import"
  | "checkin.manage"
  | "seeding.edit"
  | "pairings.generate"
  | "pairings.publish"
  | "pairings.override"
  | "scores.enter"
  | "scores.verify"
  | "scores.correct"
  | "disputes.manage"
  | "disputes.rule"
  | "broadcast.manage"
  | "reports.export"
  | "communication.send"
  | "settings.manage";

export const ROLE_LABEL: Record<Role, string> = {
  director: "Tournament Director",
  scorekeeper: "Scorekeeper",
  checkin: "Check-in Officer",
  arbiter: "Arbiter",
  display: "Public Display Operator",
  volunteer: "Volunteer",
};

export const ROLE_SUMMARY: Record<Role, string> = {
  director: "Full tournament control.",
  scorekeeper: "Enter and verify scores. Cannot change tournament structure.",
  checkin: "Registration and attendance only.",
  arbiter: "Dispute and ruling access.",
  display: "Broadcast screens and announcements only.",
  volunteer: "Assigned operational tasks only.",
};

const MATRIX: Record<Role, Capability[]> = {
  director: [
    "tournament.create", "tournament.edit", "players.edit", "players.import",
    "checkin.manage", "seeding.edit", "pairings.generate", "pairings.publish",
    "pairings.override", "scores.enter", "scores.verify", "scores.correct",
    "disputes.manage", "disputes.rule", "broadcast.manage", "reports.export",
    "communication.send", "settings.manage",
  ],
  scorekeeper: ["scores.enter", "scores.verify", "reports.export", "disputes.manage"],
  checkin: ["checkin.manage", "players.edit", "players.import"],
  arbiter: ["disputes.manage", "disputes.rule", "scores.correct", "reports.export"],
  display: ["broadcast.manage"],
  volunteer: ["checkin.manage"],
};

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role]?.includes(capability) ?? false;
}

/**
 * Explains a denial in operational terms. The demo never hides a restricted
 * control silently — it says who may perform the action instead.
 */
export function denialReason(role: Role, capability: Capability): string {
  const holders = (Object.keys(MATRIX) as Role[]).filter((r) => can(r, capability));
  const names = holders.map((r) => ROLE_LABEL[r]).join(" or ");
  return `Your role (${ROLE_LABEL[role]}) cannot perform this action. ${
    names ? `It is reserved for the ${names}.` : "It is reserved for tournament staff."
  }`;
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "tournament.create": "Create tournaments",
  "tournament.edit": "Edit tournament structure",
  "players.edit": "Add and edit players",
  "players.import": "Bulk import players",
  "checkin.manage": "Check players in",
  "seeding.edit": "Adjust divisions and seeding",
  "pairings.generate": "Generate pairings",
  "pairings.publish": "Publish a round",
  "pairings.override": "Override pairings manually",
  "scores.enter": "Enter scores",
  "scores.verify": "Verify results",
  "scores.correct": "Correct a verified score",
  "disputes.manage": "Manage dispute cases",
  "disputes.rule": "Issue a ruling",
  "broadcast.manage": "Control broadcast screens",
  "reports.export": "Export reports",
  "communication.send": "Send communications",
  "settings.manage": "Change settings",
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABEL) as Capability[];
export const ALL_ROLES = Object.keys(MATRIX) as Role[];
