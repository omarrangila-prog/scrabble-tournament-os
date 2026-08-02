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

/** Semantic result colours for win/loss/draw across tables, charts and heatmaps. */
export const RESULT_COLOR = {
  win: COLOR.success,
  loss: COLOR.critical,
  draw: COLOR.warning,
  bye: COLOR.blue,
  pending: COLOR.faint,
} as const;

/** Motion durations in milliseconds, per the motion specification. */
export const MOTION = {
  press: 120,
  hover: 150,
  drawer: 240,
  modal: 260,
  page: 300,
  guided: 450,
} as const;

/** Framer Motion easing curves. Restrained spring, minimal bounce. */
export const EASE = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  spring: { type: "spring", stiffness: 320, damping: 32, mass: 0.9 } as const,
};

/** Shared Recharts tooltip styling so every chart reads identically. */
export const CHART_TOOLTIP = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.76)",
  background: "rgba(255,255,255,0.96)",
  fontSize: 12,
  boxShadow: "0 16px 42px rgba(39,48,92,0.12)",
  padding: "8px 12px",
} as const;

/** Axis styling shared by every chart. */
export const CHART_AXIS = {
  tick: { fontSize: 11, fill: COLOR.muted },
  axisLine: false,
  tickLine: false,
} as const;

export const CHART_GRID = {
  strokeDasharray: "3 3",
  stroke: "rgba(45,57,89,0.08)",
  vertical: false,
} as const;

/** Breakpoints the layout is verified against. */
export const BREAKPOINT = {
  mobileSm: 360,
  mobile: 390,
  mobileLg: 430,
  tablet: 768,
  tabletLg: 1024,
  laptop: 1280,
  desktop: 1440,
  desktopLg: 1600,
} as const;

/** Shell geometry. */
export const SHELL = {
  sidebar: 260,
  sidebarCollapsed: 82,
  topbar: 72,
  maxWidth: 1680,
} as const;
