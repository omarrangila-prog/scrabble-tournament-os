"use client";

import * as React from "react";

import { subscribeToEventPings } from "./publicLive";

/**
 * Data that keeps itself current.
 *
 * Two ways of finding out something changed, because either alone is not enough. The broadcast
 * ping is immediate — a score entered at the desk reaches a phone in about a second — but a
 * phone on venue wifi drops a websocket, and a page that quietly stopped updating is worse than
 * one that never claimed to be live. So the page also asks again every few seconds regardless,
 * and when the tab comes back to the front. The ping makes it fast; the poll makes it certain.
 *
 * `live` is true only while the last successful read is recent. A page may say LIVE on that and
 * on nothing else.
 */

const POLL_MS = 7_000;
/**
 * How long a connected page goes without asking when nothing has pinged.
 *
 * While the broadcast channel is up it will say when something changes, so the poll is only a
 * safety net and can be slow — a room of eighty phones each asking every seven seconds would be
 * hundreds of requests a minute for no reason. With the channel down the page polls at the
 * fast rate, which is the fallback the brief asks for.
 */
const CONNECTED_POLL_MS = 30_000;
/** A read older than this is no longer evidence the page is live. */
const STALE_MS = 25_000;
/** A burst of pings — publishing a round writes every board — becomes one read. */
const DEBOUNCE_MS = 400;

export interface LiveData<T> {
  data: T | null;
  /** False until the first read has finished, so "nothing yet" is never shown while still asking. */
  loaded: boolean;
  /** True when the last read worked recently. */
  live: boolean;
  /** Whole seconds since the last successful read, or null before the first. */
  secondsAgo: number | null;
  /** Epoch milliseconds of the last successful read. */
  fetchedAt: number | null;
  error: boolean;
}

export function useLiveData<T>(
  /** Changes when the thing being read changes. Empty means nothing to read yet. */
  key: string,
  /** The event whose pings should trigger a read, where there is one. */
  eventId: string | null,
  load: () => Promise<T>,
): LiveData<T> {
  const loadRef = React.useRef(load);
  React.useEffect(() => {
    loadRef.current = load;
  });

  const [state, setState] = React.useState<{ data: T | null; at: number | null; error: boolean; loaded: boolean }>({
    data: null,
    at: null,
    error: false,
    loaded: false,
  });
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    if (!key) return;

    let alive = true;
    let debounce: number | undefined;
    let connected = false;
    let lastRead = 0;

    const read = async () => {
      try {
        const data = await loadRef.current();
        if (!alive) return;
        lastRead = Date.now();
        setState({ data, at: Date.now(), error: false, loaded: true });
      } catch {
        if (!alive) return;
        setState((s) => ({ ...s, error: true, loaded: true }));
      }
    };

    /* Not called in the effect body: the first read is queued, so state is never set within it. */
    const first = window.setTimeout(() => void read(), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (connected && Date.now() - lastRead < CONNECTED_POLL_MS) return;
      void read();
    }, POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);

    const stop = eventId
      ? subscribeToEventPings(
          eventId,
          () => {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(() => void read(), DEBOUNCE_MS);
          },
          (up) => {
            connected = up;
            /* A channel that has just come back may have missed a ping while it was down. */
            if (up) void read();
          },
        )
      : () => {};

    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearTimeout(debounce);
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [key, eventId]);

  const age = state.at === null || now === 0 ? null : Math.max(0, Math.round((now - state.at) / 1000));

  return {
    data: state.data,
    loaded: state.loaded,
    live: state.at !== null && !state.error && (age === null || age * 1000 < STALE_MS),
    secondsAgo: age,
    fetchedAt: state.at,
    error: state.error,
  };
}
