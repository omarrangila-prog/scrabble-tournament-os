"use client";

import { ACTIVE_EVENT } from "@/lib/domain/eventSeed";
import {
  awardFor,
  type FinalPlayer,
  superlatives,
} from "@/lib/domain/finalResults";
import { generateCertificateCode, verificationUrl } from "@/lib/engine/certificates";
import { emailCertificate } from "@/lib/email/client";
import { issueCertificate, saveCertificate } from "./certificates";
import { supabase } from "./client";

/**
 * Closing the tournament: the standings, then a certificate for everybody, then the email.
 *
 * One button, because at the end of a long day the difference between one press and three is
 * whether the last step happens at all.
 *
 * Nothing here decides anything. Placings come from verified games through
 * `event_final_summary`, which ranks by the same rule the wall uses, and every title is
 * arithmetic — see `finalResults`. The organizer presses the button; the tournament has
 * already decided.
 */

export interface CeremonyLine {
  name: string;
  number: string;
  title: string;
  code: string;
  emailed: boolean;
  problem: string | null;
}

export interface CeremonyReport {
  players: FinalPlayer[];
  lines: CeremonyLine[];
  issued: number;
  emailed: number;
  failed: number;
}

/** The final table, ranked. Read on its own so the organizer can look before pressing. */
export async function finalSummary(eventId: string): Promise<FinalPlayer[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_final_summary", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.out_id),
    number: String(r.out_number ?? ""),
    name: String(r.out_name ?? ""),
    email: String(r.out_email ?? ""),
    division: String(r.out_division ?? ""),
    rank: Number(r.out_rank ?? 0),
    played: Number(r.out_played ?? 0),
    wins: Number(r.out_wins ?? 0),
    losses: Number(r.out_losses ?? 0),
    draws: Number(r.out_draws ?? 0),
    spread: Number(r.out_spread ?? 0),
    bestScore: r.out_best_score === null ? null : Number(r.out_best_score),
    bestMargin: r.out_best_margin === null ? null : Number(r.out_best_margin),
    bestAgainst: (r.out_best_against as string | null) ?? null,
  }));
}

/**
 * Issues and sends, one person at a time.
 *
 * Sequential rather than in parallel: sixty-eight simultaneous sends is how a free mail plan
 * starts refusing, and a refusal in the middle of a ceremony is worse than it taking a minute.
 * Every outcome is reported by name, so an address that bounces is visible rather than
 * averaged into a total.
 *
 * A certificate is saved and issued before the email goes, so the verification code in
 * somebody's inbox always resolves. The other order produces mail nobody can check.
 */
export async function closeTournament(
  eventId: string,
  by: string,
  origin: string,
  onProgress?: (done: number, total: number) => void,
): Promise<CeremonyReport> {
  const players = await finalSummary(eventId);
  const sup = superlatives(players);
  const lines: CeremonyLine[] = [];

  for (const [i, p] of players.entries()) {
    const award = awardFor(p, players, sup);
    const code = generateCertificateCode();
    let problem: string | null = null;
    let emailed = false;

    const saved = await saveCertificate({
      eventId,
      code,
      kind: award.kind,
      recipientId: p.id,
      recipientName: p.name,
      division: p.division,
      statement: award.title,
      detail: award.summary,
      personalNote: award.note ?? "",
    });

    if (!saved.ok) {
      problem = saved.message ?? "Could not save the certificate.";
    } else {
      const issue = await issueCertificate(code, by);
      if (!issue.ok) {
        problem = issue.message ?? "Could not issue the certificate.";
      } else if (!p.email) {
        problem = "No email address on file.";
      } else {
        const sent = await emailCertificate({
          to: p.email,
          recipientName: p.name,
          statement: award.title,
          detail: award.summary,
          personalNote: award.note ?? undefined,
          code,
          eventName: ACTIVE_EVENT.name,
          eventDate: "23 August 2026",
          verifyUrl: verificationUrl(origin, code),
        });
        emailed = sent.ok;
        if (!sent.ok) problem = sent.message ?? "The email did not send.";
      }
    }

    lines.push({ name: p.name, number: p.number, title: award.title, code, emailed, problem });
    onProgress?.(i + 1, players.length);
  }

  return {
    players,
    lines,
    issued: lines.filter((l) => !l.problem || l.emailed).length,
    emailed: lines.filter((l) => l.emailed).length,
    failed: lines.filter((l) => l.problem && !l.emailed).length,
  };
}
