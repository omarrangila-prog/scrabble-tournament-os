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

/** Spells a word in tiles. Words are intentional and always readable. */
export function TileWord({
  word,
  size = 52,
  gap = 6,
  tone = "wood",
  className,
  float = false,
}: {
  word: string;
  size?: number;
  gap?: number;
  tone?: "wood" | "glass" | "gold";
  className?: string;
  float?: boolean;
}) {
  return (
    <span className={cn("inline-flex", className)} style={{ gap }} aria-label={word}>
      {word.split("").map((letter, i) => (
        <LetterTile
          key={`${letter}-${i}`}
          letter={letter}
          size={size}
          tone={tone}
          className={float ? (i % 2 === 0 ? "float-soft" : "float-soft-slow") : undefined}
          style={float ? { animationDelay: `${i * 220}ms` } : undefined}
        />
      ))}
    </span>
  );
}

/**
 * A dimensional Scrabble board in perspective, lit from within.
 *
 * Built from layered CSS transforms rather than a bitmap so it stays crisp at
 * any size and costs nothing to download. The board carries real thickness, a
 * cast shadow and violet/cyan rim light, matching the championship art
 * direction.
 */
export function ScrabbleBoard({
  className,
  size = 420,
  word = "TOURNAMENT",
}: {
  className?: string;
  size?: number;
  /** Word laid across the centre row. Kept short and intentional. */
  word?: string;
}) {
  const GRID = 11;
  const cell = size / GRID;
  const depth = Math.max(10, size * 0.035);

  // Premium squares, mirrored for a believable board without a full 15×15.
  const premium: Record<string, string> = {
    "0-0": "tw", "0-10": "tw", "10-0": "tw", "10-10": "tw",
    "0-5": "tl", "5-0": "tl", "10-5": "tl", "5-10": "tl",
    "1-1": "dw", "9-9": "dw", "1-9": "dw", "9-1": "dw",
    "2-2": "dl", "8-8": "dl", "2-8": "dl", "8-2": "dl",
    "3-3": "dw", "7-7": "dw", "3-7": "dw", "7-3": "dw",
    "1-5": "dl", "5-1": "dl", "9-5": "dl", "5-9": "dl",
    "5-5": "star",
  };

  const fill: Record<string, string> = {
    tw: "linear-gradient(150deg, rgba(234,85,114,0.34), rgba(234,85,114,0.18))",
    dw: "linear-gradient(150deg, rgba(255,155,117,0.34), rgba(255,155,117,0.18))",
    dl: "linear-gradient(150deg, rgba(57,135,248,0.32), rgba(57,135,248,0.16))",
    tl: "linear-gradient(150deg, rgba(85,201,232,0.36), rgba(85,201,232,0.18))",
    star: "linear-gradient(150deg, rgba(115,87,246,0.40), rgba(115,87,246,0.22))",
  };

  const startCol = Math.max(0, Math.floor((GRID - word.length) / 2));

  return (
    <div
      className={cn("relative select-none", className)}
      style={{ width: size, height: size, perspective: size * 2.6 }}
      aria-hidden
    >
      {/* Ground glow beneath the board */}
      <div
        className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: size * 1.05,
          height: size * 0.52,
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(115,87,246,0.42), rgba(85,201,232,0.20) 46%, transparent 72%)",
          filter: `blur(${size * 0.06}px)`,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          transform: "rotateX(58deg) rotateZ(-42deg) translateZ(0)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Board edge — gives real thickness */}
        <div
          className="absolute inset-0"
          style={{
            borderRadius: size * 0.045,
            background: "linear-gradient(160deg, #4A3F86, #2C2559)",
            transform: `translateZ(-${depth}px)`,
            boxShadow: `0 ${size * 0.16}px ${size * 0.2}px rgba(28,22,64,0.42)`,
          }}
        />

        {/* Board face */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            borderRadius: size * 0.045,
            background:
              "linear-gradient(152deg, #FFFFFF 0%, #F2F1FE 42%, #E6E9FB 100%)",
            border: `${Math.max(2, size * 0.007)}px solid rgba(255,255,255,0.92)`,
            boxShadow: "inset 0 2px 0 rgba(255,255,255,0.96)",
          }}
        >
          {/* Internal illumination */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(46% 46% at 32% 26%, rgba(115,87,246,0.20), transparent 68%), radial-gradient(42% 42% at 74% 76%, rgba(85,201,232,0.22), transparent 70%)",
            }}
          />

          <div
            className="absolute"
            style={{
              inset: cell * 0.3,
              display: "grid",
              gridTemplateColumns: `repeat(${GRID}, 1fr)`,
              gap: cell * 0.075,
            }}
          >
            {Array.from({ length: GRID * GRID }, (_, i) => {
              const r = Math.floor(i / GRID);
              const c = i % GRID;
              const kind = premium[`${r}-${c}`];
              return (
                <div
                  key={i}
                  style={{
                    borderRadius: cell * 0.16,
                    background: kind ? fill[kind] : "rgba(45,57,89,0.055)",
                    boxShadow: kind
                      ? "inset 0 0 0 1px rgba(255,255,255,0.62)"
                      : "inset 0 0 0 1px rgba(255,255,255,0.42)",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Played word, raised off the board with its own shadow */}
        <div
          className="absolute flex"
          style={{
            left: cell * 0.3 + startCol * (cell + cell * 0.075),
            top: cell * 0.3 + 5 * (cell + cell * 0.075),
            gap: cell * 0.075,
            transform: `translateZ(${cell * 0.5}px)`,
          }}
        >
          {word.split("").map((l, i) => (
            <LetterTile key={i} letter={l} size={cell} />
          ))}
        </div>
      </div>

      {/* Rim light along the leading edge */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(38% 22% at 26% 74%, rgba(85,201,232,0.34), transparent 70%)",
          filter: `blur(${size * 0.03}px)`,
        }}
      />
    </div>
  );
}

/** Gold championship trophy with a lit rim and cast shadow. */
export function ChampionshipTrophy({
  size = 180,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("relative select-none", className)} style={{ width: size }} aria-hidden>
      {/* Glow behind the cup */}
      <div
        className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: size * 1.15,
          height: size * 1.15,
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(230,169,61,0.42), rgba(255,184,137,0.16) 48%, transparent 72%)",
          filter: `blur(${size * 0.07}px)`,
        }}
      />
      <svg viewBox="0 0 120 150" width={size} height={size * 1.25} className="relative">
        <defs>
          <linearGradient id="tos-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFF3CE" />
            <stop offset="30%" stopColor="#F3CE74" />
            <stop offset="62%" stopColor="#E6A93D" />
            <stop offset="100%" stopColor="#A9741A" />
          </linearGradient>
          <linearGradient id="tos-gold-soft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F9DFA0" />
            <stop offset="100%" stopColor="#C68B24" />
          </linearGradient>
          <linearGradient id="tos-plinth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A3F86" />
            <stop offset="100%" stopColor="#2C2559" />
          </linearGradient>
          <filter id="tos-trophy-shadow" x="-60%" y="-30%" width="220%" height="190%">
            <feDropShadow dx="0" dy="9" stdDeviation="9" floodColor="#27305C" floodOpacity="0.3" />
          </filter>
        </defs>

        <g filter="url(#tos-trophy-shadow)">
          {/* Handles behind the cup */}
          <path
            d="M32 24 h-13 a13 13 0 0 0 13 23"
            fill="none"
            stroke="url(#tos-gold-soft)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M88 24 h13 a13 13 0 0 1 -13 23"
            fill="none"
            stroke="url(#tos-gold-soft)"
            strokeWidth="7"
            strokeLinecap="round"
          />

          {/* Cup */}
          <path d="M31 15 h58 v27 a29 29 0 0 1 -58 0 z" fill="url(#tos-gold)" />
          {/* Lip */}
          <rect x="28" y="12" width="64" height="7" rx="3.5" fill="url(#tos-gold-soft)" />
          {/* Specular highlight */}
          <path
            d="M40 21 h7 v21 a11 11 0 0 0 5 9 c-8 -2 -12 -11 -12 -19 z"
            fill="rgba(255,255,255,0.6)"
          />

          {/* Stem and base */}
          <path d="M54 70 h12 v20 h-12 z" fill="url(#tos-gold-soft)" />
          <path d="M42 90 h36 l-4 9 h-28 z" fill="url(#tos-gold)" />
          <rect x="30" y="99" width="60" height="15" rx="4" fill="url(#tos-plinth)" />
          <rect x="38" y="104" width="44" height="6" rx="3" fill="rgba(255,255,255,0.16)" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Composite championship scene: an illuminated board, the trophy and floating
 * tiles under violet and cyan light. Used on marketing and welcome surfaces.
 */
