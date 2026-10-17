import { NextResponse } from "next/server";

import { FetchRefused, safeFetchText } from "@/lib/server/safeFetch";

/**
 * Fetching an outside results page on a staff member's behalf.
 *
 * It exists because a browser cannot do this itself: another site's pages are not readable from
 * ours without that site's permission. The server can read them — which is exactly why it must be
 * guarded twice over. Only signed-in staff with the results capability may ask, checked by asking
 * the database who the caller's session belongs to, and the address itself is held to the rules in
 * `safeFetch`, which keep the server from being pointed at its own network.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Roles that may run results. The same set the database's `can_results` accepts. */
const RESULTS_ROLES = new Set(["director", "results", "scorekeeper", "arbiter"]);

/** A little protection against a loop or a stuck button hammering somebody else's server. */
const RECENT = new Map<string, number[]>();
const LIMIT = 20;
const WINDOW_MS = 60_000;

function allowed(token: string): boolean {
  const now = Date.now();
  const recent = (RECENT.get(token) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  RECENT.set(token, recent);
  if (RECENT.size > 500) RECENT.clear();
  return true;
}

async function callerRole(token: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!base || !key) return null;

  try {
    const response = await fetch(`${base}/rest/v1/rpc/staff_role`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ org: "org-federation" }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const role: unknown = await response.json();
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() ?? "";
  if (!token) return NextResponse.json({ ok: false, error: "Sign in to import." }, { status: 401 });

  const role = await callerRole(token);
  if (!role || !RESULTS_ROLES.has(role))
    return NextResponse.json({ ok: false, error: "Your account cannot import results." }, { status: 403 });

  if (!allowed(token))
    return NextResponse.json({ ok: false, error: "Too many requests. Wait a minute and try again." }, { status: 429 });

  let url = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url : "";
  } catch {
    return NextResponse.json({ ok: false, error: "That request was not understood." }, { status: 400 });
  }

  try {
    const fetched = await safeFetchText(url);
    return NextResponse.json({ ok: true, ...fetched }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof FetchRefused
        ? error.message
        : "The source could not be reached. Check the address, and that it is public.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
