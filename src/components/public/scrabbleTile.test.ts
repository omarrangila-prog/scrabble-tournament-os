import { describe, expect, it } from "vitest";

import { TILE_VALUES, wordScore } from "./ScrabbleTile";

/**
 * The values and the arithmetic are shown to the public — on the hero, and on anything a
 * visitor types into the scorer. A wrong value here is not a styling bug: it is the event
 * telling a player that Q is worth 8, which anybody who plays will spot immediately.
 */

describe("TILE_VALUES", () => {
  it("covers the whole alphabet", () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const missing = letters.filter((l) => TILE_VALUES[l] === undefined);
    expect(missing).toEqual([]);
  });

  it("matches the English set, including the ones people check", () => {
    // The two tens and the two eights are the values anybody would notice being wrong.
    expect(TILE_VALUES.Q).toBe(10);
    expect(TILE_VALUES.Z).toBe(10);
    expect(TILE_VALUES.J).toBe(8);
    expect(TILE_VALUES.X).toBe(8);
    expect(TILE_VALUES.K).toBe(5);
    expect(TILE_VALUES.E).toBe(1);
    expect(TILE_VALUES.D).toBe(2);
  });

  it("scores a blank as nothing, which is what a blank is", () => {
    expect(TILE_VALUES[" "]).toBe(0);
  });

  it("sums to the 187 points in a full English set of letter tiles", () => {
    /*
     * The distribution, as counts per letter. This is the check that would catch a value
     * being edited for looks — one wrong tile moves the total off 187.
     */
    const counts: Record<string, number> = {
      A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
      N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
    };
    const total = Object.entries(counts).reduce(
      (sum, [letter, n]) => sum + TILE_VALUES[letter] * n,
      0,
    );
    expect(total).toBe(187);
  });
});

describe("wordScore", () => {
  it("adds up the letters", () => {
    // Q10 + U1 + I1 + Z10.
    expect(wordScore("QUIZ")).toBe(22);
    // A1 + H4 + M3 + E1 + D2.
    expect(wordScore("AHMED")).toBe(11);
    // The word on the hero, which the page states out loud.
    expect(wordScore("SCRABBLE")).toBe(14);
  });

  it("does not care about case", () => {
    expect(wordScore("quiz")).toBe(wordScore("QUIZ"));
  });

  it("scores an empty word as nothing rather than failing", () => {
    expect(wordScore("")).toBe(0);
  });

  it("ignores characters that are not tiles", () => {
    /*
     * The scorer strips these before they arrive, but the function is used elsewhere and
     * must not turn a stray digit into NaN — one NaN would render "worth NaN points".
     */
    expect(wordScore("A1B!")).toBe(wordScore("AB"));
    expect(Number.isNaN(wordScore("123"))).toBe(false);
  });
});
