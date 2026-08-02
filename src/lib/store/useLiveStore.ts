"use client";

/**
 * Live event operations: venue-day state.
 *
 * Holds the things that only exist while an event is running — device sessions,
 * check-ins, round timers, table assignments and result submissions. Separate
 * from the registration store because this is written constantly during a
 * tournament and discarded once the event is archived.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  createTimer,
  endTimer,
  extendTimer,
  pauseTimer,
  resumeTimer,
  RoundTimer,
  roundProgress,
  startTimer,
} from "../engine/roundTimer";
import type { GuestRegistration } from "./useEventStore";

export const LIVE_STORAGE_KEY = "bluffy-live-v1";

/** One player's reported result for a board. */
export interface ResultSubmission {
  id: string;
  eventId: string;
  round: number;
  board: number;
  /** Registration id of the player who submitted. */
  byId: string;
  myScore: number;
  theirScore: number;
  at: string;
  /** Set once the opponent agrees, or a scorekeeper verifies. */
  confirmed: boolean;
  /** Set when two submissions for the same board disagree. */
  disputed: boolean;
}

export interface TablePairing {
  eventId: string;
  round: number;
  board: number;
  playerAId: string;
  playerBId: string;
}

interface LiveState {
  hydrated: boolean;
  /** eventId → registrationId, so a device is asked who it is only once. */
  sessions: Record<string, string>;
  /** `${eventId}:${registrationId}` for everyone checked in. */
  checkedIn: string[];
  timers: RoundTimer[];
  pairings: TablePairing[];
  submissions: ResultSubmission[];
  rounds: Record<string, number>;
}

interface LiveActions {
  rememberSession: (eventId: string, registrationId: string) => void;
  forgetSession: (eventId: string) => void;
  sessionFor: (eventId: string) => string | undefined;

  checkIn: (eventId: string, registrationId: string) => void;
  undoCheckIn: (eventId: string, registrationId: string) => void;
  isCheckedIn: (eventId: string, registrationId: string) => boolean;
  checkedInCount: (eventId: string) => number;

  currentRound: (eventId: string) => number;
  setRound: (eventId: string, round: number) => void;

  timerFor: (eventId: string, round: number) => RoundTimer | undefined;
  ensureTimer: (eventId: string, round: number, minutes: number) => void;
  start: (eventId: string, round: number) => void;
  pause: (eventId: string, round: number) => void;
  resume: (eventId: string, round: number) => void;
  end: (eventId: string, round: number) => void;
  extend: (eventId: string, round: number, minutes: number, reason: string, by: string) => void;

  /** Pairs checked-in players into tables for a round. */
  generatePairings: (eventId: string, round: number, registrationIds: string[]) => void;
  boardFor: (eventId: string, registrationId: string) => number | undefined;
  opponentFor: (
    eventId: string,
    registrationId: string,
    registrations: GuestRegistration[],
  ) => GuestRegistration | undefined;

  submitResult: (
    eventId: string,
    round: number,
    board: number,
    byId: string,
    myScore: number,
    theirScore: number,
  ) => void;
  submissionFor: (
    eventId: string,
    round: number,
    board: number,
    byId: string,
  ) => ResultSubmission | undefined;
  confirmResult: (submissionId: string) => void;
  progressFor: (eventId: string, round: number) => ReturnType<typeof roundProgress>;

  resetLive: () => void;
}

export type LiveStore = LiveState & LiveActions;

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const key = (eventId: string, registrationId: string) => `${eventId}:${registrationId}`;

const fresh = (): LiveState => ({
  hydrated: false,
  sessions: {},
  checkedIn: [],
  timers: [],
  pairings: [],
  submissions: [],
  rounds: {},
});

