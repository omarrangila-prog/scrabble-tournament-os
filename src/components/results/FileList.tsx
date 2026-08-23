"use client";

import Link from "next/link";
import * as React from "react";

import {
  buildCertificatePdf,
  certificateFileName,
  type CertificateDoc,
} from "@/lib/results/certificatePdf";

export interface FileRow {
  slug: string;
  name: string;
  division: string;
  position: string | null;
  document: CertificateDoc;
}

/**
 * Every player's file, listed the way a folder of files is listed.
 *
 * The per-player page works, but it asks somebody to find themselves first and download
 * second. This is the other order, and the one people already know: names down the page,
 * a download beside each, nothing to search for.
 *
 * The files are made in the browser at the moment they are asked for. That is invisible at
 * this size — under a second each — and it means there is no folder of fifty-nine documents
 * to regenerate every time a score is corrected, and nothing stored anywhere that could
 * drift out of step with the record on the page.
 */
export function FileList({ rows }: { rows: FileRow[] }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Set<string>>(new Set());
  const [all, setAll] = React.useState<{ made: number; of: number } | null>(
    null,
  );
  const [query, setQuery] = React.useState("");

  const shown = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(needle));
  }, [rows, query]);

  function save(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function downloadOne(row: FileRow) {
    setBusy(row.slug);
    try {
      save(
        await buildCertificatePdf(row.document),
        certificateFileName(row.name),
      );
      setDone((was) => new Set(was).add(row.slug));
    } finally {
      setBusy(null);
    }
  }

  async function downloadEverything() {
    setAll({ made: 0, of: rows.length });
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const blob = await buildCertificatePdf(row.document);
      zip.folder(row.division)!.file(certificateFileName(row.name), blob);
      setAll({ made: i + 1, of: rows.length });
      /* Give the browser a frame between documents so the count actually moves. */
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    save(
      await zip.generateAsync({ type: "blob" }),
      "Blufys-AlphaBattle-2026-all-records.zip",
    );
    setAll(null);
  }

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for your name"
          aria-label="Search for your name"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-base outline-none placeholder:text-white/35 focus:border-[#C89B3C] sm:max-w-sm"
        />
        <button
          type="button"
          onClick={downloadEverything}
          disabled={all !== null}
          className="rounded-lg px-4 py-3 text-sm font-bold transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "#C89B3C", color: "#0E1512" }}
        >
          {all
            ? `Building ${all.made} of ${all.of}…`
            : "Download all as one zip"}
        </button>
      </div>

      <p className="mt-3 text-sm text-white/45">
        {shown.length} of {rows.length} files
      </p>

      <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
        {shown.map((row) => {
          const working = busy === row.slug;
          return (
            <li
              key={row.slug}
              className="flex items-center gap-3 px-3 py-3 transition hover:bg-white/[0.04] sm:px-4"
            >
              <FileIcon />

              {/*
               * The person's name leads, not the file's. A filename with the event and the
               * year in it is longer than a phone can show, and the half that gets clipped
               * is the half somebody is scanning for.
               */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.95rem] font-bold">
                  {row.name}
                </span>
                <span className="block truncate text-xs text-white/45">
                  {row.division}
                  {row.position ? ` · ${row.position}` : " · not ranked"} · PDF,
                  2 pages
                </span>
              </span>

              <Link
                href={`/results/${row.slug}`}
                className="hidden shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/5 sm:block"
              >
                Open
              </Link>

              <button
                type="button"
                onClick={() => downloadOne(row)}
                disabled={working}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition hover:opacity-90 disabled:opacity-60"
                style={{ background: "#C89B3C", color: "#0E1512" }}
              >
                {working ? "…" : done.has(row.slug) ? "Again" : "Download"}
              </button>
            </li>
          );
        })}
      </ul>

      {shown.length === 0 ? (
        <p className="mt-6 text-center text-white/55">
          No name matches &ldquo;{query}&rdquo;. Try a shorter part of it.
        </p>
      ) : null}
    </>
  );
}

function FileIcon() {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-lg text-[0.6rem] font-extrabold"
      style={{ background: "rgba(200,155,60,0.18)", color: "#C89B3C" }}
    >
      PDF
    </span>
  );
}
