"use client";

import * as React from "react";

import { CertificateSheet } from "@/components/certificates/CertificateSheet";
import {
  buildCertificatePdf,
  certificateFileName,
  type CertificateDoc,
} from "@/lib/results/certificatePdf";

/**
 * The organizer's own certificate, shown to the player it belongs to.
 *
 * There was a version of this drawn from scratch — a gold-bordered panel with wording of
 * its own. It was the same mistake the awards screen had already made and had already been
 * corrected for: the event has a designed certificate, with its artwork, its paper and both
 * signatures, and anything else hands somebody a document that looks nothing like the one
 * the organizer thought they were giving out. So this renders that design and adds nothing
 * to it.
 *
 * No verification side. Codes are issued against the certificates table; these records were
 * not, and printing a code that fails to verify would be worse than leaving it off.
 */
export function Certificate({
  name,
  placement,
  document: doc,
}: {
  name: string;
  /** "1st place, Advanced division" for the two who placed; absent for everybody else. */
  placement?: string;
  /** Everything the downloaded file needs, so the button works with no server. */
  document: CertificateDoc;
}) {
  const [state, setState] = React.useState<"idle" | "working" | "failed">(
    "idle",
  );

  async function download() {
    setState("working");
    try {
      const blob = await buildCertificatePdf(doc);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = certificateFileName(name);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      /* Let the browser start the save before the blob is thrown away. */
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <div className="mt-4 overflow-hidden rounded-xl shadow-sm">
        <CertificateSheet
          recipientName={name}
          dateLabel="23rd August, 2026"
          placement={placement}
          showBack={false}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={download}
          disabled={state === "working"}
          className="w-full rounded-lg px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
          style={{ background: "#4A2E2A" }}
        >
          {state === "working"
            ? "Preparing your file…"
            : "Download my results and certificate (PDF)"}
        </button>
      </div>

      {state === "failed" ? (
        <p className="mt-3 text-sm text-[#6B5A50]">
          This browser could not build the file. Try again, or open this page on
          another phone.
        </p>
      ) : null}
    </>
  );
}
