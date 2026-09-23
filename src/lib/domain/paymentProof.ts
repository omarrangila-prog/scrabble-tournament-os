/**
 * The receipt somebody uploads when they say they have paid online.
 *
 * Until now the form recorded `receiptFileName` — the *name* of a file that went nowhere.
 * The desk had "IMG_2841.jpg" and no image, so every online payment was settled by asking
 * the participant to send the screenshot again on WhatsApp. The rules for what may be
 * uploaded live here rather than in the form, because the same rules have to hold on the
 * upload path and in any test of it, and a check that exists only in JSX is a check that
 * exists only while that JSX is on screen.
 */

/** How the participant said they would pay. */
export type PaymentChoice = "online" | "cash" | "complimentary";

/**
 * What the file picker offers, and what the bucket accepts.
 *
 * `image/jpg` is not a real media type, but some Android pickers send it. Listing it costs
 * nothing and refusing it would reject a perfectly good photograph of a bank slip.
 */
export const PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "application/pdf",
] as const;

/** The extensions those types arrive under, for a browser that reports no type at all. */
export const PROOF_EXTENSIONS = ["jpg", "jpeg", "png", "pdf"] as const;

/** The `accept` attribute for the file input. */
export const PROOF_ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

/**
 * Ten megabytes.
 *
 * A phone screenshot is well under one, and a one-page bank PDF under two. The limit is
 * there so a video picked by mistake fails in seconds on venue wifi rather than holding a
 * form open for minutes and then failing anyway. The bucket enforces the same number, so a
 * caller that skips this check still cannot get a large file in.
 */
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

/** Whether a payment proof has to be attached before this registration may be submitted. */
export function proofRequired(choice: PaymentChoice | null): boolean {
  return choice === "online";
}

/** The extension of a file name, lowercased, or "" when it has none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export type ProofCheck = { ok: true } | { ok: false; message: string };

/**
 * Whether this file may be uploaded, and what to tell somebody when it may not.
 *
 * The type is checked first and the extension second, because the type is what the storage
 * service will judge it on — but a browser that reports nothing (a file shared from another
 * app, or an older Android picker) must not be turned away for a file that is plainly a
 * JPEG. An empty file is refused separately: zero bytes uploads happily and shows the desk
 * a blank page, which is worse than a refusal.
 */
export function checkProofFile(file: { name: string; type: string; size: number }): ProofCheck {
  const type = (file.type ?? "").trim().toLowerCase();
  const extension = extensionOf(file.name ?? "");

  const typeKnown = (PROOF_MIME_TYPES as readonly string[]).includes(type);
  const extensionKnown = (PROOF_EXTENSIONS as readonly string[]).includes(extension);

  if (type !== "" ? !typeKnown : !extensionKnown)
    return { ok: false, message: "Please upload a JPG, PNG or PDF." };

  if (file.size <= 0)
    return { ok: false, message: "That file is empty. Please choose the screenshot again." };

  if (file.size > PROOF_MAX_BYTES)
    return {
      ok: false,
      message: `That file is ${megabytes(file.size)} MB. Please upload one under ${PROOF_MAX_BYTES / (1024 * 1024)} MB.`,
    };

  return { ok: true };
}

/** "1.4", for a message somebody reads. */
export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Where the file is stored.
 *
 * Grouped by event so an organiser's files stay together, and named by an opaque id rather
 * than by the participant. Two people uploading "IMG_2841.jpg" must not collide, and the
 * bucket refuses an overwrite — so a predictable name would mean the second person's upload
 * simply failed. The extension is carried because it is what makes the file open in a
 * viewer when the desk downloads it.
 *
 * The participant's own name never appears in the path: the path travels in a signed URL,
 * and a URL that says who paid what is a small leak with no upside.
 */
export function proofPathFor(eventId: string, fileName: string, id: string): string {
  /*
   * Letters, digits, dash and underscore only — a dot is deliberately not allowed, so a
   * contrived event id cannot produce a ".." segment in an object key.
   */
  const safeEvent = (eventId || "event").replace(/[^a-zA-Z0-9_-]+/g, "-") || "event";
  const extension = extensionOf(fileName);
  const suffix = (PROOF_EXTENSIONS as readonly string[]).includes(extension) ? `.${extension}` : "";
  return `${safeEvent}/${id}${suffix}`;
}
