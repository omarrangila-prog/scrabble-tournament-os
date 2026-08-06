"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Scrabble letter tiles, drawn rather than illustrated.
 *
 * The public pages needed visual assets and had none. Stock artwork would sit
 * badly against a real printed poster, so these are built from the game itself:
 * a wooden tile with a letter and its point value. They cost nothing to load,
 * scale to any size, and cannot look dated the way a stock illustration can.
 *
 * Point values are the real ones from the English Scrabble distribution. A tile
 * showing the wrong score would be an odd thing to get wrong on a page
 * advertising a Scrabble event.
 */
const POINTS: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1,
  M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
  Y: 4, Z: 10,
};

const CREAM = "#F5F0E4";
const BROWN = "#3E2F23";

export function Tile({
  letter,
  size = 56,
  rotate = 0,
  className,
}: {
  letter: string;
  size?: number;
  /** Slight rotation, so a row of tiles looks placed rather than printed. */
  rotate?: number;
  className?: string;
}) {
  const upper = letter.toUpperCase();
  const points = POINTS[upper];

  return (
    <span
      className={cn(
        "tile-face relative inline-grid shrink-0 place-items-center rounded-[18%] font-display",
        className,
      )}
      style={{
        width: size,
        height: size,
        transform: `rotate(${rotate}deg)`,
        background: `linear-gradient(160deg, #FBF6EA 0%, ${CREAM} 55%, #E8DFC9 100%)`,
        color: BROWN,
      }}
      aria-hidden
    >
      <span
        className="leading-none"
        style={{ fontSize: size * 0.52, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        {upper}
      </span>
      {points ? (
        <span
          className="absolute font-sans leading-none"
          style={{
            right: size * 0.11,
            bottom: size * 0.09,
            fontSize: size * 0.2,
            fontWeight: 700,
            opacity: 0.72,
          }}
        >
          {points}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A word spelled in tiles, dropping in one tile at a time.
 *
 * `aria-label` carries the word so the animation is decoration rather than
 * content a screen reader has to piece together letter by letter.
 */
export function TileWord({
  word,
  size = 56,
  gap = 6,
  className,
  animate = true,
}: {
  word: string;
  size?: number;
  gap?: number;
  className?: string;
  animate?: boolean;
}) {
  const letters = word.split("");

  return (
    <span
      role="img"
      aria-label={word}
      className={cn("inline-flex flex-wrap items-center justify-center", className)}
      style={{ gap }}
    >
      {letters.map((l, i) =>
        l.trim() === "" ? (
          <span key={i} style={{ width: size * 0.35 }} />
        ) : (
          <motion.span
            key={i}
            initial={animate ? { opacity: 0, y: -14, rotate: 0 } : false}
            animate={{ opacity: 1, y: 0, rotate: i % 2 ? 1.6 : -1.6 }}
            transition={{
              duration: 0.45,
              delay: animate ? 0.06 * i : 0,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="inline-flex"
          >
            <Tile letter={l} size={size} />
          </motion.span>
        ),
      )}
    </span>
  );
}
