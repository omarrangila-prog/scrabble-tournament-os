"use client";

import * as React from "react";
import { ClipboardList, FileSpreadsheet, FileText, Loader2, Table2 } from "lucide-react";

import { Button } from "@/components/ui";
import {
  buildCheckInReport,
  CHECK_IN_COLUMNS,
  checkInCells,
  FULL_LIST_COLUMNS,
  fullListCells,
  reportFileName,
  summaryCells,
  toCsv,
  type CheckInSource,
} from "@/lib/reports/checkInReport";
import { cn } from "@/lib/utils";

/**
 * "Check-in report", and the three things somebody might want it as.
 *
 * PDF for the table by the door, Excel for the office, CSV for whatever it is being fed into
 * next. All three are built from one report, so they cannot disagree about how many people
 * came — which is the only thing anybody checks twice.
 *
 * Everything happens in this browser. The heavy pieces — jsPDF, JSZip — are imported at the
 * moment they are pressed, so a screen nobody exports from never loads them.
 */

type Format = "pdf" | "xlsx" | "csv";

const FORMATS: { id: Format; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "pdf", label: "PDF", hint: "To print and take to the door", icon: <FileText className="size-4" /> },
  { id: "xlsx", label: "Excel", hint: "Totals and the full list", icon: <FileSpreadsheet className="size-4" /> },
  { id: "csv", label: "CSV", hint: "The list alone, for importing", icon: <Table2 className="size-4" /> },
];

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  /* Revoked on the next tick: revoking synchronously cancels the download in Safari. */
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CheckInReportButton({
  source,
  eventName,
  eventDate,
  disabled,
  onProblem,
  className,
}: {
  source: CheckInSource[];
  eventName: string;
  eventDate: string;
  disabled?: boolean;
  onProblem?: (message: string) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<Format | null>(null);
  const box = React.useRef<HTMLDivElement>(null);

  /* Close on a press elsewhere or on Escape, the two ways anybody dismisses a menu. */
  React.useEffect(() => {
    if (!open) return;

    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const download = async (format: Format) => {
    setBusy(format);
    setOpen(false);

    try {
      /*
       * Built at the moment of the press, from what is on screen now. A report assembled
       * when the page loaded would be stamped with a time it was not taken at, and would
       * miss whoever walked in while it sat there.
       */
      const report = buildCheckInReport(source, {
        eventName,
        eventDate,
        generatedAt: new Date().toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      });

      if (format === "csv") {
        /* The byte-order mark is what makes Excel read a name with an accent correctly. */
        save(new Blob(["﻿", toCsv(report)], { type: "text/csv;charset=utf-8" }), reportFileName(report, "csv"));
      } else if (format === "xlsx") {
        const { toXlsxBlob } = await import("@/lib/reports/xlsx");
        save(
          await toXlsxBlob([
            { name: "Summary", rows: summaryCells(report) },
            { name: "Check-in", rows: [[...CHECK_IN_COLUMNS], ...checkInCells(report)] },
            { name: "Full list", rows: [[...FULL_LIST_COLUMNS], ...fullListCells(report)] },
          ]),
          reportFileName(report, "xlsx"),
        );
      } else {
        const { checkInReportPdf } = await import("@/lib/reports/checkInPdf");
        save(await checkInReportPdf(report), reportFileName(report, "pdf"));
      }
    } catch (error) {
      console.error("check-in report", error);
      onProblem?.("The report could not be built. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <Button
        variant="secondary"
        icon={busy ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
        disabled={disabled || busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? "Building…" : "Check-in report"}
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-control border border-line bg-[rgb(var(--c-surface))] shadow-lg"
        >
          <p className="border-b border-line px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            Download as
          </p>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              type="button"
              onClick={() => void download(f.id)}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[rgb(var(--c-surface-soft))]"
            >
              <span className="mt-0.5 shrink-0 text-primary">{f.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">{f.label}</span>
                <span className="block text-[11.5px] leading-snug text-muted">{f.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
