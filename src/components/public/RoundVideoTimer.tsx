"use client";

import * as React from "react";

/**
 * A countdown video for each round length the event offers.
 *
 * Keyed by minutes, because that is the only thing that makes one correct and another wrong.
 * A length with no video simply shows the app's own clock — which is the normal state, and
 * why this can be added to one at a time without the wall ever being left counting the wrong
 * thing.
 *
 * Both are Vic Mann's, from the same series: a beep and the time remaining called at each
 * minute, and no advertisements during the countdown. Each identifier was checked against
 * the video's own title before being put here, because an identifier that is one character
 * out is a wall counting down the wrong length with nothing to show that it is wrong.
 */
export const TIMER_VIDEOS: Record<number, string> = {
  20: "xZPoZM5u1C4",
  25: "XVQKcNivCYw",
};

/**
 * A countdown video on the wall, instead of the app's own clock face.
 *
 * The appeal is the sound: a beep and a spoken minute mark, which a room notices in a way a
 * silent number on a screen does not.
 *
 * It is opt-in, by opening the wall as `/live/display?video=1`. Left off by default because
 * this is the one screen a hall of people looks up at, and it swaps something that cannot go
 * wrong — a clock counted from an instant recorded in the database, matching every phone —
 * for something that depends on a video service, a network, and a browser willing to play
 * sound. If it misbehaves, reopening the wall without the parameter brings the real clock
 * back instantly.
 *
 * Two honesty rules follow from that, and both are enforced here rather than left to whoever
 * set the television up:
 *
 * It refuses to appear unless there is a video of exactly this round's length. Each video is
 * a fixed length, and a wall counting down twenty-five minutes over a twenty-minute round is
 * not a decoration, it is something the room will act on.
 *
 * And it seeks to the true elapsed time when it loads, so a wall that was opened late — or
 * reloaded halfway through — starts where the round actually is rather than at the beginning.
 */
export function RoundVideoTimer({
  roundMinutes,
  elapsedMs,
  running,
}: {
  roundMinutes: number;
  /** How far into the round we actually are, from the shared clock. */
  elapsedMs: number;
  running: boolean;
}) {
  /*
   * The start offset is fixed at mount. Recomputing it as the clock ticks would reload the
   * iframe every second, which is a video that never plays.
   */
  const [startAt] = React.useState(() => Math.max(0, Math.floor(elapsedMs / 1000)));

  const videoId = TIMER_VIDEOS[roundMinutes];

  if (!videoId) {
    return (
      <p className="mt-[2vh] text-[1.4vw]" style={{ color: "#F4EFE499" }}>
        No countdown video is set for a {roundMinutes}-minute round. The clock above is the
        real one.
      </p>
    );
  }

  if (!running) return null;

  const src =
    `https://www.youtube-nocookie.com/embed/${videoId}` +
    `?autoplay=1&start=${startAt}&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3`;

  return (
    <div className="mt-[2vh] w-full" style={{ maxWidth: "58vw" }}>
      <div className="relative w-full overflow-hidden rounded-[1vw]" style={{ paddingTop: "56.25%" }}>
        <iframe
          src={src}
          title="Round countdown"
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
    </div>
  );
}
