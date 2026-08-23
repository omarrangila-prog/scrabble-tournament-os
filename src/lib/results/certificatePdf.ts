/**
 * A player's certificate and record, built as a PDF in their own browser.
 *
 * The certificate page is the organizer's own design — the same paper, artwork, wording and
 * signatures as the certificate on screen — rather than anything drawn for this file. A
 * document that looks different from the one the organizer designed is the wrong document,
 * however neat it is.
 *
 * Built in the page and never stored. That is what lets a hall of people save their own at
 * the same time with no server, and it means there is no folder of documents to rebuild
 * when a score is corrected.
 */

import type { jsPDF } from "jspdf";

export interface CertificateDoc {
  name: string;
  division: string;
  /** "1st place, Advanced division" for the two who placed; absent for everybody else. */
  placement?: string;
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

/* Sampled from the design, not guessed. */
const INK = "#4A2E2A";
const GOLD = "#C79A5B";
const MUTED = "#6B5A50";

/** A4 landscape, the format the certificate was designed at. */
const W = 297;
const H = 210;

/** Percentages in the design read against the page width, exactly as `cqw` does on screen. */
const pct = (of: number, percent: number) => (of * percent) / 100;

export async function buildCertificatePdf(
  entry: CertificateDoc,
): Promise<Blob> {
  const { jsPDF: PDF } = await import("jspdf");
  const doc: jsPDF = new PDF({
    unit: "mm",
    format: "a4",
    orientation: "landscape",
  });

  const [paper, artwork, signHani, signChai] = await Promise.all([
    loadImage("/certificate/paper.jpg", 1000, "jpeg"),
    loadImage("/certificate/artwork.png", 760, "png"),
    loadImage("/certificate/signature-hani.png", 420, "png"),
    loadImage("/certificate/signature-chai.png", 260, "png"),
  ]);

  drawCertificate(doc, entry, { paper, artwork, signHani, signChai });
  drawRecord(doc, entry, paper);

  return doc.output("blob");
}

interface Art {
  paper: Loaded | null;
  artwork: Loaded | null;
  signHani: Loaded | null;
  signChai: Loaded | null;
}

/** The organizer's certificate, at the proportions the design uses. */
function drawCertificate(doc: jsPDF, entry: CertificateDoc, art: Art) {
  const isAward = Boolean(entry.placement);

  background(doc, art.paper);

  /* The frame the design carries around the whole sheet. */
  doc.setDrawColor(INK);
  doc.setLineWidth(0.8);
  doc.rect(0.4, 0.4, W - 0.8, H - 0.8);

  doc.setTextColor(INK);
  centred(doc, "BLUFY'S ALPHABATTLE X CHAI CHATT", pct(H, 5.6), {
    font: ["helvetica", "bold"],
    size: pt(2.1),
    spacing: 1.9,
  });

  centred(
    doc,
    `CERTIFICATE OF ${isAward ? "ACHIEVEMENT" : "PARTICIPATION"}`,
    pct(H, 10.4),
    {
      font: ["times", "bold"],
      size: pt(4.3),
      spacing: 0.5,
    },
  );

  rule(doc, pct(H, 19.4));

  centred(doc, "This certificate is proudly presented to", pct(H, 22.4), {
    font: ["helvetica", "normal"],
    size: pt(3.1),
  });

  centred(doc, entry.name.toUpperCase(), pct(H, 29.5), {
    font: ["times", "bold"],
    size: pt(entry.name.length > 22 ? 4.4 : 5.6),
    spacing: 0.4,
    fit: W * 0.82,
  });

  rule(doc, pct(H, 39.4));

  const sentence = isAward
    ? [
        `for ${entry.placement}`,
        "at Blufy's Alphabattle's Speed Scrabble Competition, Chai Chatt.",
      ]
    : [
        "for participating in Blufy's Alphabattle's",
        "Speed Scrabble Competition at Chai Chatt.",
      ];
  const size = pt(isAward ? 2.5 : 2.9);
  sentence.forEach((line, i) => {
    centred(doc, line, pct(H, 42.4) + i * size * 0.52, {
      font: ["times", "italic"],
      size,
    });
  });

  if (art.artwork) {
    const width = pct(W, 59);
    doc.addImage(
      art.artwork.data,
      "PNG",
      pct(W, 20.5),
      pct(H, 52.5),
      width,
      width * (art.artwork.height / art.artwork.width),
      "artwork",
      "FAST",
    );
  }

  centred(doc, "Dated:  23rd August, 2026", pct(H, 74.5), {
    font: ["helvetica", "bold"],
    size: pt(2.6),
  });

  signature(
    doc,
    art.signHani,
    pct(W, 18),
    pct(W, 15),
    "Hani Garib",
    "Founder - Blufy's Alphabattle",
    "sign-hani",
  );
  signature(
    doc,
    art.signChai,
    pct(W, 55),
    pct(W, 8),
    "",
    "Chai Chatt",
    "sign-chai",
  );
}

function signature(
  doc: jsPDF,
  image: Loaded | null,
  left: number,
  imageWidth: number,
  name: string,
  title: string,
  alias?: string,
) {
  const blockWidth = pct(W, 27);
  const mid = left + blockWidth / 2;
  const baseline = pct(H, 79) + pct(W, 6);

  if (image) {
    const height = imageWidth * (image.height / image.width);
    doc.addImage(
      image.data,
      "PNG",
      mid - imageWidth / 2,
      baseline - height,
      imageWidth,
      height,
      alias,
      "FAST",
    );
  }

  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.3);
  doc.line(left, baseline + 2, left + blockWidth, baseline + 2);

