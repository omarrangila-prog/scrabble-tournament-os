/**
 * A Scrabble tile, built to look like a piece of wood rather than a rounded square.
 *
 * What makes a tile read as real is not one effect but the stack of them, in the order
 * light actually works:
 *
 *  1. A wood base that is warmer at the top-left, where the light is.
 *  2. Grain — fine irregular streaks along the grain direction, not a regular pattern.
 *  3. A bevel: a bright top and left edge, a dark bottom and right one, inside the tile.
 *  4. The letter engraved rather than printed — a dark glyph with a one-pixel light shadow
 *     below it, which is what a cut into a surface looks like.
 *  5. A contact shadow under the tile, tight and dark, plus a wider soft one.
 *
 * Everything is CSS and inline SVG. No image files: a wooden tile as a PNG would be four
 * or five hundred kilobytes per variant and would still be the wrong size on some screen.
 *
 * Sizes are given in `em` against the tile's own font size, so one `size` prop scales the
 * whole thing — letter, value, bevel and radius together. That is what lets the same
 * component be a 64px hero tile and a 26px inline one without a second set of numbers.
 */

import type { CSSProperties } from "react";

/** The English Scrabble letter values. Blank is 0. */
export const TILE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  " ": 0,
};

export interface ScrabbleTileProps {
  letter: string;
  /**
   * Tile edge length. A number is pixels; a string is any CSS length, so a caller can
   * pass `1em` to inherit a parent's scale or a `clamp()` to size against the viewport.
   */
  size?: number | string;
  /** Degrees of tilt. Real tiles are never quite square to the rack. */
  rotate?: number;
  /**
   * Milliseconds before this tile settles into place. Staggering a word makes it read as
   * being laid down letter by letter rather than appearing as a block.
   */
  settleDelay?: number;
  /** Adds the slow idle drift, for tiles lying loose on the table. */
  drift?: string;
  /** Hides the point value, for a blank. */
  hideValue?: boolean;
  className?: string;
  style?: CSSProperties;
}

/*
 * Wood, sampled from a maple Scrabble tile: a pale warm yellow, not beige and not orange.
 * Kept as constants because the same values appear in the bevel and the grain, and a tile
 * whose edge is a different wood from its face stops looking like one object.
 */
const WOOD_LIT = "#F0DDB4";
const WOOD_MID = "#E4CB9B";
const WOOD_SHADE = "#CFAF76";
const WOOD_EDGE_DARK = "#A5854F";
const INK = "#3A2A17";

/**
 * The grain, as an SVG data URI.
 *
 * `feTurbulence` with a deliberately lopsided `baseFrequency` — dense across the tile,
 * sparse along it — gives streaks that run one way, which is what grain is. A symmetrical
 * frequency gives a cloud, and a cloud on a tile looks like dirt.
 */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
     <filter id='g'>
       <feTurbulence type='fractalNoise' baseFrequency='0.9 0.03' numOctaves='4' seed='7'/>
       <feColorMatrix type='saturate' values='0'/>
     </filter>
     <rect width='120' height='120' filter='url(%23g)' opacity='0.42'/>
   </svg>`,
)}")`;

