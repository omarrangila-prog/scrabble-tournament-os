import styles from "./mafia.module.css";

/**
 * The poster's props, drawn in code: the ace of spades, a card's red lattice back, a wax seal.
 * Drawn rather than cropped from the photograph so they stay sharp on any screen and carry none
 * of its lettering. All of them are decoration, so none is announced to a screen reader.
 */

/** A spade, as one path, centred on 0,0 and about 100 units tall. */
const SPADE =
  "M0 -52 C-10 -34 -50 -16 -50 14 C-50 36 -30 44 -16 36 C-18 50 -24 56 -32 60 L32 60 C24 56 18 50 16 36 C30 44 50 36 50 14 C50 -16 10 -34 0 -52 Z";

export function AceOfSpades({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 154" className={className} aria-hidden>
      <defs>
        <linearGradient id="card-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBF4E2" />
          <stop offset="1" stopColor="#D9CCAC" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="106"
        height="150"
        rx="9"
        fill="url(#card-face)"
        stroke="#8F7C55"
        strokeWidth="1"
      />
      <text
        x="11"
        y="25"
        fontFamily="Georgia, serif"
        fontSize="21"
        fontWeight="700"
        fill="#15100D"
      >
        A
      </text>
      <text
        x="11"
        y="43"
        fontFamily="Georgia, serif"
        fontSize="17"
        fill="#15100D"
      >
        ♠
      </text>
      <g transform="translate(55 77) scale(0.62)" fill="#15100D">
        <path d={SPADE} />
      </g>
      <g transform="rotate(180 55 77)">
        <text
          x="11"
          y="25"
          fontFamily="Georgia, serif"
          fontSize="21"
          fontWeight="700"
          fill="#15100D"
        >
          A
        </text>
        <text
          x="11"
          y="43"
          fontFamily="Georgia, serif"
          fontSize="17"
          fill="#15100D"
        >
          ♠
        </text>
      </g>
    </svg>
  );
}

/** The back of a card: dark red, a cream border and a lattice of diamonds, like the poster's. */
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 154" className={className} aria-hidden>
      <defs>
        <pattern
          id="lattice"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="14" height="14" fill="#7A1A20" />
          <path
            d="M0 0 L14 14 M14 0 L0 14"
            stroke="#C9575C"
            strokeWidth="0.9"
            opacity="0.7"
          />
          <circle cx="7" cy="7" r="1.6" fill="#E8B5B0" opacity="0.55" />
        </pattern>
      </defs>
      <rect
        x="2"
        y="2"
        width="106"
        height="150"
        rx="9"
        fill="#F4EAD2"
        stroke="#8F7C55"
        strokeWidth="1"
      />
      <rect
        x="9"
        y="9"
        width="92"
        height="136"
        rx="5"
        fill="url(#lattice)"
        stroke="#4E0F14"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * A fan of three cards, as the poster lays them in its bottom corner. Clipped by the page's own
 * edge on purpose, so it looks like it is lying on the table and not pasted over the page.
 */
export function CardFan({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.fan} ${className}`} aria-hidden>
      <CardBack className={`${styles.fanCard} ${styles.fanOne}`} />
      <CardBack className={`${styles.fanCard} ${styles.fanTwo}`} />
      <AceOfSpades className={`${styles.fanCard} ${styles.fanThree}`} />
    </div>
  );
}

/** A red wax seal with a spade pressed into it, the kind that closes an envelope. */
export function WaxSeal({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <radialGradient id="wax" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#E8575C" />
          <stop offset="0.55" stopColor="#B3262B" />
          <stop offset="1" stopColor="#6E1015" />
        </radialGradient>
      </defs>
      {/* An uneven edge, as poured wax has, rather than a perfect circle. */}
      <path
        d="M60 6 C74 4 82 12 92 14 C104 18 108 30 112 42 C116 54 110 64 112 76 C112 90 100 100 88 106 C76 112 68 116 56 114 C42 114 32 108 22 100 C10 92 8 78 8 66 C6 52 12 42 16 32 C22 20 34 14 44 10 C50 8 54 6 60 6 Z"
        fill="url(#wax)"
      />
      <circle
        cx="60"
        cy="60"
        r="38"
        fill="none"
        stroke="#6E1015"
        strokeWidth="2"
        opacity="0.55"
      />
      <circle
        cx="60"
        cy="60"
        r="34"
        fill="none"
        stroke="#F09A9E"
        strokeWidth="0.8"
        opacity="0.4"
      />
      <g transform="translate(60 62) scale(0.46)" fill="#5B0C11" opacity="0.9">
        <path d={SPADE} />
      </g>
      <g transform="translate(60 60) scale(0.46)" fill="#F4B0B3" opacity="0.5">
        <path d={SPADE} />
      </g>
    </svg>
  );
}

/**
 * A strip of newsprint with a headline running along it, tossed across the page at a slight
 * angle. It is the poster's "THE UNDERWORLD NEVER SLEEPS" newspaper, set to move. The line is
 * repeated twice so it can slide half its own length and loop with no jump; for anybody who has
 * asked for less motion it simply stands still, which still reads as a headline.
 */
export function NewsTicker({ items }: { items: string[] }) {
  const line = items.join("  ♠  ");
  return (
    <div className={styles.ticker} aria-hidden>
      <div className={styles.tickerTrack}>
        <span>{line}&nbsp;&nbsp;♠&nbsp;&nbsp;</span>
        <span>{line}&nbsp;&nbsp;♠&nbsp;&nbsp;</span>
      </div>
    </div>
  );
}

/**
 * Spades and hearts falling once when somebody is confirmed. Positions, speeds and spins are
 * worked out from each piece's number, never from a random call during render, so the page is the
 * same every time and cannot disagree with itself between the server and the browser.
 */
export function Confetti({ count = 26 }: { count?: number }) {
  const pieces = Array.from({ length: count }, (_, i) => {
    const x = (i * 37 + 11) % 100;
    const delay = ((i * 53) % 90) / 100;
    const dur = 2.4 + ((i * 29) % 16) / 10;
    const size = 12 + ((i * 17) % 14);
    const spin = ((i * 71) % 2 === 0 ? 1 : -1) * (180 + ((i * 41) % 260));
    const sway = ((i * 23) % 60) - 30;
    return {
      i,
      x,
      delay,
      dur,
      size,
      spin,
      sway,
      glyph: i % 4 === 0 ? "♥" : "♠",
      red: i % 3 !== 1,
    };
  });

  return (
    <div className={styles.confetti} aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.i}
          style={
            {
              left: `${p.x}%`,
              fontSize: p.size,
              color: p.red ? "#DB4247" : "#F2E7D0",
              ["--delay" as string]: `${p.delay}s`,
              ["--dur" as string]: `${p.dur}s`,
              ["--spin" as string]: `${p.spin}deg`,
              ["--sway" as string]: `${p.sway}px`,
            } as React.CSSProperties
          }
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}
