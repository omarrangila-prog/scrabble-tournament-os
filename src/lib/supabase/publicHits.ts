"use client";

import { supabase } from "./client";

export type HitKind =
  | "results_view"
  | "certificate_view"
  | "certificate_download"
  | "odoovations_click";

/**
 * Count one use of a public results page. Fire and forget: a counter that can break the page it
 * is counting is worse than no counter, so every failure is swallowed.
 *
 * `slug` is read from the address when it is not given, because the certificate artwork is shared
 * between pages that each know their own event. Page views count once per browser session, so a
 * refresh or a back button is not a second visitor; downloads and clicks count every time.
 */
export function recordHit(kind: HitKind, slug?: string): void {
  try {
    const event =
      slug ??
      /\/results\/event\/([^/?#]+)/.exec(window.location.pathname)?.[1] ??
      "";
    if (!event) return;
    const eventSlug = decodeURIComponent(event);

    if (kind.endsWith("_view")) {
      const key = `hit:${kind}:${eventSlug}:${window.location.pathname}`;
      try {
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
      } catch {
        /* Storage blocked: count it rather than lose it. */
      }
    }

    const db = supabase();
    if (!db) return;
    void Promise.resolve(
      db.rpc("record_public_hit", { p_slug: eventSlug, p_kind: kind }),
    ).catch(() => {});
  } catch {
    /* Never let a counter break a page. */
  }
}

export interface HitTotals {
  kind: HitKind;
  total: number;
  today: number;
}

export async function readHits(eventId: string): Promise<HitTotals[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.rpc("staff_public_hits", {
    p_event_id: eventId,
  });
  if (error || !Array.isArray(data)) return [];
  return data as HitTotals[];
}