export function ScrabbleTile({
  letter,
  size = 64,
  rotate = 0,
  hideValue = false,
  settleDelay,
  drift,
  className,
  style,
}: ScrabbleTileProps) {
  const glyph = letter.toUpperCase();
  const value = TILE_VALUES[glyph];
  const blank = glyph === " " || glyph === "";

  return (
    <span
      className={[className, "lp-tile", drift ? "lp-drift" : ""].filter(Boolean).join(" ")}
      aria-hidden
      style={{
        /*
         * The tilt is a custom property rather than a literal transform, because the
         * settle and drift animations both have to finish exactly here. A transform
         * declared inline would be overwritten by the animation and the tile would
         * snap square at the end.
         */
        ["--tilt" as string]: `${rotate}deg`,
        ...(settleDelay !== undefined ? { ["--settle" as string]: `${settleDelay}ms` } : {}),
        ...(drift ? { ["--drift" as string]: drift } : {}),

        /* One font size drives every measurement below. */
        fontSize: size,
        width: "1em",
        height: "1em",
        display: "inline-block",
        position: "relative",
        flex: "none",
        borderRadius: "0.11em",

        background: `
          radial-gradient(120% 120% at 22% 14%, ${WOOD_LIT} 0%, ${WOOD_MID} 48%, ${WOOD_SHADE} 100%)
        `,

        /*
         * Four shadows, outermost last: the bevel highlight and shade live inside the tile
         * as insets, then a tight contact shadow, then the soft cast one. Ordering matters —
         * the contact shadow is what stops a tile floating.
         */
        boxShadow: `
          inset 0.035em 0.035em 0.02em ${WOOD_LIT},
          inset -0.045em -0.05em 0.03em ${WOOD_EDGE_DARK}CC,
          inset 0 0 0.02em ${WOOD_EDGE_DARK}55,
          0 0.03em 0.02em rgba(58,42,23,0.42),
          0 0.09em 0.16em rgba(58,42,23,0.28)
        `,
        ...style,
      }}
    >
      {/* Grain, over the wood and under the letter. */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          backgroundImage: GRAIN,
          backgroundSize: "1.6em 1.6em",
          mixBlendMode: "multiply",
          opacity: 0.5,
        }}
      />

      {blank ? null : (
        <>
          {/* The letter, engraved: dark cut with a lit lower lip. */}
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              paddingRight: "0.04em",
              fontFamily: "var(--font-display), ui-serif, Georgia, serif",
              fontSize: "0.6em",
              fontWeight: 600,
              lineHeight: 1,
              color: INK,
              textShadow: `0 0.03em 0 ${WOOD_LIT}D9, 0 -0.012em 0.012em rgba(58,42,23,0.5)`,
            }}
          >
            {glyph}
          </span>

          {/* The value, tucked into the bottom-right corner as it is on a real tile. */}
          {hideValue || value === undefined ? null : (
            <span
              className="num"
              style={{
                position: "absolute",
                right: "0.1em",
                bottom: "0.06em",
                fontFamily: "var(--font-manrope), ui-sans-serif, system-ui",
                fontSize: "0.2em",
                fontWeight: 800,
                lineHeight: 1,
                color: INK,
                opacity: 0.86,
                textShadow: `0 0.06em 0 ${WOOD_LIT}B3`,
              }}
            >
              {value}
            </span>
          )}
        </>
      )}
    </span>
  );
}

/** What a word is worth, before any premium square. Unknown characters score nothing. */
export function wordScore(word: string): number {
  return [...word.toUpperCase()].reduce((total, l) => total + (TILE_VALUES[l] ?? 0), 0);
}

/**
 * A word in loose tiles, with no rack under it.
 *
 * The rack is a strong object and belongs to the hero alone. Everywhere else the tiles
 * need to behave like type — a label, a heading, an initial — so they sit directly on the
 * page and stay small.
 *
 * This is the piece that makes the tile a brand device rather than a one-off illustration:
 * the same wood, bevel and engraved letter at 20px as at 60px, because every measurement
 * inside a tile is in `em`.
 */
