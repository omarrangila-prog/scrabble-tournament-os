"use client";

import * as React from "react";

import { publicEventFromStored } from "@/lib/domain/publicEvent";
import type { PublicEvent } from "@/lib/domain/events";
import { selectEventBySlug, useEventStore } from "@/lib/store/useEventStore";

import { readPublicEvent } from "./events";

export interface PublicEventState {
  event: PublicEvent | null;
  /** False until the answer is known, so "not found" is never shown while looking. */
  resolved: boolean;
  /** True when the event came from the database rather than the built-in definition. */
  fromDatabase: boolean;
}

/**
 * The event behind a public link.
 *
 * Built-in definitions still supply the full copy (prices, prizes, wording) for AlphaBattle —
 * that is what the form charges from. But the **phase** must come from the database: a seed
 * frozen at `registration-open` used to leave the public form and `/live` inviting new
 * entrants while the wall correctly showed result entry for a round already being played.
 *
 * Created events (no seed) are read entirely from the database.
 */
export function usePublicEvent(slug: string): PublicEventState {
  const store = useEventStore();
  const seeded = selectEventBySlug(store, slug);

  const [live, setLive] = React.useState<PublicEvent | null>(null);
  const [resolved, setResolved] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    (async () => {
      const stored = slug ? await readPublicEvent(slug) : null;
      if (!active) return;
      setLive(stored ? publicEventFromStored(stored) : null);
      setResolved(true);
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  if (!resolved) {
    /*
     * Prefer nothing over a seed stuck on an old phase: showing "Register now" for one
     * frame while the wall says "submit your result" is worse than a brief empty load.
     */
    return { event: null, resolved: false, fromDatabase: false };
  }

  if (seeded) {
    if (live) {
      return {
        event: {
          ...seeded,
          /* Live day state — open/closed/playing — always from Postgres. */
          state: live.state,
          /* Fee and capacity the organizer may have changed in Settings. */
          fee: live.fee || seeded.fee,
          currency: live.currency || seeded.currency,
          capacity: live.capacity || seeded.capacity,
          rates: live.rates?.length ? live.rates : seeded.rates,
          /* What the event sells, where the organiser has configured more than one thing. */
          activities: live.activities?.length ? live.activities : seeded.activities,
          promoCodes: live.promoCodes?.length ? live.promoCodes : seeded.promoCodes,
          rounds: live.rounds || seeded.rounds,
          roundMinutes: live.roundMinutes || seeded.roundMinutes,
          venueName: live.venueName || seeded.venueName,
          address: live.address || seeded.address,
          city: live.city || seeded.city,
          mapsUrl: live.mapsUrl || seeded.mapsUrl,
          mapCoords: live.mapCoords || seeded.mapCoords,
          paymentInstructions: live.paymentInstructions || seeded.paymentInstructions,
          terms: live.terms || seeded.terms,
          feeDetails: live.feeDetails || seeded.feeDetails,
        },
        resolved: true,
        fromDatabase: true,
      };
    }
    /* Seed exists but the row is gone — keep the definition rather than 404. */
    return { event: seeded, resolved: true, fromDatabase: false };
  }

  return { event: live, resolved: true, fromDatabase: true };
}
