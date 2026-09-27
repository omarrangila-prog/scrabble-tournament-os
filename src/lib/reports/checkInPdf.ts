"use client";

/**
 * The check-in report as a PDF, drawn in the organiser's own browser.
 *
 * Landscape A4, because the table has nine columns and a portrait page either drops some or
 * squeezes the names — and a name that has been truncated is the one thing on this document
 * nobody can work around at the door.
 *
 * The header row repeats on every page and each page is numbered "2 of 5", so a printed copy
 * that gets shuffled can be put back together. That is the whole reason this format exists:
 * the spreadsheet is for the office and this is for the table by the door, where the wifi is
 * worst and a phone is the wrong shape.
 */

import {
  CHECK_IN_COLUMNS,
  checkInCells,
  type CheckInReport,
} from "./checkInReport";

const INK = "#2E2A26";
const MUTED = "#6B5A50";
const RULE = "#D8CEC0";
const BAND = "#F3EDE3";

/** Column widths in millimetres, in the order of CHECK_IN_COLUMNS. Sums to the text width. */
const WIDTHS = [14, 46, 28, 32, 26, 24, 34, 16, 16, 15, 26];

export async function checkInReportPdf(report: CheckInReport): Promise<Blob> {
  const { jsPDF: PDF } = await import("jspdf");
  const doc = new PDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const bottom = pageHeight - 14;

  const cells = checkInCells(report);

  /* ---- The heading, once, on the first page ---------------------------- */
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(report.eventName, margin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text(
    [report.eventDate, `Check-in report`, `Generated ${report.generatedAt}`]
      .filter(Boolean)
      .join("   ·   "),
    margin,
    21.5,
  );

  /* ---- The totals, as a band ------------------------------------------- */
  doc.setFillColor(BAND);
  doc.rect(margin, 25, pageWidth - margin * 2, 11, "F");

  const totals: [string, string][] = [
    ["Registered", String(report.registered)],
    ["Checked in", String(report.checkedIn)],
    ["Not arrived", String(report.notArrived)],
    ["Turnout", report.turnout === null ? "—" : `${report.turnout}%`],
    ...report.byDivision.map(
      (d): [string, string] => [d.division, `${d.checkedIn} of ${d.registered}`],
    ),
  ];

  let x = margin + 4;
  for (const [label, value] of totals) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(label.toUpperCase(), x, 29.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(INK);
    doc.text(value, x, 34.5);

    x += Math.max(doc.getTextWidth(value) + 6, doc.getTextWidth(label) * 0.62 + 10);
  }

  /* ---- The table ------------------------------------------------------- */
  const rowHeight = 6.4;
  let y = 44;

  const drawHeader = () => {
    doc.setFillColor(INK);
    doc.rect(margin, y - 4.6, pageWidth - margin * 2, rowHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor("#FFFFFF");

    let cx = margin + 2;
    CHECK_IN_COLUMNS.forEach((column, i) => {
      doc.text(column, cx, y);
      cx += WIDTHS[i];
    });
    y += rowHeight + 1.2;
  };

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  cells.forEach((row, index) => {
    if (y > bottom) {
      doc.addPage();
      y = 18;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }

    /* Every other row shaded, so a finger tracking across nine columns stays on one person. */
    if (index % 2 === 1) {
      doc.setFillColor(BAND);
      doc.rect(margin, y - 4.4, pageWidth - margin * 2, rowHeight, "F");
    }

    let cx = margin + 2;
    row.forEach((value, i) => {
      const arrivedColumn = CHECK_IN_COLUMNS[i] === "Arrived";
      doc.setTextColor(arrivedColumn && value === "No" ? "#A33A3A" : INK);
      doc.setFont("helvetica", arrivedColumn ? "bold" : "normal");
      /* Clipped to its column so a long name can never run into the next one. */
      doc.text(String(value ?? ""), cx, y, { maxWidth: WIDTHS[i] - 2 });
      cx += WIDTHS[i];
    });

    y += rowHeight;
  });

  /* ---- Page numbers, added once the count is known --------------------- */
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(RULE);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(`${report.eventName} · check-in`, margin, pageHeight - 6);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  return doc.output("blob");
}
