"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { supabase } from "./client";

/**
 * Which event a venue screen should be showing.
 *
 * The television, the wall display and the pairing sheet have no event id in their URL and
 * no account to read a staff-only event list with, so they resolved to a single hardcoded id
 * — correct only while exactly one tournament has ever existed, and silently wrong the moment
 * a second one runs.
 *
 * Two ways to answer, in order:
 *
 *   `?event=<id-or-slug>` — explicit, and what a venue running two rooms at once should put
 *   on each screen. It survives being bookmarked on a television that gets switched on at
 *   nine and left alone all day, which is exactly how these screens are used.
 *
 *   Otherwise, whichever event is actually mid-day, from `event_live_now()`. Zero setup: a
 *   screen opened with a bare URL shows the tournament that is running, which is right almost
 *   every time because almost always only one is.
 *
 * `null` while resolving, and `null` again if nothing is running — a screen in an empty hall
 * should say so rather than confidently show a finished event's boards.
 */
export interface LiveEventState {
  eventId: string | null;
  slug: string | null;
  name: string | null;
  /** Venue, city and dates, so a screen can name where it is without a second lookup. */
  details: { venueName?: string; city?: string; startDate?: string } | null;
  /** False until the answer is known, so "no event" is never shown while still looking. */
  resolved: boolean;
}

export function useLiveEvent(): LiveEventState {
  const params = useSearchParams();
  const asked = params.get("event")?.trim() ?? "";

  const [state, setState] = React.useState<LiveEventState>({
    eventId: null,
    slug: null,
    name: null,
    details: null,
    resolved: false,
  });

  React.useEffect(() => {
    let live = true;

    (async () => {
      const db = supabase();
      if (!db) {
        if (live) setState({ eventId: null, slug: null, name: null, details: null, resolved: true });
        return;
      }

      /*
       * An explicit `?event=` may be either an id or a slug — whoever sets up a television
       * copies whichever one they have to hand, and being strict about which would only mean
       * a blank screen and nobody knowing why.
       *
       * A value matching neither resolves to nothing rather than being used as an id anyway:
       * a screen told to show an event that does not exist must say so, not render an empty
       * tournament indistinguishable from a real one nobody has arrived at yet.
       */
      if (asked) {
        const { data } = await db.rpc("public_event_by_ref", { p_ref: asked });
        const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
        if (!live) return;

        setState({
          eventId: row?.out_id ? String(row.out_id) : null,
          slug: row?.out_slug ? String(row.out_slug) : null,
          name: row?.out_name ? String(row.out_name) : null,
          details: (row?.out_data as LiveEventState["details"]) ?? null,
          resolved: true,
        });
        return;
      }

      const { data } = await db.rpc("event_live_now");
      const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
      if (!live) return;

      setState({
        eventId: row?.out_id ? String(row.out_id) : null,
        slug: row?.out_slug ? String(row.out_slug) : null,
        name: row?.out_name ? String(row.out_name) : null,
        details: (row?.out_data as LiveEventState["details"]) ?? null,
        resolved: true,
      });
    })();

    return () => {
      live = false;
    };
  }, [asked]);

  return state;
}