export function ChampionshipScene({ className }: { className?: string }) {
  return (
    <div className={cn("relative select-none", className)} aria-hidden>
      {/* Environmental light */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(40% 44% at 28% 30%, rgba(115,87,246,0.34), transparent 70%),
            radial-gradient(36% 40% at 76% 62%, rgba(85,201,232,0.30), transparent 72%),
            radial-gradient(32% 36% at 58% 12%, rgba(255,144,203,0.24), transparent 74%),
            radial-gradient(30% 34% at 16% 78%, rgba(255,184,137,0.20), transparent 74%)`,
          filter: "blur(10px)",
        }}
      />

      <div className="relative aspect-square w-full">
        {/* Board fills the scene */}
        <div className="absolute inset-x-0 top-[6%] flex justify-center">
          <ScrabbleBoard size={360} className="float-soft-slow w-full max-w-[360px]" />
        </div>

        {/* Trophy, front-right, standing proud of the board */}
        <div
          className="absolute bottom-[2%] right-[2%] float-soft"
          style={{ animationDelay: "700ms" }}
        >
          <ChampionshipTrophy size={124} />
        </div>

        {/* Floating tiles catching the light */}
        <div className="absolute left-[2%] top-[16%] float-soft" style={{ animationDelay: "200ms" }}>
          <LetterTile letter="P" size={52} />
        </div>
        <div
          className="absolute right-[12%] top-[4%] float-soft-slow"
          style={{ animationDelay: "900ms" }}
        >
          <LetterTile letter="L" size={44} tone="glass" />
        </div>
        <div
          className="absolute bottom-[26%] left-[0%] float-soft-slow"
          style={{ animationDelay: "1200ms" }}
        >
          <LetterTile letter="A" size={48} tone="gold" />
        </div>
        <div className="absolute right-[4%] top-[28%] float-soft" style={{ animationDelay: "450ms" }}>
          <LetterTile letter="Y" size={40} />
        </div>
      </div>
    </div>
  );
}
