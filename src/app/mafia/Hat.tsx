import styles from "./mafia.module.css";

/**
 * The poster's fedora: cream felt, a black band, a wide brim, and the crown's centre dent that
 * says "fedora" rather than "sun hat". Drawn rather than cropped from the artwork so it stays
 * sharp on any screen and carries no stray lettering from the photograph. It tilts slightly and
 * settles into place when the page opens.
 */
export function Hat({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-label="A fedora"
      className={`${styles.hat} ${className}`}
      style={{
        transform: "rotate(-5deg)",
        filter: "drop-shadow(0 12px 14px rgba(0,0,0,0.6))",
      }}
    >
      <defs>
        <linearGradient id="felt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8F0DD" />
          <stop offset="0.6" stopColor="#E6D8B9" />
          <stop offset="1" stopColor="#BDAA83" />
        </linearGradient>
        <linearGradient id="brim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EFE3C6" />
          <stop offset="1" stopColor="#A38F66" />
        </linearGradient>
        <linearGradient id="dent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8F7C55" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8F7C55" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The brim: wide, lifted at the sides, dipping toward the viewer at the front. */}
      <path
        d="M4 96 C22 76 36 74 62 82 C90 90 150 90 178 82 C204 74 218 76 236 96 C214 118 168 126 120 126 C72 126 26 118 4 96 Z"
        fill="url(#brim)"
      />
      {/* The shadow the crown throws on it. */}
      <path
        d="M44 90 C80 102 160 102 196 90 C170 112 70 112 44 90 Z"
        fill="#000"
        opacity="0.16"
      />

      {/* The crown: tall, tapered, with two peaks and the dent between them. */}
      <path
        d="M62 90 C54 60 60 30 84 16 C96 10 106 18 120 32 C134 18 144 10 156 16 C180 30 186 60 178 90 C150 102 90 102 62 90 Z"
        fill="url(#felt)"
      />
      {/* The dent's own shading, so it reads as a crease and not a cut-out. */}
      <path
        d="M92 14 C102 24 110 34 120 40 C130 34 138 24 148 14 C140 28 130 40 120 46 C110 40 100 28 92 14 Z"
        fill="url(#dent)"
      />
      <path
        d="M84 16 C98 22 110 34 120 40 C130 34 142 22 156 16"
        fill="none"
        stroke="#8F7C55"
        strokeWidth="1.3"
        opacity="0.5"
      />

      {/* The band, and a hairline of light along its top edge. */}
      <path
        d="M61 82 C94 98 148 98 179 82 L180 95 C148 110 94 110 60 95 Z"
        fill="#15100D"
      />
      <path
        d="M61 82 C94 98 148 98 179 82"
        fill="none"
        stroke="#fff"
        strokeWidth="0.9"
        opacity="0.14"
      />
    </svg>
  );
}
