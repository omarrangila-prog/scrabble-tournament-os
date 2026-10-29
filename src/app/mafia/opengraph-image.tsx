import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { eventTimeLine } from "@/lib/domain/eventTime";
import { posterDate, weekdayOf } from "@/lib/domain/mafia";

/**
 * The share card for Mafia Wars.
 *
 * This page is passed around on WhatsApp far more than it is browsed to, so the picture a link
 * unfurls into is the poster most people will see. It is drawn here rather than uploaded, and it
 * reads the event's own date, time, venue and price, so changing the event changes the card
 * everybody sees when they forward it. It refreshes every ten minutes.
 *
 * Satori, which renders this, supports a subset of CSS, so it is built from plain flex boxes,
 * solid colours and inline SVG. Both organisers' marks are embedded as pictures read from
 * /public, the same two files the page uses.
 */

export const alt =
  "Mafia Wars — Sunday 22 November, 4:30 to 5:30 pm, The Social, Karachi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 600;

const CREAM = "#F2E7D0";
const RED = "#DB4247";
const GOLD = "#C9A46A";

type Details = {
  startDate?: string;
  startTime?: string;
  endTime?: string;
  venueName?: string;
  fee?: number;
  currency?: string;
};

/** The event as the page shows it, or nothing if it cannot be reached: the card still renders. */
async function eventDetails(): Promise<Details> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return {};
    const res = await fetch(`${url}/rest/v1/rpc/public_event_by_slug`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: "mafia-wars" }),
    });
    const rows = (await res.json()) as { out_data?: Details }[];
    return rows?.[0]?.out_data ?? {};
  } catch {
    return {};
  }
}

/**
 * Playfair Display, the page's own face, fetched as a font file for the renderer.
 *
 * Wrapped so a failure degrades to the default face instead of failing the image: a share card in
 * the wrong font is a small problem, and one that errors is a bare grey link again.
 */
async function fonts() {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,900;1,900&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());

    const faces = [
      ...css.matchAll(
        /font-style: (\w+);[\s\S]*?src: url\((https:\/\/[^)]+)\)/g,
      ),
    ];
    const loaded = await Promise.all(
      faces.map(async (f) => ({
        name: "Playfair",
        data: await fetch(f[2]).then((r) => r.arrayBuffer()),
        weight: 900 as const,
        style: (f[1] === "italic" ? "italic" : "normal") as "italic" | "normal",
      })),
    );
    return loaded;
  } catch {
    return [];
  }
}

async function dataUri(file: string): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), "public", "mafia", file));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image() {
  const [details, fontList, alphabattle, upstairs] = await Promise.all([
    eventDetails(),
    fonts(),
    dataUri("blufys-alphabattle.png"),
    dataUri("upstairs.png"),
  ]);

  const date = details.startDate ?? "2026-11-22";
  const when = [
    weekdayOf(date).slice(0, 3),
    posterDate(date),
    eventTimeLine(
      details.startTime ?? "16:30",
      details.endTime ?? "17:30",
    ).replace(" to ", " – "),
  ]
    .filter(Boolean)
    .join("  ·  ");
  const price = `${details.currency ?? "PKR"} ${(details.fee ?? 1400).toLocaleString("en-PK")} per head`;
  const serif = fontList.length ? "Playfair" : "serif";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background:
          "radial-gradient(ellipse at 28% 0%, #4a3220 0%, #1a120d 42%, #0e0a08 80%)",
        color: CREAM,
        fontFamily: serif,
      }}
    >
      {alphabattle ? (
        <img
          src={alphabattle}
          alt=""
          width={225}
          height={57}
          style={{ position: "absolute", left: 48, top: 40 }}
        />
      ) : null}
      {upstairs ? (
        <img
          src={upstairs}
          alt=""
          width={96}
          height={96}
          style={{ position: "absolute", right: 48, top: 30, borderRadius: 48 }}
        />
      ) : null}

      {/* The fedora, drawn as plain shapes. */}
      <svg
        width="190"
        height="110"
        viewBox="0 0 240 140"
        style={{ marginBottom: -18 }}
      >
        <path
          d="M4 96 C22 76 36 74 62 82 C90 90 150 90 178 82 C204 74 218 76 236 96 C214 118 168 126 120 126 C72 126 26 118 4 96 Z"
          fill="#CDBA93"
        />
        <path
          d="M62 90 C54 60 60 30 84 16 C96 10 106 18 120 32 C134 18 144 10 156 16 C180 30 186 60 178 90 C150 102 90 102 62 90 Z"
          fill="#EADCBD"
        />
        <path
          d="M61 82 C94 98 148 98 179 82 L180 95 C148 110 94 110 60 95 Z"
          fill="#15100D"
        />
      </svg>

      <div
        style={{
          display: "flex",
          fontSize: 196,
          fontWeight: 900,
          lineHeight: 0.86,
          letterSpacing: -4,
          color: CREAM,
        }}
      >
        MAFIA
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 150,
          fontWeight: 900,
          fontStyle: "italic",
          lineHeight: 0.9,
          marginTop: -26,
          marginLeft: 150,
          color: RED,
        }}
      >
        WARS
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 38,
          fontStyle: "italic",
          marginTop: 6,
          color: "#D9CCB2",
        }}
      >
        Will you be joining us?
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: 26,
          fontSize: 27,
          letterSpacing: 4,
          color: CREAM,
        }}
      >
        <span style={{ display: "flex", color: GOLD }}>
          {when.toUpperCase()}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          fontSize: 24,
          letterSpacing: 5,
          color: "#A99B83",
        }}
      >
        {`${(details.venueName ?? "The Social").toUpperCase()}  ·  ${price.toUpperCase()}  ·  FOOD INCLUDED`}
      </div>
    </div>,
    { ...size, fonts: fontList.length ? fontList : undefined },
  );
}
