/**
 * One event, read on the server.
 *
 * The public pages resolve their event in the browser, which is right for the page body —
 * it re-reads, it subscribes, it reacts to a director changing something mid-event. But a
 * tab title, a Google result and a WhatsApp link preview are all built from the server's
 * first response, before any JavaScript runs, and the server was resolving the slug against
 * a seed file that names exactly one event.
 *
 * So every event created since — every event a director will ever create — served a title
 * of "Event not found" and a `noindex` instruction, while the page underneath rendered the
 * event perfectly. The page worked and the link looked broken, which is the worse half to
 * get wrong: it is the half somebody sees before deciding whether to click.
 *
 * Deliberately not the browser client from `client.ts`: that module is "use client" and
 * carries a React-shaped connection this has no use for. A single anonymous read over the
 * REST endpoint is the whole requirement.
 */

import type { EventDetails, StoredEvent } from "./events";

/** Long enough not to re-read on every crawl, short enough that an edit shows up. */
const REVALIDATE_SECONDS = 60;

function credentials(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  /* Both names, for the same reason the browser client accepts both. */
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
}

/**
 * Reads a public event by slug, or null.
 *
 * Null for every failure — no credentials, no network, no such event — because the only
 * caller is metadata, and metadata that throws takes the page down with it. A missing
 * title is a bad preview; a thrown error is no page at all.
 */
export async function readEventForMetadata(slug: string): Promise<StoredEvent | null> {
  const creds = credentials();
  if (!creds || !slug) return null;

  try {
    const response = await fetch(`${creds.url}/rest/v1/rpc/public_event_by_slug`, {
      method: "POST",
      headers: {
        apikey: creds.key,
        Authorization: `Bearer ${creds.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) return null;

    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const row = rows[0] as Record<string, unknown>;
    return {
      id: String(row.out_id ?? ""),
      slug: String(row.out_slug ?? ""),
      name: String(row.out_name ?? ""),
      subtitle: (row.out_subtitle as string | null) ?? null,
      state: String(row.out_state ?? "draft"),
      visibility: "public",
      status: "active",
      details: (row.out_data ?? {}) as EventDetails,
      createdAt: "",
    };
  } catch {
    return null;
  }
}
