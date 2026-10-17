"use client";

import * as React from "react";

import { fingerprint, normalizeSourceUrl } from "@/lib/import/source";

import {
  fetchExternalSource,
  listExternalSources,
  recordSourceSync,
  type ExternalSource,
} from "./externalSources";

/**
 * The event's outside sources, kept current while somebody is looking at them.
 *
 * An automatic sync only ever *looks*. It fetches the source, compares a digest of what came back
 * with the digest of what was last applied, and records "changes" or "ok". It never applies
 * anything: a score arriving from outside is a decision, and the whole point of the preview is
 * that a person makes it. What auto-sync buys is that the person finds out at once, instead of
 * pressing a button to discover nothing has changed.
 *
 * It runs only while a screen is mounted that uses it. There is no background worker in this
 * deployment, so an unattended source is not being watched — which the screen says, rather than
 * implying a vigilance nobody is providing.
 *
 * It does not hammer. A source that fails is retried at twice the interval, then four times,
 * capped at five minutes, so a server that has started refusing requests is left alone instead of
 * being asked every thirty seconds until somebody notices.
 */

const TICK_MS = 5_000;
const BACKOFF_CAP_MS = 5 * 60_000;

export interface ExternalSourcesState {
  sources: ExternalSource[];
  loaded: boolean;
  /** Wall-clock milliseconds, advancing every few seconds, for "next sync in …". */
  now: number;
  /** How many sources have changed since they were last applied. */
  changed: number;
  reload: () => void;
  /** Checks one source now. Resolves once it has been recorded. */
  syncNow: (source: ExternalSource) => Promise<{ ok: boolean; changed: boolean; message?: string }>;
}

export function useExternalSources(eventId: string, enabled = true): ExternalSourcesState {
  const [sources, setSources] = React.useState<ExternalSource[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);
  const [now, setNow] = React.useState(0);

  const failures = React.useRef(new Map<string, number>());
  const running = React.useRef(new Set<string>());
  const latest = React.useRef<ExternalSource[]>([]);

  React.useEffect(() => {
    latest.current = sources;
  });

  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    if (!eventId || !enabled) return;
    let alive = true;

    (async () => {
      const list = await listExternalSources(eventId);
      if (!alive) return;
      setSources(list);
      setLoaded(true);
    })();

    return () => {
      alive = false;
    };
  }, [eventId, enabled, reloads]);

  const syncNow = React.useCallback(
    async (source: ExternalSource) => {
      if (running.current.has(source.id)) return { ok: true, changed: false };
      running.current.add(source.id);

      try {
        const fetched = await fetchExternalSource(normalizeSourceUrl(source.url));

        if (!fetched.ok) {
          failures.current.set(source.id, (failures.current.get(source.id) ?? 0) + 1);
          await recordSourceSync(source.id, "error", fetched.message, null);
          return { ok: false, changed: false, message: fetched.message };
        }

        failures.current.delete(source.id);
        const digest = fingerprint(fetched.text);
        /* Nothing yet applied means anything at all is new. */
        const changed = source.fingerprint === null || source.fingerprint !== digest;

        /* The stored digest is only advanced when an import is applied, so "changes" stays up until somebody looks. */
        await recordSourceSync(source.id, changed ? "changes" : "ok", null, changed ? null : digest);
        return { ok: true, changed };
      } finally {
        running.current.delete(source.id);
        setReloads((n) => n + 1);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!eventId || !enabled) return;

    const tick = window.setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);

      for (const source of latest.current) {
        if (source.intervalSeconds <= 0 || running.current.has(source.id)) continue;

        const wait = Math.min(
          source.intervalSeconds * 1000 * 2 ** Math.min(failures.current.get(source.id) ?? 0, 4),
          Math.max(BACKOFF_CAP_MS, source.intervalSeconds * 1000),
        );
        const last = source.lastAttemptAt ? Date.parse(source.lastAttemptAt) : 0;
        if (nowMs - last >= wait) void syncNow(source);
      }
    }, TICK_MS);

    return () => window.clearInterval(tick);
  }, [eventId, enabled, syncNow]);

  return {
    sources,
    loaded,
    now,
    changed: sources.filter((s) => s.status === "changes").length,
    reload,
    syncNow,
  };
}
