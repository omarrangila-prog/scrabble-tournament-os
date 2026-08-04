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

      /*
       * No demo campaigns or awards. Five invented promotion codes with
       * redemption counts, and six pre-named awards, used to ship as though an
       * organizer had created them.
       */
      seedDemo: () => set({ seeded: true }),

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
