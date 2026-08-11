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
 * Looks in the built-in definitions first. The 23 August event is defined there in full —
 * its price rules, prize list and wording — and that definition is what the form charges
 * from, so it stays authoritative and this hook changes nothing about how that event
 * behaves.
 *
 * Anything else is read from the database. That is what makes an event created through
 * the organizer's form reachable: before this, it had a row, a slug and no public page.
 */
export function usePublicEvent(slug: string): PublicEventState {
  const store = useEventStore();
  const seeded = selectEventBySlug(store, slug);

  const [fetched, setFetched] = React.useState<PublicEvent | null>(null);
  const [resolved, setResolved] = React.useState(false);

  React.useEffect(() => {
    // A built-in definition needs no lookup, and must not be overwritten by one.
    if (seeded) return;

    let live = true;

    (async () => {
      const stored = slug ? await readPublicEvent(slug) : null;
      if (!live) return;
      setFetched(stored ? publicEventFromStored(stored) : null);
      setResolved(true);
    })();

    return () => {
      live = false;
    };
  }, [slug, seeded]);

  if (seeded) return { event: seeded, resolved: true, fromDatabase: false };
  return { event: fetched, resolved, fromDatabase: true };
}
