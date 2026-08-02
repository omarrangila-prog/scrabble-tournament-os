"use client";

/**
 * Team rosters and the rules used to score them.
 *
 * Only rosters and rules live here. Standings and match results are derived
 * from the verified game record on every read, so a corrected score corrects
 * the team table with no separate recalculation step.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_TEAM_RULES, Team, TeamScoringRules } from "../engine/teams";

export const TEAM_STORAGE_KEY = "bluffy-teams-v1";

interface TeamState {
  hydrated: boolean;
  teams: Team[];
  /** Scoring rules, per event. */
  rules: Record<string, TeamScoringRules>;
}

interface TeamActions {
  createTeam: (draft: Omit<Team, "id" | "memberIds"> & { memberIds?: string[] }) => Team;
  renameTeam: (id: string, name: string, shortName: string) => void;
  removeTeam: (id: string) => void;

  /** Moves a player onto a team, removing them from any other team first. */
  assign: (eventId: string, teamId: string, playerId: string) => void;
  unassign: (playerId: string) => void;

  teamsFor: (eventId: string) => Team[];
  teamOf: (eventId: string, playerId: string) => Team | undefined;

  rulesFor: (eventId: string) => TeamScoringRules;
  setRules: (eventId: string, patch: Partial<TeamScoringRules>) => void;

  resetTeams: () => void;
}

export type TeamStore = TeamState & TeamActions;

const uid = () => Math.random().toString(36).slice(2, 10);

const fresh = (): TeamState => ({ hydrated: false, teams: [], rules: {} });

export const useTeamStore = create<TeamStore>()(
  persist(
    (set, get) => ({
      ...fresh(),

      createTeam: (draft) => {
        const team: Team = { ...draft, id: `team-${uid()}`, memberIds: draft.memberIds ?? [] };
        set((s) => ({ teams: [...s.teams, team] }));
        return team;
      },

      renameTeam: (id, name, shortName) =>
        set((s) => ({
          teams: s.teams.map((t) => (t.id === id ? { ...t, name, shortName } : t)),
        })),

      removeTeam: (id) => set((s) => ({ teams: s.teams.filter((t) => t.id !== id) })),

      assign: (eventId, teamId, playerId) =>
        set((s) => ({
          teams: s.teams.map((t) => {
            if (t.eventId !== eventId) return t;
            // A player on two teams would have their games counted twice.
            if (t.id === teamId)
              return t.memberIds.includes(playerId)
                ? t
                : { ...t, memberIds: [...t.memberIds, playerId] };
            return t.memberIds.includes(playerId)
              ? { ...t, memberIds: t.memberIds.filter((id) => id !== playerId) }
              : t;
          }),
        })),

      unassign: (playerId) =>
        set((s) => ({
          teams: s.teams.map((t) => ({
            ...t,
            memberIds: t.memberIds.filter((id) => id !== playerId),
          })),
        })),

      teamsFor: (eventId) => get().teams.filter((t) => t.eventId === eventId),

      teamOf: (eventId, playerId) =>
        get().teams.find((t) => t.eventId === eventId && t.memberIds.includes(playerId)),

      rulesFor: (eventId) => get().rules[eventId] ?? DEFAULT_TEAM_RULES,

      setRules: (eventId, patch) =>
        set((s) => ({
          rules: {
            ...s.rules,
            [eventId]: { ...(s.rules[eventId] ?? DEFAULT_TEAM_RULES), ...patch },
          },
        })),

      resetTeams: () => set({ ...fresh(), hydrated: true }),
    }),
    {
      name: TEAM_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s as TeamStore;
        void hydrated;
        return rest as unknown as TeamStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
