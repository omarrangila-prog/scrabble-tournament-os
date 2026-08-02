"use client";

/**
 * Identity, registration and category store.
 *
 * Kept separate from the tournament operations store because it has a longer
 * lifetime: identities and category ledgers outlive any single event. Every
 * mutation appends to a timeline or ledger rather than overwriting history.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  CategoryLedgerEntry,
  CategoryRecommendation,
  PlayerCategory,
  PlayerIdentity,
  Registration,
  RegistrationStatus,
  categoryEligibility,
  formatPlayerId,
} from "../domain/identity";
import { buildIdentitySeed } from "../domain/identitySeed";

export const IDENTITY_STORAGE_KEY = "tournament-os-identity-v1";

interface IdentityState {
  hydrated: boolean;
  identities: PlayerIdentity[];
  registrations: Registration[];
  ledger: CategoryLedgerEntry[];
  recommendations: CategoryRecommendation[];
  /** Highest player number issued. Never decreases, so IDs are never reused. */
  idSequence: number;
}

interface IdentityActions {
  submitRegistration: (
    registration: Omit<Registration, "id" | "submittedAt" | "timeline" | "status"> & {
      status?: RegistrationStatus;
    },
    by: string,
  ) => Registration;

  /** Approves a registration, minting a permanent identity for a new player. */
  approveRegistration: (registrationId: string, by: string, note?: string) => PlayerIdentity | null;
  rejectRegistration: (registrationId: string, by: string, note: string) => void;
  waitlistRegistration: (registrationId: string, by: string, note?: string) => void;
  setRegistrationStatus: (
    registrationId: string,
    status: RegistrationStatus,
    by: string,
    note?: string,
  ) => void;

  /** Applies a category change and appends to the immutable ledger. */
  changeCategory: (
    playerId: string,
    to: PlayerCategory,
    reason: string,
    by: string,
    options?: { kind?: CategoryLedgerEntry["kind"]; recommendationId?: string; override?: boolean },
  ) => { ok: boolean; message: string };

  setRecommendations: (recs: CategoryRecommendation[]) => void;
  decideRecommendation: (
    id: string,
    decision: "approved" | "rejected" | "postponed",
    by: string,
    note?: string,
  ) => void;

  identityOf: (playerId: string) => PlayerIdentity | undefined;
  categoryOf: (playerId: string) => PlayerCategory | undefined;
  historyOf: (playerId: string) => CategoryLedgerEntry[];

  resetIdentityDemo: () => void;
}

export type IdentityStore = IdentityState & IdentityActions;

