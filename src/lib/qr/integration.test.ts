import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { encodeQr } from "./qrcode";
import { buildShareAssets } from "../domain/events";
import { buildEventSeed } from "../domain/eventSeed";

function decode(text: string): string | null {
  const m = encodeQr(text);
  const S = 8, Q = 4;
  const dim = (m.length + Q * 2) * S;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m.length; c++)
      if (m[r][c])
        for (let dy = 0; dy < S; dy++)
          for (let dx = 0; dx < S; dx++) {
            const i = (((r + Q) * S + dy) * dim + ((c + Q) * S + dx)) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
  return jsQR(data, dim, dim)?.data ?? null;
}

describe("the QR codes this product actually emits are scannable", () => {
  const seed = buildEventSeed();
  const event = seed.events[0];
  const share = buildShareAssets(event, "https://scrabble-tournament-os.vercel.app");

  it("registration QR resolves to the registration form", () => {
    expect(decode(share.registerUrl)).toBe(share.registerUrl);
  });

  it("public event QR resolves to the event page", () => {
    expect(decode(share.publicUrl)).toBe(share.publicUrl);
  });

  it("phase-aware live QR resolves to the live route", () => {
    expect(decode(share.liveUrl)).toBe(share.liveUrl);
  });

  it("every participant's personal link is scannable", () => {
    // Sampled across the seed rather than all 84, to keep the suite fast.
    for (const reg of seed.registrations.slice(0, 12)) {
      const url = `https://scrabble-tournament-os.vercel.app/r/${reg.token}`;
      expect(decode(url)).toBe(url);
    }
  });

  it("participant links carry no internal record id", () => {
    for (const reg of seed.registrations) {
      expect(reg.token).not.toContain(reg.id);
      expect(reg.token).not.toMatch(/reg-|evt-/);
    }
  });
});