export const useLiveStore = create<LiveStore>()(
  persist(
    (set, get) => ({
      ...fresh(),

      /* ---- Device session ------------------------------------------- */

      rememberSession: (eventId, registrationId) =>
        set((s) => ({ sessions: { ...s.sessions, [eventId]: registrationId } })),

      forgetSession: (eventId) =>
        set((s) => {
          const next = { ...s.sessions };
          delete next[eventId];
          return { sessions: next };
        }),

      sessionFor: (eventId) => get().sessions[eventId],

      /* ---- Check-in --------------------------------------------------- */

      checkIn: (eventId, registrationId) =>
        set((s) =>
          s.checkedIn.includes(key(eventId, registrationId))
            ? s
            : { checkedIn: [...s.checkedIn, key(eventId, registrationId)] },
        ),

      undoCheckIn: (eventId, registrationId) =>
        set((s) => ({ checkedIn: s.checkedIn.filter((k) => k !== key(eventId, registrationId)) })),

      isCheckedIn: (eventId, registrationId) =>
        get().checkedIn.includes(key(eventId, registrationId)),

      checkedInCount: (eventId) =>
        get().checkedIn.filter((k) => k.startsWith(`${eventId}:`)).length,

      /* ---- Rounds ----------------------------------------------------- */

      currentRound: (eventId) => get().rounds[eventId] ?? 1,

      setRound: (eventId, round) =>
        set((s) => ({ rounds: { ...s.rounds, [eventId]: round } })),

      /* ---- Timer ------------------------------------------------------ */

      timerFor: (eventId, round) =>
        get().timers.find((t) => t.eventId === eventId && t.round === round),

      ensureTimer: (eventId, round, minutes) =>
        set((s) =>
          s.timers.some((t) => t.eventId === eventId && t.round === round)
            ? s
            : { timers: [...s.timers, createTimer(eventId, round, minutes)] },
        ),

      start: (eventId, round) =>
        set((s) => ({
          timers: s.timers.map((t) =>
            t.eventId === eventId && t.round === round ? startTimer(t) : t,
          ),
        })),

      pause: (eventId, round) =>
        set((s) => ({
          timers: s.timers.map((t) =>
            t.eventId === eventId && t.round === round ? pauseTimer(t) : t,
          ),
        })),

      resume: (eventId, round) =>
        set((s) => ({
          timers: s.timers.map((t) =>
            t.eventId === eventId && t.round === round ? resumeTimer(t) : t,
          ),
        })),

      end: (eventId, round) =>
        set((s) => ({
          timers: s.timers.map((t) =>
            t.eventId === eventId && t.round === round ? endTimer(t) : t,
          ),
        })),

      extend: (eventId, round, minutes, reason, by) =>
        set((s) => ({
          timers: s.timers.map((t) =>
            t.eventId === eventId && t.round === round
              ? extendTimer(t, minutes, reason, by)
              : t,
          ),
        })),

      /* ---- Pairings ---------------------------------------------------- */

      generatePairings: (eventId, round, registrationIds) => {
        // Top half against bottom half, mirroring the seeded first-round fold.
        const half = Math.floor(registrationIds.length / 2);
        const pairings: TablePairing[] = [];
        for (let i = 0; i < half; i++) {
          pairings.push({
            eventId,
            round,
            board: i + 1,
            playerAId: registrationIds[i],
            playerBId: registrationIds[i + half],
          });
        }
        set((s) => ({
          pairings: [...s.pairings.filter((p) => !(p.eventId === eventId && p.round === round)), ...pairings],
        }));
      },

      boardFor: (eventId, registrationId) => {
        const round = get().currentRound(eventId);
        const p = get().pairings.find(
          (x) =>
            x.eventId === eventId &&
            x.round === round &&
            (x.playerAId === registrationId || x.playerBId === registrationId),
        );
        return p?.board;
      },

      opponentFor: (eventId, registrationId, registrations) => {
        const round = get().currentRound(eventId);
        const p = get().pairings.find(
          (x) =>
            x.eventId === eventId &&
            x.round === round &&
            (x.playerAId === registrationId || x.playerBId === registrationId),
        );
        if (!p) return undefined;
        const oppId = p.playerAId === registrationId ? p.playerBId : p.playerAId;
        return registrations.find((r) => r.id === oppId);
      },

      /* ---- Results ------------------------------------------------------ */

      submitResult: (eventId, round, board, byId, myScore, theirScore) => {
        const existing = get().submissions.filter(
          (s) => s.eventId === eventId && s.round === round && s.board === board,
        );

        // A second submission for the same board must agree, or it is disputed.
        const opponentSub = existing.find((s) => s.byId !== byId);
        const agrees =
          !opponentSub ||
          (opponentSub.myScore === theirScore && opponentSub.theirScore === myScore);

        const submission: ResultSubmission = {
          id: `sub-${uid()}`,
          eventId,
          round,
          board,
          byId,
          myScore,
          theirScore,
          at: now(),
          confirmed: !!opponentSub && agrees,
          disputed: !!opponentSub && !agrees,
        };

        set((s) => ({
          submissions: [
            ...s.submissions.map((x) =>
              opponentSub && x.id === opponentSub.id
                ? { ...x, confirmed: agrees, disputed: !agrees }
                : x,
            ),
            submission,
          ],
        }));
      },

      submissionFor: (eventId, round, board, byId) =>
        get().submissions.find(
          (s) => s.eventId === eventId && s.round === round && s.board === board && s.byId === byId,
        ),

      confirmResult: (submissionId) =>
        set((s) => ({
          submissions: s.submissions.map((x) =>
            x.id === submissionId ? { ...x, confirmed: true, disputed: false } : x,
          ),
        })),

      progressFor: (eventId, round) => {
        const boards = get().pairings.filter((p) => p.eventId === eventId && p.round === round);
        const subs = get().submissions.filter((s) => s.eventId === eventId && s.round === round);

        const byBoard = new Map<number, ResultSubmission[]>();
        for (const s of subs) byBoard.set(s.board, [...(byBoard.get(s.board) ?? []), s]);

        let verified = 0;
        let awaiting = 0;
        let conflicts = 0;
        for (const [, list] of byBoard) {
          if (list.some((s) => s.disputed)) conflicts += 1;
          else if (list.some((s) => s.confirmed)) verified += 1;
          else awaiting += 1;
        }

        return roundProgress({
          totalBoards: boards.length,
          submitted: byBoard.size,
          verified,
          awaitingConfirmation: awaiting,
          conflicts,
        });
      },

      resetLive: () => set({ ...fresh(), hydrated: true }),
    }),
    {
      name: LIVE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s as LiveStore;
        void hydrated;
        return rest as unknown as LiveStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
