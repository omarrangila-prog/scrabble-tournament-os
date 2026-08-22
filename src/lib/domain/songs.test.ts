import { describe, expect, it } from "vitest";

import { clipForRound, type SongClip } from "./songs";

/**
 * Which song plays when.
 *
 * One clip per round, in order. It stops rather than looping: a tournament that runs longer
 * than the playlist should fall silent, because playing the same song twice invites a room
 * that already guessed it to shout the answer at the people who have not.
 */
const clips: SongClip[] = [
  { file: "a.mp3", answer: "Pasoori" },
  { file: "b.mp3" },
  { file: "c.mp3", answer: "Afreen Afreen" },
];

describe("the song round", () => {
  it("plays them in order, one to a round", () => {
    expect(clipForRound(clips, 1)?.file).toBe("a.mp3");
    expect(clipForRound(clips, 2)?.file).toBe("b.mp3");
    expect(clipForRound(clips, 3)?.file).toBe("c.mp3");
  });

  it("falls silent once the playlist runs out rather than repeating", () => {
    expect(clipForRound(clips, 4)).toBeNull();
    expect(clipForRound(clips, 40)).toBeNull();
  });

  it("has nothing to play before the first round", () => {
    expect(clipForRound(clips, 0)).toBeNull();
    expect(clipForRound(clips, -1)).toBeNull();
  });

  it("is silent when no clips were added at all", () => {
    /* The ordinary state for an event that is not running a song round. */
    expect(clipForRound([], 1)).toBeNull();
  });

  it("keeps an answer only where one was given", () => {
    expect(clipForRound(clips, 1)?.answer).toBe("Pasoori");
    expect(clipForRound(clips, 2)?.answer).toBeUndefined();
  });
});
