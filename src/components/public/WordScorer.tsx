"use client";

import * as React from "react";

import { BRASS, BRASS_EDGE, FELT, foilText, IVORY_FAINT, IVORY_SOFT, liftVars, NIGHT } from "@/lib/design/palette";
import { TILE_VALUES, TileWord, wordScore } from "./ScrabbleTile";

/**
 * Type a word, see it in tiles, find out what it is worth.
 *
 * Every other element on this page is something to read. This is the one thing a visitor
 * can do — and doing beats reading for the audience this page is for: somebody who
 * arrived from Instagram, has never entered a tournament, and is deciding in about eight
 * seconds whether this is for them. Scoring their own name answers that better than a
 * paragraph explaining that Scrabble is fun.
 *
 * It is also honest advertising for the event: the letters, the values and the arithmetic
 * are the real ones, so the thing you play with here is the thing you would play there.
 */

/** The longest word the rack will take, so a pasted paragraph cannot break the layout. */
const MAX = 12;

/*
 * A few openers, so the field is never an empty box demanding effort. Deliberately
 * ordinary words — a showy one would look like a high score chosen to impress rather than
 * something a visitor might type.
 */
const SUGGESTIONS = ["KARACHI", "CHAI", "QUIZ", "FRIENDS"];

/** Letters only, upper case, capped. Anything else a visitor types is simply not a tile. */
function clean(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, MAX);
}

export function WordScorer() {
  const [word, setWord] = React.useState("KARACHI");

  const score = wordScore(word);

  /*
   * The highest-scoring letter in what they typed, named. It turns a number into something
   * to notice — and it is the same fact a player uses at a board, which is the point.
   */
  const best = [...word].reduce<{ letter: string; value: number } | null>((top, letter) => {
    const value = TILE_VALUES[letter] ?? 0;
    return !top || value > top.value ? { letter, value } : top;
  }, null);

  return (
    <section id="play" className="scroll-mt-8 pt-16 sm:pt-24">
      <div
        className="lp-lift lp-rise relative overflow-hidden rounded-[20px] border px-6 py-10 sm:px-11 sm:py-12"
        style={{
          background: `linear-gradient(168deg, ${FELT} 0%, ${NIGHT} 100%)`,
          borderColor: BRASS_EDGE,
          ...liftVars(0.7),
          boxShadow: "var(--sh)",
        }}
      >
        <p
          className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
          style={{ color: BRASS }}
        >
          Have a go
        </p>

        <h2
          className="font-display lp-foil mt-2.5 text-[26px] leading-[1.1] tracking-[-0.02em] sm:text-[34px]"
          style={{ ...foilText, fontWeight: 600 }}
        >
          What is your name worth?
        </h2>

        <div className="mt-7 max-w-[440px]">
          <label
            htmlFor="scorer"
            className="block text-[12px] font-bold uppercase tracking-[0.14em]"
            style={{ color: IVORY_FAINT }}
          >
            Your word
          </label>
          <input
            id="scorer"
            value={word}
            onChange={(e) => setWord(clean(e.target.value))}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX}
            placeholder="Type a word"
            className="mt-2 w-full rounded-full border px-5 py-3 text-[16px] font-bold tracking-[0.12em] outline-none transition-colors focus:border-[rgba(216,172,90,0.7)]"
            style={{
              background: "rgba(0,0,0,0.28)",
              borderColor: BRASS_EDGE,
              color: BRASS,
            }}
          />
        </div>

        {/*
          The tiles. `min-height` is reserved so clearing the field does not collapse the
          block and jump every section below it up the page.
        */}
        <div className="mt-7 flex min-h-[52px] items-center">
          {word ? (
            <TileWord word={word} size={34} gap="0.12em" showValues />
          ) : (
            <p className="text-[14px]" style={{ color: IVORY_FAINT }}>
              Type something above and it appears here in tiles.
            </p>
          )}
        </div>

        {/*
          `aria-live` so the score is announced when it changes. Without it this is a
          number that silently updates, which a screen reader user would never hear.
        */}
        <p className="mt-5 text-[16px] leading-relaxed" aria-live="polite" style={{ color: IVORY_SOFT }}>
          {word ? (
            <>
              <strong className="font-extrabold" style={{ color: BRASS }}>
                {word}
              </strong>{" "}
              is worth{" "}
              <strong className="num font-extrabold" style={{ color: BRASS }}>
                {score}
              </strong>{" "}
              {score === 1 ? "point" : "points"}
              {best && best.value > 1 ? (
                <>
                  {" "}
                  — the {best.letter} alone carries {best.value}.
                </>
              ) : (
                "."
              )}
              <span className="mt-1 block text-[13px]" style={{ color: IVORY_FAINT }}>
                Before any double or triple square. On the board it could be far more.
              </span>
            </>
          ) : (
            <span style={{ color: IVORY_FAINT }}>No letters, no score.</span>
          )}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: IVORY_FAINT }}
          >
            Try
          </span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setWord(s)}
              className="lp-sheen rounded-full border px-3.5 py-1.5 text-[12px] font-bold tracking-[0.1em] transition-colors"
              style={{ borderColor: BRASS_EDGE, color: BRASS, background: "rgba(0,0,0,0.22)" }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
