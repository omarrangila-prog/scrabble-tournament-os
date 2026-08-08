"use client";

/**
 * Tournament OS demo store.
 *
 * Holds the whole tournament in memory and persists it to localStorage so the
 * demo survives a refresh. Business logic lives in `lib/engine`; this file only
 * co-ordinates state transitions and writes the audit trail.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ActivityEntry,
  Announcement,
  AuditEntry,
  Dispute,
  Division,
  MessageCampaign,
  Organization,
  Pairing,
  Player,
  ResultSubmission,
  Role,
  Round,
  Tournament,
  User,
  Venue,
} from "../domain/types";
import { buildSeed } from "../domain/seed";
import {
  annotateConflicts,
  generateRound,
  swapPlayers,
  validateRound,
  ValidationReport,
} from "../engine/pairing";
import { computeStandings } from "../engine/standings";
import { Capability, can } from "./permissions";

export const STORAGE_KEY = "tournament-os-demo-v1";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: "success" | "info" | "warning" | "critical";
}

interface StoreState {
  hydrated: boolean;
  organization: Organization;
  venue: Venue;
  divisions: Division[];
  users: User[];
  tournament: Tournament;
  /** Additional tournaments created through the wizard. */
  tournaments: Tournament[];
  players: Player[];
  pairings: Pairing[];
  rounds: Round[];
  submissions: ResultSubmission[];
  disputes: Dispute[];
  announcements: Announcement[];
  campaigns: MessageCampaign[];
  audit: AuditEntry[];
  activity: ActivityEntry[];

  /** Session */
  currentUser: User | null;
  role: Role;
  signedIn: boolean;

  /** Round 6 staged in the pairing engine but not yet published. */
  draftRound: Pairing[] | null;
  draftRoundNumber: number | null;

  toasts: Toast[];
  /** Player ids whose standings row changed on the last verification. */
  recentlyMoved: string[];
}

interface StoreActions {
  signIn: (role: Role) => void;
  signOut: () => void;
  resetDemo: () => void;

  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  /** Returns true when allowed; otherwise raises an explanatory toast. */
  requireCapability: (capability: Capability) => boolean;

  checkInPlayer: (playerId: string, method: string) => void;
  setPlayerStatus: (playerId: string, status: Player["checkIn"], note?: string) => void;
  markLate: (playerId: string, expectedArrival: string) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (playerId: string, patch: Partial<Player>) => void;
  importPlayers: (players: Player[]) => void;

  setSeed: (playerId: string, seed: number) => void;
  movePlayerDivision: (playerId: string, division: Player["division"]) => void;

  generateDraftRound: (round: number) => ValidationReport;
  swapDraftPlayers: (a: string, b: string, reason: string) => void;
  lockPairing: (pairingId: string, locked: boolean) => void;
  acknowledgeConflict: (pairingId: string, kind: string, reason: string) => void;
  assignBye: (pairingId: string) => void;
  discardDraft: () => void;
  publishDraft: () => void;
  reassignBoard: (pairingId: string, board: number, reason: string) => void;

  submitScore: (
    pairingId: string,
    scoreA: number,
    scoreB: number,
    options?: { verify?: boolean; reason?: string },
  ) => void;
  verifyResult: (pairingId: string) => void;
  correctScore: (pairingId: string, scoreA: number, scoreB: number, reason: string) => void;

  updateDispute: (id: string, patch: Partial<Dispute>, entry?: string) => void;
  createDispute: (dispute: Dispute) => void;

  publishAnnouncement: (a: Announcement) => void;
  sendCampaign: (c: MessageCampaign) => void;

  createTournament: (t: Tournament) => void;
  updateTournament: (patch: Partial<Tournament>) => void;

  logAudit: (entry: Omit<AuditEntry, "id" | "at" | "tournamentId">) => void;
}

export type Store = StoreState & StoreActions;

