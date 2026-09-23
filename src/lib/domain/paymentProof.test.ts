import { describe, expect, it } from "vitest";

import {
  checkProofFile,
  extensionOf,
  PROOF_MAX_BYTES,
  proofPathFor,
  proofRequired,
} from "./paymentProof";

/**
 * The receipt rules.
 *
 * These decide whether somebody can finish a registration, so each case here is a thing that
 * actually reaches the form: a phone that reports no media type, a PDF from a banking app, a
 * video picked by mistake, two people uploading a file with the same name.
 */

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "receipt.jpg",
  type: "image/jpeg",
  size: 240_000,
  ...over,
});

describe("proofRequired", () => {
  it("is required for an online payment and nothing else", () => {
    expect(proofRequired("online")).toBe(true);
    expect(proofRequired("cash")).toBe(false);
    expect(proofRequired("complimentary")).toBe(false);
    /* Nothing chosen yet is not a demand for a receipt — the payment question asks first. */
    expect(proofRequired(null)).toBe(false);
  });
});

describe("checkProofFile", () => {
  it("accepts a JPEG, a PNG and a PDF", () => {
    expect(checkProofFile(file({ type: "image/jpeg" })).ok).toBe(true);
    expect(checkProofFile(file({ name: "r.png", type: "image/png" })).ok).toBe(true);
    expect(checkProofFile(file({ name: "r.pdf", type: "application/pdf" })).ok).toBe(true);
  });

  it("accepts the type an Android picker sends for a JPEG", () => {
    /* image/jpg is not a real media type. Refusing it would refuse a valid photograph. */
    expect(checkProofFile(file({ type: "image/jpg" })).ok).toBe(true);
  });

  it("falls back to the extension when the browser reports no type", () => {
    const blank = file({ type: "" });
    expect(blank.type).toBe("");
    expect(checkProofFile(blank).ok).toBe(true);
    expect(checkProofFile(file({ name: "clip.mov", type: "" })).ok).toBe(false);
  });

  it("refuses a file that is neither", () => {
    const result = checkProofFile(file({ name: "clip.mp4", type: "video/mp4" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/JPG, PNG or PDF/);
  });

  it("refuses an empty file, which uploads happily and shows the desk nothing", () => {
    const empty = file({ size: 0 });
    expect(empty.size).toBe(0);
    const result = checkProofFile(empty);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/empty/i);
  });

  it("refuses a file over the limit and says how big it was", () => {
    const big = file({ size: PROOF_MAX_BYTES + 1 });
    expect(big.size).toBeGreaterThan(PROOF_MAX_BYTES);
    const result = checkProofFile(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/10 MB/);
  });

  it("accepts a file exactly on the limit", () => {
    expect(checkProofFile(file({ size: PROOF_MAX_BYTES })).ok).toBe(true);
  });
});

describe("extensionOf", () => {
  it("reads the last extension, lowercased", () => {
    expect(extensionOf("Receipt.PNG")).toBe("png");
    expect(extensionOf("bank.statement.pdf")).toBe("pdf");
  });

  it("returns nothing when there is none", () => {
    expect(extensionOf("receipt")).toBe("");
    expect(extensionOf("receipt.")).toBe("");
  });
});

describe("proofPathFor", () => {
  it("files the receipt under its event and keeps the extension", () => {
    expect(proofPathFor("evt-alphabattle-cafe-leap", "IMG_2841.JPG", "abc123")).toBe(
      "evt-alphabattle-cafe-leap/abc123.jpg",
    );
  });

  it("never puts the participant's file name in the path", () => {
    /* The path travels in a signed URL. A name in it is a small leak with no upside. */
    const path = proofPathFor("evt-1", "ayesha-khan-transfer.png", "id-1");
    expect(path).not.toMatch(/ayesha/i);
  });

  it("gives two people uploading the same file name different paths", () => {
    const a = proofPathFor("evt-1", "IMG_2841.jpg", "one");
    const b = proofPathFor("evt-1", "IMG_2841.jpg", "two");
    expect(a).not.toBe(b);
  });

  it("drops an extension it does not recognise rather than carrying it into the bucket", () => {
    expect(proofPathFor("evt-1", "receipt.exe", "id-1")).toBe("evt-1/id-1");
  });

  it("keeps a slash out of the event segment", () => {
    expect(proofPathFor("../../etc", "r.png", "id-1")).toBe("-etc/id-1.png");
  });
});
