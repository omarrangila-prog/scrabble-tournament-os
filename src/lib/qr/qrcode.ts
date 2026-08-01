/**
 * QR code generation.
 *
 * Backed by the `qrcode` library rather than a hand-rolled encoder. These codes
 * are scanned by participants' phone cameras at the venue — a subtly malformed
 * matrix produces a code that looks correct on screen but cannot be read, a
 * failure that would only surface on tournament day.
 *
 * Error-correction level M is used throughout: it tolerates roughly 15% damage,
 * covering print smudging and screen glare without inflating the code size.
 */

import QRCode from "qrcode";

export interface QrOptions {
  /** Rendered width in pixels. */
  size?: number;
  dark?: string;
  light?: string;
  /** Modules of white space around the code. Four is the specified minimum. */
  quietZone?: number;
}

const DEFAULTS: Required<QrOptions> = {
  size: 256,
  dark: "#12172A",
  light: "#FFFFFF",
  quietZone: 4,
};

/** Renders `text` as an SVG string. */
export function qrToSvg(text: string, options: QrOptions = {}): string {
  const o = { ...DEFAULTS, ...options };

  // The SVG renderer resolves synchronously, so the callback has already run
  // by the time this returns.
  let svg = "";
  QRCode.toString(
    text,
    {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: o.quietZone,
      width: o.size,
      color: { dark: o.dark, light: o.light },
    },
    (err: Error | null | undefined, result: string) => {
      if (err) throw err;
      svg = result;
    },
  );
  return svg;
}

/** Data URI form, for `<img src>` and download links. */
export function qrToDataUri(text: string, options: QrOptions = {}): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrToSvg(text, options))}`;
}

/**
 * The raw module matrix, for surfaces that need custom rendering.
 * `true` is a dark module.
 */
export function encodeQr(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const out: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(data[r * size + c] === 1);
    out.push(row);
  }
  return out;
}
