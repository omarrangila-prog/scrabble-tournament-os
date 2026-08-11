import type * as React from "react";

/**
 * The public site's palette.
 *
 * The page was cream, forest and gold — warm, safe, and flat. The problem was not the
 * hues but the value range: everything sat within a narrow band of light tones, so
 * nothing could be bright, no edge could catch light, and the wooden tiles had nothing
 * to glow against.
 *
 * This moves the ground to a deep forest ink and lets everything else be lit against it.
 * Pale maple tiles read as objects under a lamp rather than as beige shapes on beige.
 * That single decision is what makes the rest — brass edges, foil headings, a felt table
 * — available at all.
 *
 * Brass is treated as a metal, not a colour. A metal is at least three stops (a highlight,
 * a body and a shadow) travelling across a surface; one flat gold is what makes a page
 * look like it is imitating luxury rather than having any.
 */

/* Ground: a forest so deep it reads as ink, with green still in it. */
export const NIGHT = "#0A1811";
export const NIGHT_DEEP = "#060F0A";

/* Raised surfaces — the baize of a card table, lit from above. */
export const FELT = "#123021";
export const FELT_LIT = "#18402C";

/* Living green, for anything that should look switched on. */
export const EMERALD = "#1E7A4C";
export const EMERALD_LIT = "#279A60";

/*
 * Brass, in three stops. Used as a gradient wherever it stands for metal — a rule, an
 * edge, a heading — and as BRASS alone only for small text, where a gradient would be
 * illegible.
 */
export const BRASS_LIT = "#F0D493";
export const BRASS = "#D8AC5A";
export const BRASS_DEEP = "#8A6420";

/** Claret, for the one accent that is neither green nor gold. Used sparingly. */
export const CLARET = "#7E2437";

/* Warm ivory rather than white: white on a warm dark ground reads as a hole in it. */
export const IVORY = "#F4EBD9";
export const IVORY_SOFT = "rgba(244,235,217,0.78)";
export const IVORY_FAINT = "rgba(244,235,217,0.55)";

/** A hairline of metal. Brighter at the top, where the light is. */
export const BRASS_EDGE = "rgba(216,172,90,0.34)";

/**
 * The metal itself, as a background — for foil text via `background-clip`, and for rules.
 * The stops are deliberately uneven: real metal has a narrow hot band, not a smooth ramp.
 */
export const BRASS_FOIL = `linear-gradient(100deg, ${BRASS_DEEP} 0%, ${BRASS} 18%, ${BRASS_LIT} 34%, ${BRASS} 52%, ${BRASS_DEEP} 78%, ${BRASS} 100%)`;

/** Foil text. Applied inline because it needs both the clip and the transparent fill. */
export const foilText = {
  background: BRASS_FOIL,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
} as const;

/**
 * A lit panel: a bright inner top edge, a dark inner bottom, and a deep cast shadow.
 *
 * This is the whole trick behind a surface looking raised on a dark ground — light lands
 * on its top edge and falls away underneath. A border alone gives an outline, which reads
 * as a drawing of a panel rather than a panel.
 */
export const raised = (glow = 0.5) =>
  `inset 0 1px 0 rgba(244,235,217,0.12),
   inset 0 -1px 0 rgba(0,0,0,0.38),
   0 1px 0 rgba(0,0,0,0.45),
   0 2px 4px rgba(0,0,0,${0.26 * glow + 0.1}),
   0 8px 18px rgba(0,0,0,${0.22 * glow + 0.08}),
   0 28px 64px rgba(0,0,0,${0.34 * glow + 0.14})`;

/**
 * The same surface with the light turned up — for a pointer hovering it.
 *
 * A hover state that only moves an element is a card sliding on a flat page. A real object
 * lifting away from a surface does two more things: its shadow spreads and softens as the
 * gap grows, and its top edge catches more light. Both are here, and the transition on
 * `.lp-lift` is what makes them arrive together.
 */
export const raisedHover = (glow = 0.5) =>
  `inset 0 1px 0 rgba(244,235,217,0.20),
   inset 0 -1px 0 rgba(0,0,0,0.38),
   0 1px 0 rgba(0,0,0,0.45),
   0 4px 10px rgba(0,0,0,${0.26 * glow + 0.12}),
   0 16px 34px rgba(0,0,0,${0.24 * glow + 0.1}),
   0 44px 92px rgba(0,0,0,${0.38 * glow + 0.16})`;

/**
 * The pair of shadows a lifting surface needs, as custom properties.
 *
 * `.lp-lift` swaps between them on hover in CSS, so the resting and hovered shadows are
 * declared together in one place instead of drifting apart in two.
 */
export const liftVars = (glow = 0.5) =>
  ({ "--sh": raised(glow), "--sh-hover": raisedHover(glow) }) as React.CSSProperties;
