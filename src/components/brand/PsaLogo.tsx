"use client";

/**
 * Pakistan Scrabble Association — brand identity.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SWAPPING IN THE OFFICIAL ARTWORK
 *
 * Drop the supplied logo file into `public/` as `psa-logo.png` (or .svg) and
 * set `USE_SUPPLIED_ASSET = true` below. Every placement across the product —
 * login, sidebar, dashboards, check-in, player cards, public site, broadcast,
 * reports and certificates — reads from this one component, so no other file
 * needs to change.
 *
 * Until then the mark below is rendered as vector artwork matching the supplied
 * design: a gold-bordered green diamond shield carrying P/S/A Scrabble tiles,
 * with the association name set around the edge. Proportions and colours are
 * preserved; the artwork is never stretched, cropped or recoloured.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/** Flip to true once `public/psa-logo.png` is in place. */
const USE_SUPPLIED_ASSET = false;
const SUPPLIED_ASSET_PATH = "/psa-logo.png";

/** Official brand palette, sampled from the association mark. */
export const PSA_BRAND = {
  green: "#1A7A3C",
  greenDeep: "#0F5C2A",
  gold: "#C9A227",
  goldLight: "#E8C65A",
  tile: "#F6EAD2",
  tileInk: "#2B2416",
  cream: "#FFF9EC",
} as const;

export type LogoVariant = "full" | "mark" | "lockup" | "stacked";

/**
 * The association mark. `mark` is the shield alone for compact spaces;
 * `lockup` and `stacked` add the wordmark for prominent placements.
 */
export function PsaLogo({
  variant = "mark",
  size = 40,
  className,
  /** Adds a light glass plate behind the mark for contrast on busy artwork. */
  plate = false,
  title = "Pakistan Scrabble Association",
}: {
  variant?: LogoVariant;
  size?: number;
  className?: string;
  plate?: boolean;
  title?: string;
}) {
  const mark = plate ? (
    <span
      className="grid shrink-0 place-items-center rounded-[26%] bg-white shadow-[0_2px_8px_rgba(20,27,56,0.12)]"
      style={{ width: size, height: size, padding: size * 0.08 }}
    >
      <PsaMark size={size * 0.84} title={title} />
    </span>
  ) : (
    <PsaMark size={size} title={title} />
  );

  if (variant === "mark") {
    return <span className={cn("inline-grid shrink-0", className)}>{mark}</span>;
  }

  if (variant === "stacked") {
    return (
      <span className={cn("inline-flex flex-col items-center gap-2 text-center", className)}>
        {mark}
        <span className="leading-tight">
          <span className="block text-[13px] font-extrabold tracking-[-0.01em] text-ink">
            Pakistan Scrabble Association
          </span>
        </span>
      </span>
    );
  }

  // full / lockup — mark beside the wordmark
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      {mark}
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14.5px] font-extrabold tracking-[-0.02em] text-ink">
          Pakistan Scrabble Association
        </span>
        {variant === "full" ? (
          <span className="block truncate text-[11px] font-medium text-muted">
            Tournament OS
          </span>
        ) : null}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/** The shield itself, drawn to the supplied proportions. */
function PsaMark({ size, title }: { size: number; title: string }) {
  const uid = React.useId();

  if (USE_SUPPLIED_ASSET) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={SUPPLIED_ASSET_PATH}
        alt={title}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  const gold = `psa-gold-${uid}`;
  const green = `psa-green-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className="shrink-0"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={PSA_BRAND.goldLight} />
          <stop offset="52%" stopColor={PSA_BRAND.gold} />
          <stop offset="100%" stopColor="#A8861C" />
        </linearGradient>
        <linearGradient id={green} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={PSA_BRAND.green} />
          <stop offset="100%" stopColor={PSA_BRAND.greenDeep} />
        </linearGradient>
      </defs>

      {/* Gold shield border */}
      <path
        d="M50 4 L96 50 L50 96 L4 50 Z"
        fill={`url(#${gold})`}
        stroke="#8E7016"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Green field */}
      <path d="M50 12 L88 50 L50 88 L12 50 Z" fill={`url(#${green})`} />

      {/* Association name, curved around the field */}
      <path id={`${uid}-tl`} d="M22 46 L46 22" fill="none" />
      <path id={`${uid}-tr`} d="M54 22 L78 46" fill="none" />
      <path id={`${uid}-bl`} d="M46 78 L22 54" fill="none" />
      <text
        fill={PSA_BRAND.cream}
        fontSize="7.2"
        fontWeight="700"
        letterSpacing="0.5"
        fontFamily="var(--font-manrope), system-ui, sans-serif"
      >
        <textPath href={`#${uid}-tl`} startOffset="50%" textAnchor="middle">
          PAKISTAN
        </textPath>
      </text>
      <text
        fill={PSA_BRAND.cream}
        fontSize="7.2"
        fontWeight="700"
        letterSpacing="0.5"
        fontFamily="var(--font-manrope), system-ui, sans-serif"
      >
        <textPath href={`#${uid}-tr`} startOffset="50%" textAnchor="middle">
          SCRABBLE
        </textPath>
      </text>
      <text
        fill={PSA_BRAND.cream}
        fontSize="6.6"
        fontWeight="700"
        letterSpacing="0.5"
        fontFamily="var(--font-manrope), system-ui, sans-serif"
      >
        <textPath href={`#${uid}-bl`} startOffset="50%" textAnchor="middle">
          ASSOCIATION
        </textPath>
      </text>

      {/* P · S · A tiles, arranged as on the supplied mark */}
      <PsaTile x={30} y={44} letter="P" points={3} />
      <PsaTile x={41.5} y={32.5} letter="S" points={1} />
      <PsaTile x={53} y={44} letter="A" points={1} />
    </svg>
  );
}

/** A single lettered tile inside the shield. */
function PsaTile({
  x,
  y,
  letter,
  points,
}: {
  x: number;
  y: number;
  letter: string;
  points: number;
}) {
  const s = 17;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={s}
        height={s}
        rx={2}
        fill={PSA_BRAND.tile}
        stroke="#C8B994"
        strokeWidth="0.6"
      />
      <text
        x={s / 2 - 0.6}
        y={s / 2 + 3.6}
        textAnchor="middle"
        fontSize="10.5"
        fontWeight="800"
        fill={PSA_BRAND.tileInk}
        fontFamily="var(--font-manrope), system-ui, sans-serif"
      >
        {letter}
      </text>
      <text
        x={s - 2.6}
        y={s - 2}
        textAnchor="middle"
        fontSize="4.4"
        fontWeight="700"
        fill={PSA_BRAND.tileInk}
        fontFamily="var(--font-manrope), system-ui, sans-serif"
      >
        {points}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Document header for reports, certificates, result slips and pairing sheets.
 * Prints cleanly: no glass, no gradients that vanish on paper.
 */
export function PsaDocumentHeader({
  documentTitle,
  subtitle,
  className,
}: {
  /** e.g. "Official Tournament Report" or "Official Certificate". */
  documentTitle: string;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b-2 pb-4",
        className,
      )}
      style={{ borderColor: PSA_BRAND.gold }}
    >
      <PsaLogo variant="mark" size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-extrabold tracking-[-0.02em] text-ink">
          Pakistan Scrabble Association
        </p>
        <p
          className="text-[12.5px] font-bold uppercase tracking-[0.12em]"
          style={{ color: PSA_BRAND.green }}
        >
          {documentTitle}
        </p>
        {subtitle ? <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
