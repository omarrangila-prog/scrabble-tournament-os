"use client";

/**
 * Uploading and reading back a payment proof.
 *
 * The file goes into a private bucket. An anonymous registrant may write to it and may not
 * read it, list it or overwrite anything in it — see `0084_payment_proof_uploads.sql`, where
 * the rules are enforced. A bank screenshot carries an account title, a number and an amount,
 * so "private" here means private from everybody except the staff who have to check it.
 *
 * Nothing throws. A registration form that crashes loses whatever was typed, and this runs at
 * the end of a form somebody has just spent two minutes filling in.
 */

import { proofPathFor, checkProofFile } from "@/lib/domain/paymentProof";

import { supabase } from "./client";

export const PAYMENT_PROOF_BUCKET = "payment-proofs";

/** What the registration stores about the file, once it is safely in the bucket. */
export interface StoredProof {
  /** Where it lives in the bucket. The only handle the desk needs. */
  path: string;
  /** What the participant called it, kept so the desk sees a familiar name. */
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export type ProofUpload =
  | { ok: true; proof: StoredProof }
  | { ok: false; message: string };

/** An opaque name for the file, so two people uploading "IMG_2841.jpg" do not collide. */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  /* Older browsers over plain http: still unguessable enough for a bucket nobody may list. */
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Puts one receipt in the bucket.
 *
 * The same check the form already ran is run again here: the form's check is what gives
 * somebody a useful message while they are still looking at the field, and this one is what
 * makes it true for every caller.
 */
export async function uploadPaymentProof(input: {
  eventId: string;
  file: File;
}): Promise<ProofUpload> {
  const db = supabase();
  if (!db) return { ok: false, message: "We cannot take the receipt right now." };

  const allowed = checkProofFile({
    name: input.file.name,
    type: input.file.type,
    size: input.file.size,
  });
  if (!allowed.ok) return { ok: false, message: allowed.message };

  const path = proofPathFor(input.eventId, input.file.name, newId());

  const { error } = await db.storage.from(PAYMENT_PROOF_BUCKET).upload(path, input.file, {
    /*
     * Never replace. The bucket has no update policy either, so this is belt and braces —
     * but stating it here is what makes the intent readable: a receipt that can be swapped
     * after the desk has looked at it is not evidence of anything.
     */
    upsert: false,
    contentType: input.file.type || undefined,
  });

  if (error) {
    /* Never show a participant a storage error verbatim. */
    console.error("uploadPaymentProof", error);
    return {
      ok: false,
      message: "We could not upload that file. Please check your connection and try again.",
    };
  }

  return {
    ok: true,
    proof: {
      path,
      fileName: input.file.name,
      contentType: input.file.type || "",
      size: input.file.size,
      uploadedAt: new Date().toISOString(),
    },
  };
}

/**
 * A link the desk can open, good for an hour.
 *
 * Signed rather than public: the bucket is private, and the alternative — making it public so
 * a plain URL works — would put every participant's bank details one guessed path away.
 * Returns null when the caller has no staff session, because that is what the storage policy
 * decides and the browser must not pretend otherwise.
 */
export async function paymentProofUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const db = supabase();
  if (!db || !path) return null;

  const { data, error } = await db.storage
    .from(PAYMENT_PROOF_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error("paymentProofUrl", error);
    return null;
  }
  return data.signedUrl;
}

/** Opens the receipt in a new tab, or says why it could not. Used by the desk screens. */
export async function openPaymentProof(path: string): Promise<{ ok: boolean; message?: string }> {
  const url = await paymentProofUrl(path);
  if (!url)
    return {
      ok: false,
      message: "That receipt could not be opened. Sign in again, or ask the director.",
    };

  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true };
}