function freshState(): StoreState {
  const seed = buildSeed();
  return {
    hydrated: false,
    organization: seed.organization,
    venue: seed.venue,
    divisions: seed.divisions,
    users: seed.users,
    tournament: seed.tournament,
    tournaments: [seed.tournament],
    players: seed.players,
    pairings: seed.pairings,
    rounds: seed.rounds,
    submissions: seed.submissions,
    disputes: seed.disputes,
    announcements: seed.announcements,
    campaigns: seed.campaigns,
    audit: seed.audit,
    activity: seed.activity,
    currentUser: null,
    role: "director",
    signedIn: false,
    draftRound: null,
    draftRoundNumber: null,
    toasts: [],
    recentlyMoved: [],
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const DEVICE = "Desktop · Chrome";

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...freshState(),

      signIn: (role) => {
        const user = get().users.find((u) => u.role === role) ?? get().users[0];
        set({ signedIn: true, role, currentUser: user });
      },

      signOut: () => set({ signedIn: false, currentUser: null }),

      resetDemo: () => {
        const next = freshState();
        set({ ...next, hydrated: true, signedIn: get().signedIn, currentUser: get().currentUser, role: get().role });
        get().toast({
          title: "Demo data reset",
          description: "The tournament has been restored to its original state.",
          tone: "success",
        });
      },

      toast: (t) => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
        if (typeof window !== "undefined") {
          window.setTimeout(() => get().dismissToast(id), 5200);
        }
      },

      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      requireCapability: (capability) => {
        const { role } = get();
        if (can(role, capability)) return true;
        // Denial is explained rather than silently hidden.
        import("./permissions").then(({ denialReason }) => {
          get().toast({
            title: "Action not permitted",
            description: denialReason(role, capability),
            tone: "warning",
          });
        });
        return false;
      },

      logAudit: (entry) =>
        set((s) => ({
          audit: [
            {
              ...entry,
              id: `au-${uid()}`,
              at: now(),
              tournamentId: s.tournament.id,
            },
            ...s.audit,
          ],
        })),

      checkInPlayer: (playerId, method) => {
        const player = get().players.find((p) => p.id === playerId);
        if (!player) return;
        set((s) => ({
          players: s.players.map((p) =>
            p.id === playerId ? { ...p, checkIn: "checked-in", checkInAt: now() } : p,
          ),
          activity: [
            {
              id: `ac-${uid()}`,
              at: now(),
              user: s.currentUser?.name ?? "Demo user",
              message: `${player.fullName} checked in through ${method}`,
              kind: "checkin",
            },
            ...s.activity,
          ],
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Player checked in",
          target: player.playerId,
          previousValue: player.checkIn,
          newValue: "checked-in",
          reason: `Check-in via ${method}`,
          device: DEVICE,
        });
      },

      setPlayerStatus: (playerId, status, note) => {
        const player = get().players.find((p) => p.id === playerId);
        if (!player) return;
        set((s) => ({
          players: s.players.map((p) => (p.id === playerId ? { ...p, checkIn: status } : p)),
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Attendance status changed",
          target: player.playerId,
          previousValue: player.checkIn,
          newValue: status,
          reason: note,
          device: DEVICE,
        });
      },

      markLate: (playerId, expectedArrival) => {
        const player = get().players.find((p) => p.id === playerId);
        if (!player) return;
        set((s) => ({
          players: s.players.map((p) =>
            p.id === playerId ? { ...p, checkIn: "late", expectedArrival } : p,
          ),
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Player marked late",
          target: player.playerId,
          previousValue: player.checkIn,
          newValue: `late (expected ${expectedArrival})`,
          device: DEVICE,
        });
      },

      addPlayer: (player) => {
        set((s) => ({ players: [...s.players, player] }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Player registered",
          target: player.playerId,
          newValue: player.fullName,
          device: DEVICE,
        });
      },

      updatePlayer: (playerId, patch) =>
        set((s) => ({
          players: s.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
        })),

      importPlayers: (incoming) => {
        set((s) => ({ players: [...s.players, ...incoming] }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Players imported",
          target: "Bulk import",
          newValue: `${incoming.length} records`,
          device: DEVICE,
        });
      },

      setSeed: (playerId, seed) => {
        const player = get().players.find((p) => p.id === playerId);
        if (!player) return;
        set((s) => ({
          players: s.players.map((p) => (p.id === playerId ? { ...p, seed } : p)),
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Seed adjusted",
          target: player.playerId,
          previousValue: String(player.seed),
          newValue: String(seed),
          device: DEVICE,
        });
      },

      movePlayerDivision: (playerId, division) => {
        const player = get().players.find((p) => p.id === playerId);
        if (!player) return;
        set((s) => ({
          players: s.players.map((p) => (p.id === playerId ? { ...p, division } : p)),
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Division changed",
          target: player.playerId,
          previousValue: player.division,
          newValue: division,
          device: DEVICE,
        });
      },

      generateDraftRound: (round) => {
        const { players, pairings, tournament } = get();
        const locked = (get().draftRound ?? []).filter((p) => p.locked);
        const { pairings: next } = generateRound({
          players,
          pairings,
          tournament,
          round,
          locked,
        });
        set({ draftRound: next, draftRoundNumber: round });
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Pairings generated",
          target: `Round ${round}`,
          newValue: `${next.filter((p) => p.playerBId).length} pairings`,
          device: DEVICE,
        });
        return validateRound(next, players);
      },

      swapDraftPlayers: (a, b, reason) => {
        const { draftRound, players, tournament } = get();
        if (!draftRound) return;
        const next = swapPlayers(draftRound, players, tournament, a, b);
        const nameOf = (id: string) => players.find((p) => p.id === id)?.fullName ?? id;
        set({
          draftRound: next.map((p) =>
            p.playerAId === a || p.playerBId === a || p.playerAId === b || p.playerBId === b
              ? { ...p, manualOverride: { by: get().currentUser?.name ?? "Director", reason, at: now() } }
              : p,
          ),
        });
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Pairing modified",
          target: `Round ${get().draftRoundNumber}`,
          previousValue: `${nameOf(a)} / ${nameOf(b)} original boards`,
          newValue: "Players swapped",
          reason,
          device: DEVICE,
        });
      },

      lockPairing: (pairingId, locked) =>
        set((s) => ({
          draftRound: s.draftRound?.map((p) => (p.id === pairingId ? { ...p, locked } : p)) ?? null,
        })),

      acknowledgeConflict: (pairingId, kind, reason) => {
        set((s) => ({
          draftRound:
            s.draftRound?.map((p) =>
              p.id === pairingId
                ? {
                    ...p,
                    conflicts: p.conflicts.map((c) =>
                      c.kind === kind ? { ...c, acknowledgedReason: reason } : c,
                    ),
                  }
                : p,
            ) ?? null,
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Pairing exception approved",
          target: pairingId,
          newValue: kind,
          reason,
          device: DEVICE,
        });
      },

      assignBye: (pairingId) => {
        const { draftRound, players, tournament } = get();
        if (!draftRound) return;
        const target = draftRound.find((p) => p.id === pairingId);
        if (!target || !target.playerBId) return;
        // The lower-ranked player receives the bye; the other returns to the pool.
        const next = draftRound.map((p) =>
          p.id === pairingId
            ? { ...p, playerBId: null, board: 0, status: "bye" as const, reason: "Bye assigned by the Tournament Director." }
            : p,
        );
        set({ draftRound: annotateConflicts(next, players, tournament) });
      },

      discardDraft: () => set({ draftRound: null, draftRoundNumber: null }),

      publishDraft: () => {
        const { draftRound, draftRoundNumber, tournament } = get();
        if (!draftRound || !draftRoundNumber) return;
        const published = draftRound.map((p) => ({
          ...p,
          status: p.playerBId === null ? ("bye" as const) : ("scheduled" as const),
        }));
        set((s) => ({
          pairings: [...s.pairings.filter((p) => p.round !== draftRoundNumber), ...published],
          rounds: [
            ...s.rounds.filter((r) => r.number !== draftRoundNumber),
            {
              id: `r-${draftRoundNumber}`,
              tournamentId: tournament.id,
              number: draftRoundNumber,
              status: "published" as const,
              publishedAt: now(),
              startsAt: now(),
              pairingCount: published.length,
            },
          ].sort((a, b) => a.number - b.number),
          tournament: { ...s.tournament, currentRound: draftRoundNumber },
          draftRound: null,
          draftRoundNumber: null,
          activity: [
            {
              id: `ac-${uid()}`,
              at: now(),
              user: s.currentUser?.name ?? "Demo user",
              message: `Round ${draftRoundNumber} pairings published`,
              kind: "pairing",
            },
            ...s.activity,
          ],
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Round published",
          target: `Round ${draftRoundNumber}`,
          newValue: `${published.filter((p) => p.playerBId).length} pairings`,
          device: DEVICE,
        });
      },

      reassignBoard: (pairingId, board, reason) => {
        const pairing = get().pairings.find((p) => p.id === pairingId);
        set((s) => ({
          pairings: s.pairings.map((p) => (p.id === pairingId ? { ...p, board } : p)),
          activity: [
            {
              id: `ac-${uid()}`,
              at: now(),
              user: s.currentUser?.name ?? "Demo user",
              message: `Board ${pairing?.board} reassigned to ${board}`,
              kind: "board",
            },
            ...s.activity,
          ],
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Board reassigned",
          target: `Board ${pairing?.board}`,
          previousValue: `Board ${pairing?.board}`,
          newValue: `Board ${board}`,
          reason,
          device: DEVICE,
        });
      },

      submitScore: (pairingId, scoreA, scoreB, options) => {
        const pairing = get().pairings.find((p) => p.id === pairingId);
        if (!pairing) return;
        const verify = options?.verify ?? false;
        set((s) => ({
          pairings: s.pairings.map((p) =>
            p.id === pairingId
              ? {
                  ...p,
                  scoreA,
                  scoreB,
                  status: verify ? "verified" : "awaiting-verification",
                  completedAt: now(),
                }
              : p,
          ),
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: verify ? "Result submitted and verified" : "Result submitted",
          target: `Board ${pairing.board} (Round ${pairing.round})`,
          newValue: `${scoreA} – ${scoreB}`,
          reason: options?.reason,
          device: DEVICE,
        });
        if (verify) get().verifyResult(pairingId);
      },

      verifyResult: (pairingId) => {
        const before = get();
        const pairing = before.pairings.find((p) => p.id === pairingId);
        if (!pairing) return;

        const division = pairing.division;
        const prev = computeStandings(before.players, before.pairings, before.tournament, { division });

        set((s) => ({
          pairings: s.pairings.map((p) =>
            p.id === pairingId ? { ...p, status: "verified", completedAt: p.completedAt ?? now() } : p,
          ),
          activity: [
            {
              id: `ac-${uid()}`,
              at: now(),
              user: s.currentUser?.name ?? "Demo user",
              message: `Board ${pairing.board} result verified`,
              kind: "result",
            },
            ...s.activity,
          ],
        }));

        // Highlight rows whose rank actually changed, for the standings animation.
        const after = computeStandings(get().players, get().pairings, get().tournament, { division });
        const prevRank = new Map(prev.map((r) => [r.playerId, r.rank]));
        const moved = after
          .filter((r) => prevRank.get(r.playerId) !== undefined && prevRank.get(r.playerId) !== r.rank)
          .map((r) => r.playerId);
        set({ recentlyMoved: moved });

        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Result verified",
          target: `Board ${pairing.board} (Round ${pairing.round})`,
          newValue: `${pairing.scoreA} – ${pairing.scoreB}`,
          device: DEVICE,
        });
      },

      correctScore: (pairingId, scoreA, scoreB, reason) => {
        const pairing = get().pairings.find((p) => p.id === pairingId);
        if (!pairing) return;
        set((s) => ({
          pairings: s.pairings.map((p) =>
            p.id === pairingId ? { ...p, scoreA, scoreB, status: "verified" } : p,
          ),
          activity: [
            {
              id: `ac-${uid()}`,
              at: now(),
              user: s.currentUser?.name ?? "Demo user",
              message: `Score corrected on board ${pairing.board}`,
              kind: "correction",
            },
            ...s.activity,
          ],
        }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Score corrected",
          target: `Board ${pairing.board} (Round ${pairing.round})`,
          previousValue: `${pairing.scoreA} – ${pairing.scoreB}`,
          newValue: `${scoreA} – ${scoreB}`,
          reason,
          device: DEVICE,
        });
      },

      updateDispute: (id, patch, entry) =>
        set((s) => ({
          disputes: s.disputes.map((d) =>
            d.id === id
              ? {
                  ...d,
                  ...patch,
                  timeline: entry
                    ? [...d.timeline, { at: now(), by: s.currentUser?.name ?? "Demo user", entry }]
                    : d.timeline,
                }
              : d,
          ),
        })),

      createDispute: (dispute) => set((s) => ({ disputes: [dispute, ...s.disputes] })),

      publishAnnouncement: (a) => {
        set((s) => ({ announcements: [a, ...s.announcements] }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Announcement published",
          target: a.title,
          newValue: a.audience,
          device: DEVICE,
        });
      },

      sendCampaign: (c) => {
        set((s) => ({ campaigns: [c, ...s.campaigns] }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Message sent",
          target: c.template,
          newValue: `${c.recipients} recipients via ${c.channel}`,
          device: DEVICE,
        });
      },

      createTournament: (t) => {
        set((s) => ({ tournaments: [...s.tournaments, t] }));
        get().logAudit({
          user: get().currentUser?.name ?? "Demo user",
          role: get().role,
          action: "Tournament created",
          target: t.name,
          newValue: `${t.totalRounds} rounds · ${t.divisions.length} divisions`,
          device: DEVICE,
        });
      },

      updateTournament: (patch) =>
        set((s) => ({ tournament: { ...s.tournament, ...patch } })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),

      /*
       * Reference data follows the code; play data belongs to the tournament.
       *
       * A browser that opened the app before the fabricated data was removed
       * kept it: the invented venue with its 72 boards, the tournament claiming
       * to be live on round 5 with no players, and the four made-up sponsors.
       * Clearing the cache was the only way out, which nobody would think to do.
       *
       * This refreshes the organization, venue, divisions, users and tournament
       * from the seed while keeping players, pairings and results, so a
       * tournament in progress is never wiped by an update.
       */
      version: 2,
      migrate: (persisted, from) => {
        const state = (persisted ?? {}) as Partial<Store>;
        if (from >= 2) return state as Store;

        const fresh = freshState();
        return {
          ...state,
          organization: fresh.organization,
          venue: fresh.venue,
          divisions: fresh.divisions,
          users: fresh.users,
          tournament: fresh.tournament,
          tournaments: fresh.tournaments,
        } as Store;
      },
      // Session flags stay out of storage so a refresh keeps data but the
      // sign-in state is re-established by the app shell.
      partialize: (s) => {
        const { toasts, hydrated, recentlyMoved, ...rest } = s as Store;
        void toasts;
        void hydrated;
        void recentlyMoved;
        return rest as unknown as Store;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/** Derived selectors — kept out of components so pages stay presentational. */
export const selectStandings = (
  s: Store,
  options: { division?: string; upToRound?: number } = {},
) => computeStandings(s.players, s.pairings, s.tournament, options);

