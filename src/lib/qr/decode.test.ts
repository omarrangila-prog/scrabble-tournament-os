import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { encodeQr, qrToSvg, qrToDataUri } from "./qrcode";

/**
 * Renders a matrix to a pixel buffer and decodes it with an independent
 * decoder. Structural checks alone cannot prove a code is scannable — only a
 * real decode does.
 */
function decode(text: string): string | null {
  const m = encodeQr(text);
  const SCALE = 8;
  const QUIET = 4;
  const dim = (m.length + QUIET * 2) * SCALE;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);

  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m.length; c++)
      if (m[r][c])
        for (let dy = 0; dy < SCALE; dy++)
          for (let dx = 0; dx < SCALE; dx++) {
            const y = (r + QUIET) * SCALE + dy;
            const x = (c + QUIET) * SCALE + dx;
            const i = (y * dim + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }

  return jsQR(data, dim, dim)?.data ?? null;
}

describe("QR codes are genuinely scannable", () => {
  const payloads = [
    "HELLO",
    "https://example.com",
    "https://scrabble-tournament-os.vercel.app/live/karachi-scrabble-sunday-2026",
    "https://scrabble-tournament-os.vercel.app/events/karachi-scrabble-sunday-2026/register",
    "https://scrabble-tournament-os.vercel.app/r/A7K2MNPQ4RST",
    "https://scrabble-tournament-os.vercel.app/verify/certificate/XY9WKMNP2QRS",
  ];

  for (const text of payloads) {
    it(`decodes: ${text.slice(0, 48)}${text.length > 48 ? "…" : ""}`, () => {
      expect(decode(text)).toBe(text);
    });
  }

  it("survives the full length of a realistic event URL", () => {
    const long =
      "https://scrabble-tournament-os.vercel.app/events/karachi-scrabble-sunday-championship-2026/register?ref=INSTAGRAM";
    expect(decode(long)).toBe(long);
  });
});

describe("QR rendering", () => {
  it("emits well-formed SVG", () => {
    const svg = qrToSvg("https://example.com", { size: 200 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("honours custom colours", () => {
    const svg = qrToSvg("test", { dark: "#123456", light: "#ABCDEF" });
    expect(svg.toLowerCase()).toContain("#123456");
    expect(svg.toLowerCase()).toContain("#abcdef");
  });

  it("produces a usable data URI", () => {
    const uri = qrToDataUri("https://example.com");
    expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(uri)).toContain("<svg");
  });

  it("is deterministic", () => {
    expect(encodeQr("https://example.com/x")).toEqual(encodeQr("https://example.com/x"));
  });
});
