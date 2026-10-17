/**
 * Small things about a source address that both the screen and the sync loop need.
 */

/**
 * The address to actually fetch.
 *
 * A published Google Sheet is the most likely thing to be pasted here, and its normal address
 * is the editor page — HTML full of script, with no table in it. The export address returns the
 * data itself, so a pasted editor link is quietly turned into one.
 */
export function normalizeSourceUrl(raw: string): string {
  const text = raw.trim();
  const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/[^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/.exec(text);
  if (!m) return text;

  const gid = /(?:^|[&])gid=(\d+)/.exec(m[2] ?? "")?.[1] ?? /gid=(\d+)/.exec(m[3] ?? "")?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

/** A short digest of a body of text, so "nothing has changed" is a comparison and not a diff. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(16)}`;
}

/** "in 30s", "in 4m", "now" — when the next automatic check is due. */
export function untilNext(lastAttemptMs: number | null, intervalSeconds: number, nowMs: number): string | null {
  if (intervalSeconds <= 0) return null;
  if (lastAttemptMs === null) return "now";
  const left = Math.ceil((lastAttemptMs + intervalSeconds * 1000 - nowMs) / 1000);
  if (left <= 0) return "now";
  return left < 90 ? `in ${left}s` : `in ${Math.round(left / 60)}m`;
}
