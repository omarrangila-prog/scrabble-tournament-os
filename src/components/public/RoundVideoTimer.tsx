"use client";

import * as React from "react";

/** Vic Mann's 25-minute countdown: a beep and the time remaining at each minute, no ads. */
export const TIMER_VIDEO_ID = "XVQKcNivCYw";
export const TIMER_VIDEO_MINUTES = 25;

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
 * It refuses to appear unless the round really is twenty-five minutes long. The video is a
 * fixed length, and a wall counting down twenty-five minutes over a twenty-minute round is
 * not a decoration, it is a lie the room will act on.
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

  if (roundMinutes !== TIMER_VIDEO_MINUTES) {
    return (
      <p className="mt-[2vh] text-[1.4vw]" style={{ color: "#F4EFE499" }}>
        The countdown video is twenty-five minutes long and this round is {roundMinutes}. The
        clock above is the real one.
      </p>
    );
  }

  if (!running) return null;

  const src =
    `https://www.youtube-nocookie.com/embed/${TIMER_VIDEO_ID}` +
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
