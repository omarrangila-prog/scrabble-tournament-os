/**
 * Which certificates a browser claims to have issued that the record does not confirm.
 *
 * The studio composes certificates locally and issues them to the database. Those two
 * places can disagree — a certificate issued before the database held certificates at
 * all, or one whose write failed. When they disagree the paper is what loses: it carries
 * a code and a QR that resolve to "no certificate matches that code" for the person
 * holding it.
 *
 * Nobody would find that out by looking at the studio, which shows the certificate as
 * issued. So the disagreement has to be computed and shown.
 */

export interface IssuedLocally {
  code: string;
  status: string;
}

/**
 * Certificates marked issued here but not issued in the database.
 *
 * Codes are compared case-insensitively and trimmed, the same way the verification
 * lookup compares them — otherwise a stray space would report a working certificate as
 * broken, and send the director to re-issue something that was never wrong.
 */
export function unverifiableCertificates<T extends IssuedLocally>(
  local: T[],
  issuedInDatabase: Set<string>,
): T[] {
  const normalised = new Set([...issuedInDatabase].map(normaliseCode));
  return local.filter((c) => c.status === "issued" && !normalised.has(normaliseCode(c.code)));
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}