  doc.setTextColor(INK);
  if (name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(pt(2.3));
    doc.text(name, mid, baseline + 7, { align: "center" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pt(1.9));
  doc.text(title, mid, baseline + (name ? 11.5 : 7), { align: "center" });
}

/** The second page: the three rounds the certificate is a statement about. */
function drawRecord(doc: jsPDF, entry: CertificateDoc, paper: Loaded | null) {
  doc.addPage([W, H], "landscape");
  background(doc, paper);

  doc.setDrawColor(INK);
  doc.setLineWidth(0.8);
  doc.rect(0.4, 0.4, W - 0.8, H - 0.8);

  const M = 26;

  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(
    `${entry.division.toUpperCase()}  DIVISION  ·  23 AUGUST 2026  ·  KARACHI`,
    M,
    26,
  );

  doc.setTextColor(INK);
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.text(entry.name, M, 38);

  const stats: [string, string][] = [
    ["POSITION", entry.position ?? "Not ranked"],
    ["RECORD", entry.record],
    ["SPREAD", entry.spread],
  ];
  stats.forEach(([label, value], i) => {
    const x = M + i * 62;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(label, x, 50);
    doc.setFontSize(13);
    doc.setTextColor(INK);
    doc.text(value, x, 58);
  });

  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.3);
  doc.line(M, 66, W - M, 66);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(GOLD);
  doc.text("EVERY ROUND", M, 78);

  let y = 90;
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
      doc.setFont("times", "bold");
      doc.setFontSize(16);
      doc.setTextColor(INK);
      doc.text(`${round.scoreFor} - ${round.scoreAgainst}`, M, y + 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(MUTED);
      doc.text(`against ${round.opponent ?? "an opponent"}`, M + 40, y + 9);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(MUTED);
      doc.text("No game this round.", M, y + 9);
    }

    y += 22;
    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.2);
    doc.line(M, y - 8, W - M, y - 8);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(
    "Scores as published by the Pakistan Scrabble Association, unchanged.",
    M,
    H - 16,
  );
}

/* ---- drawing helpers ------------------------------------------------- */

/** A design percentage of the page width, as a font size in points. */
function pt(cqw: number): number {
  return ((W * cqw) / 100) * 2.5;
}

function background(doc: jsPDF, paper: Loaded | null) {
  doc.setFillColor("#FFFDF7");
  doc.rect(0, 0, W, H, "F");
  /*
   * The alias matters. Without it the paper texture is embedded once per page, and two
   * copies of it is most of the file — this is a document people send each other.
   */
  if (paper) doc.addImage(paper.data, "JPEG", 0, 0, W, H, "paper", "FAST");
}

function centred(
  doc: jsPDF,
  text: string,
  top: number,
  options: {
    font: [string, string];
    size: number;
    /** Extra letter spacing, in millimetres, as the design's tracking. */
    spacing?: number;
    /** Shrink to fit this width rather than running off the page. */
    fit?: number;
  },
) {
  doc.setFont(options.font[0], options.font[1]);
  let size = options.size;
  doc.setFontSize(size);

  if (options.fit) {
    while (
      size > 8 &&
      doc.getTextWidth(text) + (options.spacing ?? 0) * text.length >
        options.fit
    ) {
      size -= 1;
      doc.setFontSize(size);
    }
  }

  /* jsPDF places text on its baseline; the design positions the top of the line. */
  const baseline = top + size * 0.3;

  if (options.spacing) {
    doc.text(text, W / 2, baseline, {
      align: "center",
      charSpace: options.spacing,
    });
  } else {
    doc.text(text, W / 2, baseline, { align: "center" });
  }
}

/** One of the thin gold rules that separate the design's sections. */
function rule(doc: jsPDF, y: number) {
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.25);
  doc.line(pct(W, 12), y, pct(W, 88), y);
}

/* ---- assets ---------------------------------------------------------- */

interface Loaded {
  data: string;
  width: number;
  height: number;
}

const cache = new Map<string, Loaded | null>();

/**
 * One of the design's images, as a data URI small enough to carry in a file people send
 * each other.
 *
 * Redrawn through a canvas at a printing width rather than embedded at full size: the paper
 * texture alone is a quarter of a megabyte, and fifty-nine of those is a download nobody
 * wants. A missing image returns null and the page is drawn without it, because a
 * certificate with no border art still says what it needs to.
 */
async function loadImage(
  path: string,
  maxWidth: number,
  format: "jpeg" | "png",
): Promise<Loaded | null> {
  const seen = cache.get(path);
  if (seen !== undefined) return seen;

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`could not load ${path}`));
      element.src = path;
    });

    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const loaded: Loaded = {
      data:
        format === "jpeg"
          ? canvas.toDataURL("image/jpeg", 0.7)
          : canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
    cache.set(path, loaded);
    return loaded;
  } catch {
    cache.set(path, null);
    return null;
  }
}

/** A filename a person will recognise in their downloads folder. */
export function certificateFileName(name: string): string {
  const safe = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${safe}-Blufys-AlphaBattle-2026.pdf`;
}
