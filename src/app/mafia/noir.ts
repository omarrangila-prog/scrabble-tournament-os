/**
 * The poster's colours, taken from the artwork: a near-black brown, newsprint cream, tobacco
 * gold for the hairlines, and the red of the second word. Kept in one place so the page, the form
 * and the confirmation cannot drift apart.
 */
export const NOIR = {
  bg: "#0E0A08",
  card: "rgba(26, 18, 13, 0.86)",
  field: "#140E0B",
  cream: "#F2E7D0",
  soft: "#D9CCB2",
  muted: "#A99B83",
  gold: "#C9A46A",
  line: "rgba(242, 231, 208, 0.14)",
  red: "#B3262B",
  redBright: "#DB4247",
  /* The three faces from `layout.tsx`, each with a safe fallback while it loads. */
  serif:
    'var(--font-noir-serif), "Playfair Display", Georgia, "Times New Roman", serif',
  brush: 'var(--font-noir-brush), "Kaushan Script", "Brush Script MT", cursive',
  script:
    'var(--font-noir-script), "Pinyon Script", "Snell Roundhand", cursive',
} as const;
