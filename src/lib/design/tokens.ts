/**
 * Premium Championship Glass — design tokens.
 *
 * Single source of truth for values that need to exist in TypeScript as well as
 * CSS: chart palettes, motion timings and breakpoints. Colour and surface tokens
 * live in `globals.css` as CSS variables so a theme switch re-skins the product
 * without a re-render.
 */

/** Brand ramp. Mirrors the `--color-*` entries in globals.css. */
export const COLOR = {
  violet: "#7357F6",
  violetDeep: "#5741DA",
  blue: "#3987F8",
  cyan: "#55C9E8",
  mint: "#38C89A",
  gold: "#E6A93D",
  peach: "#FF9B75",

  success: "#20B982",
  warning: "#F2A23B",
  critical: "#EA5572",
  info: "#3A85F7",

  ink: "#12172A",
  muted: "#667085",
  faint: "#98A2B3",
} as const;

/**
 * Ordered categorical palette for charts. Hues are spaced far enough apart to
 * stay separable, and each carries a distinct lightness so the series remain
 * distinguishable in greyscale and for colour-vision deficiency.
 */
export const CHART_SERIES = [
  COLOR.violet,
  COLOR.blue,
  COLOR.cyan,
  COLOR.gold,
  COLOR.mint,
  COLOR.peach,
] as const;

/** Division identity colours, used consistently across every screen. */
export const DIVISION_COLOR: Record<string, string> = {
  masters: COLOR.violet,
  open: COLOR.blue,
  "recreational": COLOR.mint,
  "beginner": COLOR.gold,
};