export function TileWord({
  word,
  size = 22,
  className,
  gap = "0.1em",
  showValues = false,
}: {
  word: string;
  size?: number | string;
  className?: string;
  gap?: string;
  /**
   * Point values are off by default here, and that is the rule that keeps the tile from
   * turning into noise: a value is a 0.2em glyph, so under about 24px it stops being a
   * number and becomes a smudge in the corner. Big tiles are objects and carry their
   * value; small tiles are type and carry only the letter.
   */
  showValues?: boolean;
}) {
  const letters = [...word.toUpperCase()];

  return (
    <span
      className={["lp-rack", className].filter(Boolean).join(" ")}
      role="img"
      aria-label={word}
      style={{ display: "inline-flex", flexWrap: "wrap", gap, fontSize: size }}
    >
      {letters.map((l, i) => (
        <ScrabbleTile
          key={`${l}-${i}`}
          letter={l}
          size="1em"
          hideValue={!showValues}
          /* Alternating hair-thin tilts: laid by hand, not printed. */
          rotate={i % 3 === 0 ? -1.1 : i % 3 === 1 ? 0.8 : -0.3}
          settleDelay={i * 38}
        />
      ))}
    </span>
  );
}

/**
 * A word in tiles, sitting on a wooden rack.
 *
 * The rack is what makes a row of tiles read as a Scrabble rack rather than as blocks in a
 * row: a lip in front, a shadowed groove the tiles stand in, and a darker wood than the
 * tiles so they separate from it.
 *
 * `size` is a CSS length, so a caller can pass a `clamp()` and let the whole rack size
 * itself to the viewport. Tiles wrap when they must, because a rack that overflows on a
 * phone is worse than a rack on two lines.
 */
export function TileRack({
  word,
  maxTile = 58,
  className,
}: {
  word: string;
  /** Upper bound on one tile, in pixels, so the rack stops growing on a wide screen. */
  maxTile?: number;
  className?: string;
}) {
  const letters = [...word.toUpperCase()];

  /*
   * The tile size is solved from the container width rather than the viewport.
   *
   * A viewport-based `clamp` cannot know how wide this column is, so on a two-column
   * layout the word broke: seven tiles on one line and a lone "E" underneath, which reads
   * as a bug rather than as a design. Here the rack is a container, and one tile is the
   * width that makes the whole word exactly fill it.
   *
   * Across the rack: n tiles of 1em, n-1 gaps of 0.12em, and 0.22em of padding each side.
   */
  const emsAcross = letters.length * 1.12 - 0.12 + 0.44;
  const tile = `min(${(100 / emsAcross).toFixed(2)}cqw, ${maxTile}px)`;

  return (
    /*
     * Two elements, not one. `cqw` resolves against an ancestor container, never against
     * the element declaring `container-type` — so the rack cannot both be the container and
     * be measured by it. The wrapper is the container; the rack reads from it.
     */
    <span
      className={className}
      style={{ containerType: "inline-size", display: "block", width: "100%" }}
    >
      <span
        role="img"
        aria-label={word}
        className="lp-rack"
        style={{
          display: "inline-flex",
          /* Never wraps: the size above is solved so the whole word fits on one line. */
          flexWrap: "nowrap",
          gap: "0.12em",
          fontSize: tile,
          padding: "0.18em 0.22em 0.3em",
          borderRadius: "0.14em",

          /* Rack wood: darker and redder than the tiles, lit from the same direction. */
          background: `
            linear-gradient(178deg, #6B4A2A 0%, #7C5733 26%, #5E3F23 100%)
          `,
          backgroundBlendMode: "multiply",
          boxShadow: `
            inset 0 0.05em 0.03em rgba(255,232,196,0.35),
            inset 0 -0.06em 0.05em rgba(0,0,0,0.45),
            inset 0 0.2em 0.14em rgba(0,0,0,0.35),
            0 0.12em 0.22em rgba(58,42,23,0.36),
            0 0.02em 0.04em rgba(58,42,23,0.4)
          `,
        }}
      >
        {letters.map((l, i) => (
          <ScrabbleTile
            key={`${l}-${i}`}
            letter={l}
            /* One em of the rack's own size, so the solved size is the only scale decision. */
            size="1em"
            rotate={i % 2 === 0 ? -0.6 : 0.5}
            /* Laid left to right, a beat apart. */
            settleDelay={90 + i * 62}
          />
        ))}
      </span>
    </span>
  );
}
