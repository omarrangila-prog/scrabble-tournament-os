import { describe, expect, it } from "vitest";

import { TIMER_VIDEOS } from "@/components/public/RoundVideoTimer";
import { ROUND_LENGTHS } from "@/lib/supabase/useEventFormat";

/**
 * A countdown video has to be exactly as long as the round it counts.
 *
 * There is nothing on the wall to show that it is not: the video plays, the numbers fall, and
 * the room believes them. So the only protection is that a length either has the right video
 * or has none, which is what these assert.
 */
describe("the countdown videos", () => {
  it("has one for every round length the event offers", () => {
    for (const minutes of ROUND_LENGTHS) {
      expect(TIMER_VIDEOS[minutes], `no video for a ${minutes}-minute round`).toBeTruthy();
    }
  });

  it("gives each length its own video, never a shared one", () => {
    const ids = Object.values(TIMER_VIDEOS);
    expect(new Set(ids).size, "two round lengths point at the same video").toBe(ids.length);
  });

  it("holds YouTube ids, not URLs", () => {
    /* A pasted URL would produce an embed address that silently loads nothing. */
    for (const [minutes, id] of Object.entries(TIMER_VIDEOS)) {
      expect(id, `${minutes} minutes`).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });

  it("has nothing for a length the event does not offer", () => {
    /* The precondition: 40 is not one of the choices, so it must fall back to the clock. */
    expect(ROUND_LENGTHS).not.toContain(40 as never);
    expect(TIMER_VIDEOS[40]).toBeUndefined();
  });
});
