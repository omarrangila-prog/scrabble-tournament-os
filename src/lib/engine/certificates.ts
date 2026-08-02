/**
 * Certificates and their verification.
 *
 * A certificate is a claim about what someone achieved. Anyone holding one can
 * present it years later, so two properties matter more than appearance:
 *
 * 1. **It must be checkable.** Every certificate carries a verification code
 *    that resolves to the issuing event and the recorded placement. A picture
 *    of a certificate proves nothing; the code is what proves it.
 * 2. **It must be revocable.** Certificates are issued from provisional
 *    standings and sometimes from mistakes. Revocation is recorded with a
 *    reason rather than deleting the record, so a presented certificate that
 *    was withdrawn reads as withdrawn instead of unknown.
 *
 * Verification codes are opaque. They encode nothing about the recipient and
 * cannot be guessed from a name or a placing.
 */

export type CertificateKind =
  | "champion"
  | "runner-up"
  | "third"
  | "division-winner"
  | "participation"
  | "award"
  | "official";

export const CERTIFICATE_KIND_LABEL: Record<CertificateKind, string> = {
  champion: "Champion",
  "runner-up": "Runner-up",
  third: "Third place",
  "division-winner": "Division winner",
  participation: "Participation",
  award: "Special award",
  official: "Official recognition",
};

export type CertificateStatus = "draft" | "issued" | "revoked";

export interface Certificate {
  id: string;
  eventId: string;
  /** Opaque, human-readable verification code printed on the certificate. */
  code: string;

  kind: CertificateKind;
  recipientId: string;
  recipientName: string;
  /** Division or category the placement belongs to. */
  division?: string;

  /** The claim being certified, e.g. "1st place, Masters division". */
  statement: string;
  /** Supporting detail, e.g. "8 wins from 9, spread +1,204". */
  detail?: string;

  status: CertificateStatus;
  issuedAt?: string;
  issuedBy?: string;

  revokedAt?: string;
  revokedBy?: string;
  /** Required to revoke — a withdrawal with no stated reason is not usable. */
  revokedReason?: string;
}

/* -------------------------------------------------------------------------- */
/* Verification codes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Alphabet excluding characters people confuse when reading a printed code
 * aloud or typing it back: 0/O, 1/I/L.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generates an opaque verification code, grouped for legibility.
 *
 * Uses the platform CSPRNG. A predictable code would let anyone mint a
 * plausible-looking certificate reference.
 */
export function generateCertificateCode(groups = 3, groupLength = 4): string {
  const total = groups * groupLength;
  const bytes = new Uint8Array(total);

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Node without webcrypto: fail loudly rather than emit guessable codes.
    throw new Error("A secure random source is required to generate certificate codes.");
  }

  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  const out: string[] = [];
  for (let i = 0; i < groups; i++) out.push(chars.slice(i * groupLength, (i + 1) * groupLength).join(""));
  return out.join("-");
}

/** Normalises a code typed by a person: case, spaces, and missing dashes. */
export function normaliseCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return "";
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += 4) groups.push(raw.slice(i, i + 4));
  return groups.join("-");
}

/* -------------------------------------------------------------------------- */
/* Verification                                                                */
/* -------------------------------------------------------------------------- */

export type VerificationOutcome = "valid" | "revoked" | "not-issued" | "unknown";

export interface VerificationResult {
  outcome: VerificationOutcome;
  /** Plain-language result, safe to show to a stranger holding the paper. */
  message: string;
  certificate?: Certificate;
}

/**
 * Resolves a verification code.
 *
 * Deliberately returns the same shape for every outcome, and never exposes
 * internal ids or the full certificate list. An unknown code is not told
 * whether it is malformed or simply absent — that distinction only helps
 * someone probing for valid codes.
 */
export function verifyCertificate(
  certificates: Certificate[],
  code: string,
): VerificationResult {
  const needle = normaliseCode(code);
  if (!needle) return { outcome: "unknown", message: "Enter a verification code." };

  const found = certificates.find((c) => normaliseCode(c.code) === needle);
  if (!found)
    return {
      outcome: "unknown",
      message: "No certificate matches that code.",
    };

  if (found.status === "revoked")
    return {
      outcome: "revoked",
      message: found.revokedReason
        ? `This certificate was withdrawn: ${found.revokedReason}`
        : "This certificate was withdrawn.",
      certificate: found,
    };

  if (found.status !== "issued")
    return {
      outcome: "not-issued",
      message: "This certificate has been prepared but not yet issued.",
      certificate: found,
    };

  return {
    outcome: "valid",
    message: `Verified: ${found.recipientName} — ${found.statement}`,
    certificate: found,
  };
}

/* -------------------------------------------------------------------------- */
/* Issuing                                                                     */
/* -------------------------------------------------------------------------- */

export interface IssueCheck {
  ready: boolean;
  /** Why it cannot be issued, in words a director can act on. */
  reason: string;
}

/**
 * Whether a certificate may be issued.
 *
 * A certificate asserting a placement that is not yet final is the one thing
 * this module must refuse: paper cannot be recalled once it is handed out.
 */
export function canIssue(
  certificate: Certificate,
  context: { resultsFinal: boolean; outstandingDisputes: number },
): IssueCheck {
  if (certificate.status === "revoked")
    return { ready: false, reason: "This certificate was withdrawn and cannot be reissued." };
  if (certificate.status === "issued")
    return { ready: false, reason: "This certificate has already been issued." };
  if (!certificate.recipientName.trim())
    return { ready: false, reason: "The certificate has no recipient." };
  if (!certificate.statement.trim())
    return { ready: false, reason: "The certificate states no achievement." };

  // Participation does not assert a placing, so it is safe before results close.
  const assertsPlacement = certificate.kind !== "participation";
  if (assertsPlacement && context.outstandingDisputes > 0)
    return {
      ready: false,
      reason: `${context.outstandingDisputes} unresolved dispute${context.outstandingDisputes === 1 ? "" : "s"} could still change the placings.`,
    };
  if (assertsPlacement && !context.resultsFinal)
    return {
      ready: false,
      reason: "Results are not final. Placement certificates would assert an unconfirmed result.",
    };

  return { ready: true, reason: "Ready to issue." };
}

/** Certificates that a bulk issue would actually produce, and those it skips. */
export function planBulkIssue(
  certificates: Certificate[],
  context: { resultsFinal: boolean; outstandingDisputes: number },
): { issuable: Certificate[]; blocked: { certificate: Certificate; reason: string }[] } {
  const issuable: Certificate[] = [];
  const blocked: { certificate: Certificate; reason: string }[] = [];

  for (const c of certificates) {
    const check = canIssue(c, context);
    if (check.ready) issuable.push(c);
    else blocked.push({ certificate: c, reason: check.reason });
  }
  return { issuable, blocked };
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

export interface CertificateSummary {
  total: number;
  issued: number;
  draft: number;
  revoked: number;
  byKind: { kind: CertificateKind; count: number }[];
}

export function certificateSummary(certificates: Certificate[]): CertificateSummary {
  const kinds = new Map<CertificateKind, number>();
  for (const c of certificates) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);

  return {
    total: certificates.length,
    issued: certificates.filter((c) => c.status === "issued").length,
    draft: certificates.filter((c) => c.status === "draft").length,
    revoked: certificates.filter((c) => c.status === "revoked").length,
    byKind: [...kinds.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** The public URL a certificate's QR code points at. */
export function verificationUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/verify/${encodeURIComponent(normaliseCode(code))}`;
}
