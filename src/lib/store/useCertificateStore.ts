"use client";

/**
 * Certificates issued for an event.
 *
 * Revocation never deletes: a certificate that was handed out and later
 * withdrawn must still resolve when someone scans it, and must say it was
 * withdrawn rather than going silent.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  canIssue,
  Certificate,
  CertificateKind,
  generateCertificateCode,
  planBulkIssue,
  verifyCertificate,
  VerificationResult,
} from "../engine/certificates";
import {
  buildCitation,
  PerformanceRecord,
  tierFor,
  titlesFor,
} from "../engine/citations";

export const CERTIFICATE_STORAGE_KEY = "bluffy-certificates-v1";

export interface IssueContext {
  resultsFinal: boolean;
  outstandingDisputes: number;
}

interface CertificateState {
  hydrated: boolean;
  certificates: Certificate[];
}

interface CertificateActions {
  /** Prepares a draft certificate. Issuing is a separate, deliberate step. */
  prepare: (
    draft: Omit<Certificate, "id" | "code" | "status" | "issuedAt" | "issuedBy">,
  ) => Certificate;

  issue: (id: string, by: string, ctx: IssueContext) => { ok: boolean; reason: string };
  issueAll: (
    eventId: string,
    by: string,
    ctx: IssueContext,
  ) => { issued: number; blocked: { name: string; reason: string }[] };

  revoke: (id: string, by: string, reason: string) => { ok: boolean; reason: string };
  remove: (id: string) => void;

  certificatesFor: (eventId: string) => Certificate[];
  verify: (code: string) => VerificationResult;

  /** Prepares participation certificates for everyone not already covered. */
  prepareParticipation: (
    eventId: string,
    people: { id: string; name: string; division?: string }[],
  ) => number;

  /**
   * Prepares a full set from final standings: podium certificates with derived
   * citations, and a personalised participation certificate for everyone else.
   */
  prepareFromStandings: (
    eventId: string,
    records: PerformanceRecord[],
  ) => { winners: number; participation: number; skipped: number };

  resetCertificates: () => void;
}

export type CertificateStore = CertificateState & CertificateActions;

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

const fresh = (): CertificateState => ({ hydrated: false, certificates: [] });

export const useCertificateStore = create<CertificateStore>()(
  persist(
    (set, get) => ({
      ...fresh(),

      prepare: (draft) => {
        const certificate: Certificate = {
          ...draft,
          id: `cert-${uid()}`,
          code: generateCertificateCode(),
          status: "draft",
        };
        set((s) => ({ certificates: [...s.certificates, certificate] }));
        return certificate;
      },

      issue: (id, by, ctx) => {
        const c = get().certificates.find((x) => x.id === id);
        if (!c) return { ok: false, reason: "That certificate no longer exists." };

        const check = canIssue(c, ctx);
        if (!check.ready) return { ok: false, reason: check.reason };

        set((s) => ({
          certificates: s.certificates.map((x) =>
            x.id === id ? { ...x, status: "issued", issuedAt: now(), issuedBy: by } : x,
          ),
        }));
        return { ok: true, reason: check.reason };
      },

      issueAll: (eventId, by, ctx) => {
        const plan = planBulkIssue(get().certificatesFor(eventId), ctx);
        const ids = new Set(plan.issuable.map((c) => c.id));
        const at = now();

        set((s) => ({
          certificates: s.certificates.map((x) =>
            ids.has(x.id) ? { ...x, status: "issued", issuedAt: at, issuedBy: by } : x,
          ),
        }));

        return {
          issued: ids.size,
          blocked: plan.blocked.map((b) => ({
            name: `${b.certificate.recipientName} — ${b.certificate.statement}`,
            reason: b.reason,
          })),
        };
      },

      revoke: (id, by, reason) => {
        if (!reason.trim())
          return { ok: false, reason: "A reason is required to withdraw a certificate." };

        const c = get().certificates.find((x) => x.id === id);
        if (!c) return { ok: false, reason: "That certificate no longer exists." };

        set((s) => ({
          certificates: s.certificates.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "revoked",
                  revokedAt: now(),
                  revokedBy: by,
                  revokedReason: reason.trim(),
                }
              : x,
          ),
        }));
        return { ok: true, reason: "Certificate withdrawn." };
      },

      remove: (id) => set((s) => ({ certificates: s.certificates.filter((c) => c.id !== id) })),

      certificatesFor: (eventId) => get().certificates.filter((c) => c.eventId === eventId),

      verify: (code) => verifyCertificate(get().certificates, code),

      prepareParticipation: (eventId, people) => {
        const existing = new Set(
          get()
            .certificates.filter((c) => c.eventId === eventId && c.kind === "participation")
            .map((c) => c.recipientId),
        );
        const missing = people.filter((p) => !existing.has(p.id));
        if (!missing.length) return 0;

        const prepared: Certificate[] = missing.map((p) => ({
          id: `cert-${uid()}`,
          eventId,
          code: generateCertificateCode(),
          kind: "participation" as CertificateKind,
          recipientId: p.id,
          recipientName: p.name,
          division: p.division,
          statement: "Participated in the tournament",
          status: "draft",
        }));

        set((s) => ({ certificates: [...s.certificates, ...prepared] }));
        return prepared.length;
      },

      prepareFromStandings: (eventId, records) => {
        const existing = new Set(
          get()
            .certificates.filter((c) => c.eventId === eventId)
            .map((c) => `${c.recipientId}:${c.kind}`),
        );

        const prepared: Certificate[] = [];
        let winners = 0;
        let participation = 0;
        let skipped = 0;

        for (const record of records) {
          const tier = tierFor(record);
          const kind: CertificateKind =
            tier === "champion"
              ? "champion"
              : tier === "runner-up"
                ? "runner-up"
                : tier === "third"
                  ? "third"
                  : "participation";

          if (existing.has(`${record.playerId}:${kind}`)) {
            skipped += 1;
            continue;
          }

          const citation = buildCitation(record, tier);
          // Wording comes from the record. A podium certificate states the
          // placing; everyone else gets the title their own figures earned.
          const statement =
            kind === "participation"
              ? titlesFor(record)[0].title
              : `${record.rank === 1 ? "1st" : record.rank === 2 ? "2nd" : "3rd"} place, ${record.division} division`;

          prepared.push({
            id: `cert-${uid()}`,
            eventId,
            code: generateCertificateCode(),
            kind,
            recipientId: record.playerId,
            recipientName: record.playerName,
            division: record.division,
            statement,
            detail: citation.text,
            status: "draft",
          });

          if (kind === "participation") participation += 1;
          else winners += 1;
        }

        if (prepared.length)
          set((s) => ({ certificates: [...s.certificates, ...prepared] }));

        return { winners, participation, skipped };
      },

      resetCertificates: () => set({ ...fresh(), hydrated: true }),
    }),
    {
      name: CERTIFICATE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s as CertificateStore;
        void hydrated;
        return rest as unknown as CertificateStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