function freshState(): IdentityState {
  const seed = buildIdentitySeed();
  return {
    hydrated: false,
    identities: seed.identities,
    registrations: seed.registrations,
    ledger: seed.ledger,
    recommendations: seed.recommendations,
    idSequence: seed.idSequence,
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

export const useIdentityStore = create<IdentityStore>()(
  persist(
    (set, get) => ({
      ...freshState(),

      submitRegistration: (input, by) => {
        const registration: Registration = {
          ...input,
          id: `reg-${uid()}`,
          status: input.status ?? "payment-review",
          submittedAt: now(),
          timeline: [{ at: now(), by, entry: "Registration submitted." }],
        };
        set((s) => ({ registrations: [registration, ...s.registrations] }));
        return registration;
      },

      approveRegistration: (registrationId, by, note) => {
        const reg = get().registrations.find((r) => r.id === registrationId);
        if (!reg || reg.status === "approved") return null;

        let identity = reg.playerId
          ? get().identities.find((i) => i.playerId === reg.playerId)
          : undefined;

        // A new player receives their permanent identity at approval.
        if (!identity) {
          const sequence = get().idSequence + 1;
          const playerId = formatPlayerId(sequence);
          identity = {
            ...reg.applicant,
            playerId,
            registeredAt: now(),
            verified: !!reg.applicant.identityDocument,
          };
          set((s) => ({
            identities: [...s.identities, identity!],
            idSequence: sequence,
            ledger: [
              {
                id: `cat-${uid()}`,
                playerId,
                from: null,
                to: reg.category,
                kind: "initial",
                reason: "Category selected at registration.",
                decidedBy: by,
                at: now(),
              },
              ...s.ledger,
            ],
          }));
        }

        set((s) => ({
          registrations: s.registrations.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  status: "approved",
                  playerId: identity!.playerId,
                  decidedAt: now(),
                  decidedBy: by,
                  decisionNote: note,
                  payment: { ...r.payment, verifiedBy: by, receivedAt: r.payment.receivedAt ?? now() },
                  timeline: [
                    ...r.timeline,
                    {
                      at: now(),
                      by,
                      entry: reg.isNewPlayer
                        ? `Approved. Permanent Player ID ${identity!.playerId} issued.`
                        : "Approved. Existing identity linked.",
                    },
                  ],
                }
              : r,
          ),
        }));

        return identity;
      },

      rejectRegistration: (registrationId, by, note) =>
        set((s) => ({
          registrations: s.registrations.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  status: "rejected",
                  decidedAt: now(),
                  decidedBy: by,
                  decisionNote: note,
                  timeline: [...r.timeline, { at: now(), by, entry: `Rejected: ${note}` }],
                }
              : r,
          ),
        })),

      waitlistRegistration: (registrationId, by, note) =>
        set((s) => ({
          registrations: s.registrations.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  status: "waitlisted",
                  decidedAt: now(),
                  decidedBy: by,
                  decisionNote: note,
                  timeline: [
                    ...r.timeline,
                    { at: now(), by, entry: note ? `Waitlisted: ${note}` : "Moved to the waiting list." },
                  ],
                }
              : r,
          ),
        })),

      setRegistrationStatus: (registrationId, status, by, note) =>
        set((s) => ({
          registrations: s.registrations.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  status,
                  timeline: [
                    ...r.timeline,
                    { at: now(), by, entry: note ?? `Status changed to ${status}.` },
                  ],
                }
              : r,
          ),
        })),

      changeCategory: (playerId, to, reason, by, options) => {
        const identity = get().identities.find((i) => i.playerId === playerId);
        if (!identity) return { ok: false, message: "No identity found for this player." };
        if (identity.category === to)
          return { ok: false, message: `This player is already in the ${to} category.` };

        // Beginner keeps its experience limit unless an administrator overrides
        // it. Events played is derived from approved registrations rather than
        // stored on the identity, so it cannot drift out of date.
        const eventsPlayed = selectEventsPlayed(get(), playerId);
        const eligibility = categoryEligibility(to, { eventsPlayed });
        if (!eligibility.eligible && !options?.override) {
          return { ok: false, message: eligibility.reason ?? "This category is not available." };
        }

        const from = identity.category;
        set((s) => ({
          identities: s.identities.map((i) =>
            i.playerId === playerId ? { ...i, category: to } : i,
          ),
          ledger: [
            {
              id: `cat-${uid()}`,
              playerId,
              from,
              to,
              kind:
                options?.kind ??
                (["beginner", "recreational", "advanced", "masters"].indexOf(to) >
                ["beginner", "recreational", "advanced", "masters"].indexOf(from)
                  ? "promotion"
                  : "demotion"),
              reason: options?.override ? `${reason} (administrator override)` : reason,
              decidedBy: by,
              at: now(),
              recommendationId: options?.recommendationId,
            },
            ...s.ledger,
          ],
        }));

        return { ok: true, message: `Category changed from ${from} to ${to}.` };
      },

      setRecommendations: (recs) =>
        set((s) => {
          // Keep decisions already made; only refresh the open ones.
          const decided = s.recommendations.filter((r) => r.status !== "open");
          const decidedPlayers = new Set(decided.map((r) => `${r.playerId}:${r.proposed}`));
          return {
            recommendations: [
              ...decided,
              ...recs.filter((r) => !decidedPlayers.has(`${r.playerId}:${r.proposed}`)),
            ],
          };
        }),

      decideRecommendation: (id, decision, by, note) =>
        set((s) => ({
          recommendations: s.recommendations.map((r) =>
            r.id === id
              ? { ...r, status: decision, decidedAt: now(), decidedBy: by, decisionNote: note }
              : r,
          ),
        })),

      identityOf: (playerId) => get().identities.find((i) => i.playerId === playerId),
      categoryOf: (playerId) => get().identities.find((i) => i.playerId === playerId)?.category,
      historyOf: (playerId) =>
        get()
          .ledger.filter((l) => l.playerId === playerId)
          .sort((a, b) => b.at.localeCompare(a.at)),

      resetIdentityDemo: () => set({ ...freshState(), hydrated: true }),
    }),
    {
      name: IDENTITY_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s as IdentityStore;
        void hydrated;
        return rest as unknown as IdentityStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/**
 * Rated events a player has completed, derived from approved registrations.
 *
 * Not stored on the identity: an identity that carried its own count would
 * drift the moment a registration was approved or withdrawn elsewhere. This is
 * the single definition used by Beginner eligibility everywhere.
 */
export function selectEventsPlayed(s: IdentityStore, playerId: string | null): number {
  if (!playerId) return 0;
  return s.registrations.filter((r) => r.playerId === playerId && r.status === "approved").length;
}
