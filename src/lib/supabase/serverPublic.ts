/**
 * Anonymous reads on the server, for pages and routes that must not be cached.
 *
 * `serverEvent.ts` reads with a one-minute cache, which is right for a page title. A public CSV
 * is the opposite: somebody opens the same link twice a minute apart and expects the second
 * download to contain the person who registered between them. So this asks every time, and says
 * so to the CDN as well as to `fetch`.
 */

import { registrationsFrom, withCategoryNames, type PublicRegistrations } from "@/lib/domain/publicRegistrations";

function credentials(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
}

/**
 * Category id and name, read directly.
 *
 * Not `categoriesFrom` from the client hook module: that file is a client module, and a route
 * handler runs on the server, where calling into one throws. Two fields are all this needs.
 */
function categoryNames(payload: unknown): { id: string; name: string }[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((raw) => {
      const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      return { id: String(r.id ?? "").trim(), name: String(r.name ?? "").trim() };
    })
    .filter((c) => c.id && c.name);
}

/** One database function as an anonymous caller, never cached. Null on any failure. */
export async function anonRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const creds = credentials();
  if (!creds) return null;

  try {
    const response = await fetch(`${creds.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: creds.key,
        Authorization: `Bearer ${creds.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * The public registration list for an event, as it is right now.
 *
 * Null when there is no such public event, or the organiser has switched the list off — the two
 * are deliberately indistinguishable from outside, so the link does not confirm that an event
 * exists to somebody who should not know.
 */
export async function readPublicRegistrations(slug: string): Promise<PublicRegistrations | null> {
  const feed = registrationsFrom(await anonRpc("public_registrations", { p_slug: slug }));
  if (!feed) return null;

  const categories = categoryNames(await anonRpc("event_categories", { p_event_id: feed.eventId }));
  return withCategoryNames(feed, categories);
}
