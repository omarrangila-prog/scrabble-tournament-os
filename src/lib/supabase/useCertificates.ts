"use client";

import * as React from "react";

import { listCertificates, type StoredCertificate } from "./certificates";

export interface CertificatesState {
  /** Every certificate the database holds for this event, by code. */
  byCode: Map<string, StoredCertificate>;
  /** Codes the database has as issued — the ones whose QR resolves. */
  issuedCodes: Set<string>;
  loaded: boolean;
  reload: () => void;
}

/**
 * What the database holds for an event, alongside the studio's own working list.
 *
 * The studio composes certificates locally, which is right — wording is edited before
 * anybody is committed to it. But "issued" is a claim about the world: it means the code
 * printed on the paper resolves when somebody scans it. That fact lives in Postgres, not
 * in the browser that happened to press the button.
 *
 * This is read so the studio can show which certificates are genuinely verifiable, and
 * flag any that were issued in a browser before the database held them — those print a QR
 * that answers "no certificate matches that code".
 */
export function useCertificates(eventId: string): CertificatesState {
  const [rows, setRows] = React.useState<StoredCertificate[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const [reloads, setReloads] = React.useState(0);
  const reload = React.useCallback(() => setReloads((n) => n + 1), []);

  React.useEffect(() => {
    let live = true;

    (async () => {
      const next = await listCertificates(eventId);
      if (!live) return;
      setRows(next);
      setLoaded(true);
    })();

    return () => {
      live = false;
    };
  }, [eventId, reloads]);

  const byCode = React.useMemo(
    () => new Map(rows.map((r) => [r.code.toUpperCase(), r])),
    [rows],
  );

  const issuedCodes = React.useMemo(
    () =>
      new Set(
        rows.filter((r) => r.status === "issued").map((r) => r.code.toUpperCase()),
      ),
    [rows],
  );

  return { byCode, issuedCodes, loaded, reload };
}
