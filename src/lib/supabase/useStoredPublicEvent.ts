"use client";

import * as React from "react";

import { readPublicEvent, type StoredEvent } from "./events";

/**
 * One public event straight from the database, once.
 *
 * Not `usePublicEvent`: that one merges in the event definitions seeded into the browser, which
 * is right for a registration form that prices from them and wrong for a results page, where an
 * event the database does not know about should read as not found rather than show a seeded copy.
 */
export function useStoredPublicEvent(slug: string): {
  event: StoredEvent | null;
  resolved: boolean;
} {
  const [state, setState] = React.useState<{ slug: string; event: StoredEvent | null } | null>(null);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      const event = slug ? await readPublicEvent(slug) : null;
      if (!alive) return;
      setState({ slug, event });
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  /* A result for a different slug is not an answer for this one. */
  const current = state && state.slug === slug ? state : null;
  return { event: current?.event ?? null, resolved: current !== null };
}
