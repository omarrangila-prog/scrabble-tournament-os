"use client";

import { supabase } from "./client";

/**
 * Certificates in the database.
 *
 * They lived in browser storage, so the verification page read whatever was in the
 * browser it happened to be open in. A participant scanning the QR on their own
 * certificate was told it did not exist — the code, the QR and the "anyone can check
 * this" promise all resolved to nothing away from the director's laptop.
 */

export interface StoredCertificate {
  code: string;
  kind: string;
  recipientId: string | null;
  recipientName: string;
  division: string | null;
  statement: string;
  detail: string | null;
  personalNote: string | null;
  status: "draft" | "issued" | "revoked";
  issuedAt: string | null;
  issuedBy: string | null;
  revokedReason: string | null;
}

/** What anyone holding a certificate is shown when they check it. */
export interface VerifiedCertificate extends StoredCertificate {
  eventName: string;
  eventDate: string | null;
}

const NEEDS_MIGRATION = "Certificates need migration 0025 applied to the database.";

function missing(error: { message: string }): boolean {
  return error.message.toLowerCase().includes("could not find the function");
}

/**
 * Saves a prepared certificate.
 *
 * Keyed on the code, so preparing twice updates the same certificate rather than issuing
 * a second one to the same person.
 */
export async function saveCertificate(input: {
  eventId: string;
  code: string;
  kind: string;
  recipientId: string | null;
  recipientName: string;
  division?: string;
  statement: string;
  detail?: string;
  personalNote?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_save_certificate", {
    p_event_id: input.eventId,
    p_code: input.code,
    p_kind: input.kind,
    p_recipient_id: input.recipientId,
    p_recipient_name: input.recipientName,
    p_division: input.division ?? "",
    p_statement: input.statement,
    p_detail: input.detail ?? "",
    p_personal_note: input.personalNote ?? "",
  });

  if (error) {
    return { ok: false, message: missing(error) ? NEEDS_MIGRATION : "Could not save the certificate." };
  }
  return { ok: true };
}

/**
 * Issues one, which is the moment it becomes checkable by anyone.
 *
 * Reports "already-issued" rather than silently rewriting the issuer and date, so a
 * second press cannot change who signed a certificate somebody is already holding.
 */
export async function issueCertificate(
  code: string,
  by: string,
): Promise<{ ok: boolean; already?: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_issue_certificate", { p_code: code, p_by: by });

  if (error) {
    if (missing(error)) return { ok: false, message: NEEDS_MIGRATION };
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }
  return { ok: true, already: data === "already-issued" };
}

/** Withdraws one, with the reason a checker is shown. */
export async function revokeCertificate(
  code: string,
  by: string,
  reason: string,
): Promise<{ ok: boolean; message?: string }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_revoke_certificate", {
    p_code: code,
    p_by: by,
    p_reason: reason,
  });

  if (error) {
    if (missing(error)) return { ok: false, message: NEEDS_MIGRATION };
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }
  return { ok: true };
}

function row(r: Record<string, unknown>): StoredCertificate {
  return {
    code: String(r.out_code ?? ""),
    kind: String(r.out_kind ?? "participation"),
    recipientId: (r.out_recipient_id as string | null) ?? null,
    recipientName: String(r.out_recipient_name ?? ""),
    division: (r.out_division as string | null) ?? null,
    statement: String(r.out_statement ?? ""),
    detail: (r.out_detail as string | null) ?? null,
    personalNote: (r.out_personal_note as string | null) ?? null,
    status: (String(r.out_status ?? "draft") as StoredCertificate["status"]),
    issuedAt: (r.out_issued_at as string | null) ?? null,
    issuedBy: (r.out_issued_by as string | null) ?? null,
    revokedReason: (r.out_revoked_reason as string | null) ?? null,
  };
}

/** Every certificate for an event, drafts included. Staff only. */
export async function listCertificates(eventId: string): Promise<StoredCertificate[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("staff_certificates", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map(row);
}

/**
 * One certificate, by the code printed on it. No sign-in.
 *
 * Returns null for an unknown code and for one still in draft: until it is issued there
 * is nothing to confirm, and saying "this exists but is not issued" would leak a decision
 * that has not been made.
 */
export async function verifyCertificate(code: string): Promise<VerifiedCertificate | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("certificate_by_code", { p_code: code });
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const r = data[0] as Record<string, unknown>;
  return {
    ...row(r),
    eventName: String(r.out_event_name ?? ""),
    eventDate: (r.out_event_date as string | null) ?? null,
  };
}
