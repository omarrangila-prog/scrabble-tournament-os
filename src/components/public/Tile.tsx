"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const CREAM = "#F5F0E4";
const BROWN = "#3E2F23";

/** Real English Scrabble values. A wrong score on a Scrabble page is a bad look. */
const POINTS: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1,
  M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
  Y: 4, Z: 10,
};

/**
 * A Scrabble tile, drawn rather than illustrated.
 *
 * The public pages needed real visual character and had none. Stock artwork or
 * generated illustration would sit badly beside a printed poster; a tile is the
 * one motif that belongs to the subject itself, costs nothing to load, and
 * cannot date.
 *
 * Used sparingly as accent, never as wallpaper.
 */
export function Tile({
  letter,
  size = 52,
  rotate = 0,
  className,
  style,
}: {
  letter: string;
  size?: number;
  rotate?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const upper = letter.toUpperCase();
  const points = POINTS[upper];

  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 place-items-center rounded-[18%]", className)}
      style={{
        width: size,
        height: size,
        transform: `rotate(${rotate}deg)`,
        background: `linear-gradient(158deg, #FDFAF2 0%, ${CREAM} 52%, #E7DDC6 100%)`,
        color: BROWN,
        boxShadow:
          "inset 0 2px 0 rgba(255,255,255,0.7), inset 0 -3px 0 rgba(62,47,35,0.14), 0 6px 18px rgba(62,47,35,0.16)",
        ...style,
      }}
    >
      <span
        className="leading-none"
        style={{ fontSize: size * 0.5, fontWeight: 800, letterSpacing: "-0.03em" }}
      >
        {upper}
      </span>
      {points ? (
        <span
          className="absolute leading-none"
          style={{
            right: size * 0.1,
            bottom: size * 0.08,
            fontSize: size * 0.2,
            fontWeight: 700,
            opacity: 0.66,
          }}
        >
          {points}
        </span>
      ) : null}
    </span>
  );
}
