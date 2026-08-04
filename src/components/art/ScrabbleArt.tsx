"use client";

/**
 * Championship artwork.
 *
 * Original dimensional Scrabble pieces drawn as inline SVG/CSS rather than
 * bitmaps: they stay crisp at any size, theme with the rest of the product and
 * cost nothing to download. Used only on marketing, welcome and broadcast
 * surfaces — operational screens stay data-focused.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/** Point values for the demo tiles, matching standard Scrabble scoring. */
const TILE_POINTS: Record<string, number> = {
  A: 1, C: 3, D: 2, E: 1, H: 4, I: 1, L: 1, M: 3, N: 1,
  O: 1, P: 3, R: 1, S: 1, U: 1, W: 4, Y: 4,
};

/**
 * A single wooden letter tile with a bevelled edge and soft cast shadow.
 */
export function LetterTile({
  letter,
  size = 56,
  className,
  style,
  tone = "wood",
}: {
  letter: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  tone?: "wood" | "glass" | "gold";
}) {
  const points = TILE_POINTS[letter.toUpperCase()] ?? 1;

  const surface =
    tone === "gold"
      ? "linear-gradient(150deg, #F6DCA0 0%, #E6A93D 55%, #C8892A 100%)"
      : tone === "glass"
        ? "linear-gradient(150deg, rgba(255,255,255,0.92), rgba(238,240,255,0.72))"
        : "linear-gradient(150deg, #FFF6E4 0%, #F4E2C0 48%, #E4CB9E 100%)";

  const ink = tone === "gold" ? "#5A3D07" : tone === "glass" ? "#3C3577" : "#6B4E24";

  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center select-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.19,
        background: surface,
        boxShadow: `
          inset 0 ${size * 0.035}px 0 rgba(255,255,255,0.85),
          inset 0 -${size * 0.05}px ${size * 0.07}px rgba(120,86,38,0.28),
          0 ${size * 0.14}px ${size * 0.3}px rgba(39,48,92,0.22)`,
        ...style,
      }}
      aria-hidden
    >
      <span
        style={{
          fontSize: size * 0.46,
          fontWeight: 800,
          color: ink,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {letter.toUpperCase()}
      </span>
      <span
        className="num absolute"
        style={{
          right: size * 0.11,
          bottom: size * 0.07,
          fontSize: size * 0.19,
          fontWeight: 700,
          color: ink,
          opacity: 0.75,
        }}
      >
        {points}
      </span>
    </span>
  );
}

