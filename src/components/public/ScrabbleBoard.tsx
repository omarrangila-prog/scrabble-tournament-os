/**
 * The board, and the paper the page is printed on.
 *
 * Both are decoration, so both are `aria-hidden` and neither is in the tab order. What
 * they are for is texture: a flat cream page reads as a website, and a page with grain,
 * a board and a warm vignette reads as a table with a game on it.
 *
 * The premium squares are the real Scrabble layout, not an approximation. Anybody who has
 * played will read a wrong board as wrong without being able to say why — the triple words
 * sit on the edges at the corners and the middles, the double-word squares run the two
 * diagonals, and the star is the centre. Getting that right is most of the realism.
 */

import type { CSSProperties } from "react";

/**
 * The 15×15 premium squares.
 *
 * `3` triple word, `2` double word, `t` triple letter, `d` double letter, `*` the centre
 * star, `.` plain. Written out rather than generated: the layout is symmetric but not
 * regular, and a clever generator would be harder to check against a real board.
 */
const BOARD: string[] = [
  "3..d...3...d..3",
  ".2...t...t...2.",
  "..2...d.d...2..",
  "d..2...d...2..d",
  "....2.....2....",
  ".t...t...t...t.",
  "..d...d.d...d..",
  "3..d...*...d..3",
  "..d...d.d...d..",
  ".t...t...t...t.",
  "....2.....2....",
  "d..2...d...2..d",
  "..2...d.d...2..",
  ".2...t...t...2.",
  "3..d...3...d..3",
];

/* Board colours, from a physical set: the reds are warm, the blues are dusty. */
const SQUARE: Record<string, string> = {
  "3": "#D2503C",
  "2": "#E9A79C",
  t: "#2E6E96",
  d: "#A9CEDE",
  "*": "#E9A79C",
  ".": "#E6DCC3",
};

/**
 * Fine paper grain, as an SVG data URI.
 *
 * A high `baseFrequency` gives grain rather than cloud, and desaturating it keeps it from
 * tinting the page. Multiplied over the background at low opacity it does what a paper
 * stock does: takes the flatness off without being visible as a pattern.
 */
export const PAPER_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>
     <filter id='p'>
       <feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch' seed='3'/>
       <feColorMatrix type='saturate' values='0'/>
     </filter>
     <rect width='180' height='180' filter='url(%23p)' opacity='0.55'/>
   </svg>`,
)}")`;

/** Coarser weave, for the wooden and felt surfaces where the grain should read heavier. */
export const LINEN_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>
     <filter id='l'>
       <feTurbulence type='turbulence' baseFrequency='0.16 0.5' numOctaves='3' seed='11'/>
       <feColorMatrix type='saturate' values='0'/>
     </filter>
     <rect width='140' height='140' filter='url(%23l)' opacity='0.5'/>
   </svg>`,
)}")`;

/**
 * A Scrabble board, drawn in CSS grid.
 *
 * `size` is any CSS length and the whole board scales from it, so the caller decides how
 * much of the viewport this takes. Squares are `aspect-ratio: 1` inside a 15-column grid,
 * which keeps them square at every size without a single hard-coded pixel.
 */
export function ScrabbleBoard({
  size = "min(78vw, 560px)",
  className,
  style,
}: {
  size?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      aria-hidden
      style={{
        width: size,
        aspectRatio: "1",
        padding: "2.4%",
        borderRadius: "1.6%",

        /* The board's own border is a darker card stock than its squares. */
        background: "linear-gradient(160deg, #CFC3A4 0%, #C2B492 55%, #B3A47F 100%)",
        boxShadow: `
          inset 0 0 0 0.5% rgba(58,42,23,0.16),
          0 1.6% 3.4% rgba(45,32,18,0.3)
        `,
        ...style,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(15, 1fr)",
          gap: "1.1%",
          width: "100%",
          height: "100%",
        }}
      >
        {BOARD.flatMap((row, y) =>
          [...row].map((cell, x) => (
            <span
              key={`${x}-${y}`}
              style={{
                aspectRatio: "1",
                borderRadius: "8%",
                background: SQUARE[cell] ?? SQUARE["."],
                /* Each square is slightly recessed, which is what a printed board looks like. */
                boxShadow:
                  "inset 0 0.06em 0.04em rgba(255,255,255,0.4), inset 0 -0.05em 0.05em rgba(58,42,23,0.14)",
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}
