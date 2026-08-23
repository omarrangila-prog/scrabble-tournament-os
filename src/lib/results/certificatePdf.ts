/**
 * A player's record and certificate, drawn as a PDF in their own browser.
 *
 * Printing works, but a print dialog is not what somebody means when they say download, and
 * on a phone it is two menus deep. This produces the file itself, in the page, with no
 * server involved: whoever opens their page can save it, and a hundred people can do it at
 * once without anything to run out of.
 *
 * Drawn as text and rules rather than as a screenshot of the page, so the file stays small
 * enough to send on WhatsApp, prints sharply at any size, and the name inside it is real
 * text a person can select.
 */

import type { jsPDF } from "jspdf";

export interface CertificateDoc {
  name: string;
  division: string;
  citation: string;
  position: string | null;
  record: string;
  spread: string;
  rounds: {
    round: number;
    scoreFor: number | null;
    scoreAgainst: number | null;
    opponent: string | null;
    result: string;
  }[];
}

const INK = "#14261C";
const MUTED = "#5B6B60";
const BRASS = "#8A6A1E";
const PAPER = "#FFFDF7";

/** Page 1: the record. Page 2: the certificate. Both A4 portrait. */
export async function buildCertificatePdf(
  entry: CertificateDoc,
): Promise<Blob> {
  const { jsPDF: PDF } = await import("jspdf");
  const doc: jsPDF = new PDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;

  paper(doc, W, H);

  /* ---- page one: what happened, round by round ---- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BRASS);
  doc.text(
    `${entry.division.toUpperCase()}  DIVISION  ·  23 AUGUST 2026  ·  KARACHI`,
    M,
    26,
  );

  doc.setTextColor(INK);
  doc.setFontSize(26);
  doc.text(entry.name, M, 40);

  const stats: [string, string][] = [
    ["POSITION", entry.position ?? "Not ranked"],
    ["RECORD", entry.record],
    ["SPREAD", entry.spread],
  ];
  stats.forEach(([label, value], i) => {
    const x = M + i * 58;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(label, x, 52);
    doc.setFontSize(13);
    doc.setTextColor(INK);
    doc.text(value, x, 60);
  });

  rule(doc, M, 68, W - M);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BRASS);
  doc.text("EVERY ROUND", M, 80);

  let y = 92;
  for (const round of entry.rounds) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(`ROUND ${round.round}`, M, y);

    const verdict =
      round.result === "bye"
        ? "No game"
        : round.result === "won"
          ? "Won"
          : round.result === "drew"
            ? "Drew"
            : "Lost";
    const gap =
      round.scoreFor !== null &&
      round.scoreAgainst !== null &&
      round.result !== "drew"
        ? ` by ${Math.abs(round.scoreFor - round.scoreAgainst)}`
        : "";
    doc.setTextColor(INK);
    doc.text(`${verdict}${gap}`, W - M, y, { align: "right" });

    if (round.scoreFor !== null && round.scoreAgainst !== null) {
      doc.setFontSize(17);
      doc.setTextColor(INK);
      doc.text(`${round.scoreFor} - ${round.scoreAgainst}`, M, y + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(MUTED);
      doc.text(`against ${round.opponent ?? "an opponent"}`, M, y + 17);
      y += 27;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(MUTED);
      doc.text("No game this round.", M, y + 10);
      y += 20;
    }
    rule(doc, M, y - 7, W - M);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(
    "Scores as published by the Pakistan Scrabble Association, unchanged.",
    M,
    H - 14,
  );

  /* ---- page two: the certificate ---- */
  doc.addPage();
  paper(doc, W, H);
  const mid = W / 2;

  doc.setDrawColor(BRASS);
  doc.setLineWidth(0.6);
  doc.roundedRect(M - 4, 32, W - 2 * (M - 4), H - 76, 4, 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(BRASS);
  doc.text("BLUFY'S ALPHABATTLE", mid, 80, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text(
    `${entry.division.toUpperCase()}  DIVISION  ·  23 AUGUST 2026  ·  KARACHI`,
    mid,
    88,
    {
      align: "center",
    },
  );

  rule(doc, mid - 12, 98, mid + 12);

  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("THIS CERTIFIES THAT", mid, 114, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(INK);
  doc.text(entry.name, mid, 134, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(MUTED);
  const lines: string[] = doc.splitTextToSize(entry.citation, W - 2 * M - 20);
  doc.text(lines, mid, 152, { align: "center" });

  if (entry.position) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(BRASS);
    doc.text(
      `FINAL POSITION: ${entry.position.toUpperCase()}`,
      mid,
      152 + lines.length * 6 + 16,
      {
        align: "center",
      },
    );
  }

  rule(doc, mid - 12, H - 62, mid + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text("Issued from the official tournament record.", mid, H - 52, {
    align: "center",
  });

  return doc.output("blob");
}

function paper(doc: jsPDF, width: number, height: number) {
  doc.setFillColor(PAPER);
  doc.rect(0, 0, width, height, "F");
}

function rule(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(BRASS);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

/** A filename a person will recognise in their downloads folder. */
export function certificateFileName(name: string): string {
  const safe = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${safe}-Blufys-AlphaBattle-2026.pdf`;
}
