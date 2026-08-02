"use client";

/**
 * Campaigns and rewards.
 *
 * Campaigns are commercial and affect what a player pays. Rewards are
 * honorary and affect nothing but the certificate and the prize list. Neither
 * writes to game results — standings stay derived from verified scores.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Campaign,
  CampaignStatus,
  checkEligibility,
  Eligibility,
  findByCode,
  Reward,
  RewardKind,
} from "../engine/promotions";

export const PROMOTION_STORAGE_KEY = "bluffy-promotions-v1";

interface PromotionState {
  hydrated: boolean;
  campaigns: Campaign[];
  rewards: Reward[];
  seeded: boolean;
}

interface PromotionActions {
  addCampaign: (draft: Omit<Campaign, "id" | "redemptions">) => void;
  updateCampaign: (id: string, patch: Partial<Omit<Campaign, "id" | "eventId">>) => void;
  setCampaignStatus: (id: string, status: CampaignStatus) => void;
  removeCampaign: (id: string) => void;
  /** Records a use of the code. Refuses when the campaign is not eligible. */
  redeem: (id: string, at?: string, groupSize?: number) => Eligibility;
  validateCode: (eventId: string, code: string, at?: string, groupSize?: number)
    => { campaign?: Campaign } & Eligibility;

  addReward: (draft: Omit<Reward, "id">) => void;
  awardReward: (
    id: string,
    recipientId: string,
    recipientName: string,
    citation: string,
    awardedBy: string,
  ) => void;
  clearReward: (id: string) => void;
  removeReward: (id: string) => void;

  campaignsFor: (eventId: string) => Campaign[];
  rewardsFor: (eventId: string) => Reward[];

  seedDemo: (eventId: string) => void;
  resetPromotions: () => void;
}

export type PromotionStore = PromotionState & PromotionActions;

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

const fresh = (): PromotionState => ({
  hydrated: false,
  campaigns: [],
  rewards: [],
  seeded: false,
});

const DEMO_CAMPAIGNS: Omit<Campaign, "id" | "eventId">[] = [
  {
    name: "Early bird",
    kind: "early-bird",
    status: "ended",
    percentOff: 20,
    amountOff: 0,
    code: "EARLY20",
    cap: 40,
    redemptions: 40,
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2026-07-15T00:00:00.000Z",
    notes: "Closed on schedule after reaching its cap.",
  },
  {
    name: "School group of four",
    kind: "group",
    status: "active",
    percentOff: 25,
    amountOff: 0,
    code: "SCHOOL4",
    cap: 0,
    redemptions: 18,
    minGroupSize: 4,
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2026-08-20T00:00:00.000Z",
    notes: "Four or more entries from the same school, registered together.",
  },
  {
    name: "Bring a friend",
    kind: "referral",
    status: "active",
    percentOff: 0,
    amountOff: 500,
    code: "FRIEND500",
    cap: 60,
    redemptions: 23,
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-20T00:00:00.000Z",
  },
  {
    name: "First tournament",
    kind: "first-timer",
    status: "active",
    percentOff: 30,
    amountOff: 0,
    code: "FIRST30",
    cap: 25,
    redemptions: 11,
    startsAt: "2026-06-15T00:00:00.000Z",
    endsAt: "2026-08-20T00:00:00.000Z",
    notes: "For players with no previous rated event.",
  },
  {
    name: "Returning champion",
    kind: "returning",
    status: "paused",
    percentOff: 15,
    amountOff: 0,
    code: "AGAIN15",
    cap: 0,
    redemptions: 6,
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2026-08-20T00:00:00.000Z",
    notes: "Paused while the returning-player list is confirmed.",
  },
];

const DEMO_REWARDS: { kind: RewardKind; title: string; prizeValue: number }[] = [
  { kind: "highest-word", title: "Highest word of the tournament", prizeValue: 10000 },
  { kind: "biggest-upset", title: "Biggest upset", prizeValue: 7500 },
  { kind: "best-newcomer", title: "Best newcomer", prizeValue: 7500 },
  { kind: "most-improved", title: "Most improved", prizeValue: 5000 },
  { kind: "sporting-conduct", title: "Sporting conduct", prizeValue: 5000 },
  { kind: "perfect-attendance", title: "Every round played", prizeValue: 0 },
];

export const usePromotionStore = create<PromotionStore>()(
  persist(
    (set, get) => ({
      ...fresh(),

      /* ---- Campaigns -------------------------------------------------- */

      addCampaign: (draft) =>
        set((s) => ({
          campaigns: [...s.campaigns, { ...draft, id: `camp-${uid()}`, redemptions: 0 }],
        })),

      updateCampaign: (id, patch) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      setCampaignStatus: (id, status) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, status } : c)),
        })),

      removeCampaign: (id) => set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) })),

      redeem: (id, at = now(), groupSize) => {
        const campaign = get().campaigns.find((c) => c.id === id);
        if (!campaign) return { eligible: false, reason: "That code no longer exists." };

        const check = checkEligibility(campaign, { at, groupSize });
        if (!check.eligible) return check;

        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, redemptions: c.redemptions + 1 } : c,
          ),
        }));
        return check;
      },

      validateCode: (eventId, code, at = now(), groupSize) => {
        const campaign = findByCode(get().campaignsFor(eventId), code);
        if (!campaign) return { eligible: false, reason: "We do not recognise that code." };
        return { campaign, ...checkEligibility(campaign, { at, groupSize }) };
      },

      /* ---- Rewards ------------------------------------------------------ */

      addReward: (draft) => set((s) => ({ rewards: [...s.rewards, { ...draft, id: `rew-${uid()}` }] })),

      awardReward: (id, recipientId, recipientName, citation, awardedBy) =>
        set((s) => ({
          rewards: s.rewards.map((r) =>
            r.id === id
              ? {
                  ...r,
                  recipientId,
                  recipientName,
                  citation: citation.trim(),
                  awardedBy,
                  awardedAt: now(),
                }
              : r,
          ),
        })),

      clearReward: (id) =>
        set((s) => ({
          rewards: s.rewards.map((r) =>
            r.id === id
              ? {
                  ...r,
                  recipientId: undefined,
                  recipientName: undefined,
                  citation: "",
                  awardedBy: undefined,
                  awardedAt: undefined,
                }
              : r,
          ),
        })),

      removeReward: (id) => set((s) => ({ rewards: s.rewards.filter((r) => r.id !== id) })),

      campaignsFor: (eventId) => get().campaigns.filter((c) => c.eventId === eventId),
      rewardsFor: (eventId) => get().rewards.filter((r) => r.eventId === eventId),

      seedDemo: (eventId) =>
        set((s) => {
          if (s.seeded) return s;
          return {
            seeded: true,
            campaigns: DEMO_CAMPAIGNS.map((c, i) => ({ ...c, id: `camp-seed-${i}`, eventId })),
            rewards: DEMO_REWARDS.map((r, i) => ({
              ...r,
              id: `rew-seed-${i}`,
              eventId,
              citation: "",
            })),
          };
        }),

      resetPromotions: () => set({ ...fresh(), hydrated: true }),
    }),
    {
      name: PROMOTION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s as PromotionStore;
        void hydrated;
        return rest as unknown as PromotionStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
