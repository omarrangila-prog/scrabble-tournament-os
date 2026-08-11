import { ImageResponse } from "next/og";

import { ACTIVE_EVENT } from "@/lib/domain/eventSeed";

/**
 * The share card.
 *
 * This is the single highest-leverage image on the site and it did not exist. The metadata
 * declared `summary_large_image` with no image behind it, so every share of this event —
 * and it is an event marketed on WhatsApp and Instagram — rendered as a bare grey link.
 *
 * It is drawn rather than uploaded, so it cannot fall out of date: the date, the venue and
 * the fee come from the event record, which means a change to the event changes the card
 * everybody sees when they forward it.
 *
 * The whole card is set in one face. Only the display font is loaded, so naming a second
 * family would have changed nothing except to suggest a fallback that does not exist.
 *
 * The tiles are rebuilt here rather than imported. Satori, which renders this, supports a
 * subset of CSS — no grid, no `mix-blend-mode`, no `em`-based shadows — so the real
 * component would render as flat squares. These are the same proportions and colours
 * expressed in what this renderer actually supports.
 */

export const alt =
  "Blufy's AlphaBattle — a Scrabble tournament in Karachi on 23 August 2026";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WORD = "ALPHABATTLE";
const VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

const TILE = 84;

/**
 * Fraunces, for the letterforms.
 *
 * Fetched rather than bundled, and wrapped so a failure degrades to the default face
 * instead of failing the image. A share card that renders in the wrong font is a small
 * problem; one that 500s is a grey link again.
 */
async function displayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());

    const url = css.match(/src: url\((https:\/\/[^)]+\.(?:woff2?|ttf))\)/)?.[1];
    if (!url) return null;

    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

function formattedDate(): string {
  const d = new Date(`${ACTIVE_EVENT.startDate}T00:00:00+05:00`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
}

export default async function Image() {
  const font = await displayFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#060F0A",
          backgroundImage:
            "radial-gradient(1100px 520px at 46% -10%, #123021 0%, #060F0A 72%)",
          fontFamily: font ? "Fraunces" : "serif",
        }}
      >
        {/* Who this is, and where. */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 46,
              height: 46,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              backgroundColor: "#E4CB9B",
              backgroundImage: "linear-gradient(150deg, #F0DDB4 0%, #CFAF76 100%)",
              color: "#3A2A17",
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            B
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              color: "rgba(244,235,217,0.72)",
            }}
          >
            BLUFY&apos;S ALPHABATTLE · KARACHI
          </div>
        </div>

        {/* The name, in tiles. */}
        <div style={{ display: "flex", gap: 9 }}>
          {[...WORD].map((letter, i) => (
            <div
              key={`${letter}-${i}`}
              style={{
                width: TILE,
                height: TILE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                borderRadius: 9,
                backgroundImage:
                  "linear-gradient(145deg, #F0DDB4 0%, #E4CB9B 48%, #CFAF76 100%)",
                boxShadow: "0 3px 0 #A5854F, 0 12px 26px rgba(0,0,0,0.5)",
                color: "#3A2A17",
                fontSize: 50,
                fontWeight: 600,
              }}
            >
              {letter}
              <div
                style={{
                  position: "absolute",
                  right: 8,
                  bottom: 5,
                  display: "flex",
                  fontSize: 17,
                  color: "#5A452B",
                }}
              >
                {VALUES[letter]}
              </div>
            </div>
          ))}
        </div>

        {/* The three facts somebody forwarding this needs. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              height: 2,
              width: 190,
              backgroundImage: "linear-gradient(90deg, #D8AC5A 0%, rgba(216,172,90,0) 100%)",
            }}
          />
          <div style={{ display: "flex", fontSize: 46, color: "#F4EBD9" }}>
            A fast-paced Scrabble showdown
          </div>
          <div
            style={{
              display: "flex",
              gap: 26,
              fontSize: 27,
              color: "#D8AC5A",
            }}
          >
            <div style={{ display: "flex" }}>{formattedDate()}</div>
            <div style={{ display: "flex", color: "rgba(244,235,217,0.5)" }}>·</div>
            <div style={{ display: "flex" }}>
              {ACTIVE_EVENT.venueName}, {ACTIVE_EVENT.city}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Fraunces", data: font, style: "normal", weight: 600 as const }]
        : [],
    },
  );
}
