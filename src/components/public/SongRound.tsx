"use client";

import * as React from "react";
import { Music, Volume2 } from "lucide-react";

import { CLIP_SECONDS, clipForRound, clipUrl, readSongs, type SongClip } from "@/lib/domain/songs";

/**
 * The guess-the-song round, on the wall, between games.
 *
 * When a round ends the room stops playing and starts talking, which is exactly when a
 * twenty-second clip lands. It starts itself: nobody should have to find a laptop and a
 * playlist while sixty people wait.
 *
 * One clip per round, in order, and it stops when the playlist runs out. Looping would play a
 * song the room has already guessed, and the people who guessed it last time will shout.
 *
 * Sound is the one thing a browser will not simply do. A page cannot play audio until
 * somebody has interacted with it, so the wall asks once — press it while setting the
 * television up and it stays unlocked for the day. Until then the panel says so plainly
 * rather than failing silently, which is the failure that gets discovered mid-event.
 */
export function SongRound({ round, playing }: { round: number; playing: boolean }) {
  const [clips, setClips] = React.useState<SongClip[] | null>(null);
  const [unlocked, setUnlocked] = React.useState(false);
  const [left, setLeft] = React.useState(CLIP_SECONDS);
  const [finished, setFinished] = React.useState(false);

  /*
   * One audio element, kept in the page rather than made on demand.
   *
   * The unlocking tap has to start it *itself*. Setting a flag and letting an effect play a
   * moment later loses the gesture — the browser refuses with NotAllowedError, and the wall
   * sits there having been tapped and still silent. So the handler calls play() directly on
   * this element, and every later clip reuses the element the browser has already allowed.
   */
  const audio = React.useRef<HTMLAudioElement | null>(null);
  /* The round whose clip has already been started, so a re-render cannot restart it. */
  const started = React.useRef<number | null>(null);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const found = await readSongs();
      if (live) setClips(found);
    })();
    return () => {
      live = false;
    };
  }, []);

  const clip = clips ? clipForRound(clips, round) : null;

  const runClip = React.useCallback(
    (file: string) => {
      const el = audio.current;
      if (!el) return;

      el.src = clipUrl(file);
      setFinished(false);
      setLeft(CLIP_SECONDS);
      /*
       * A refusal leaves the wall asking to be tapped rather than throwing. A display that
       * crashes over a missing file is worse than one that plays nothing.
       */
      void el.play().catch(() => setUnlocked(false));
    },
    [],
  );

  /* Later rounds: the element is already allowed, so no tap is needed again. */
  React.useEffect(() => {
    if (!clip || !playing || !unlocked) return;
    if (started.current === round) return;

    started.current = round;
    runClip(clip.file);

    const stop = window.setTimeout(() => {
      audio.current?.pause();
      setFinished(true);
    }, CLIP_SECONDS * 1000);

    return () => window.clearTimeout(stop);
  }, [clip, playing, unlocked, round, runClip]);

  /* The countdown, decremented rather than compared against the clock during render. */
  const counting = playing && unlocked && clip !== null && !finished;

  React.useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  /* Nothing to play: no manifest, no clips, or the playlist has run out. */
  if (!clip || !playing) return null;

  /*
   * One audio element for both states, in the same place in the tree.
   *
   * It used to be rendered inside each branch, so the tap that unlocked sound also swapped
   * the locked branch for the unlocked one — React unmounted the element mid-play and the
   * browser aborted it. The wall had been tapped, said "Song round", and made no sound.
   * Rendering it once, outside the branch, is what keeps it the same element.
   */
  return (
    <>
      <audio ref={audio} preload="auto" />

      {!unlocked ? (
        <button
          type="button"
          onClick={() => {
            /* Started here, inside the gesture, or the browser refuses it. */
            setUnlocked(true);
            started.current = round;
            runClip(clip.file);
            window.setTimeout(() => {
              audio.current?.pause();
              setFinished(true);
            }, CLIP_SECONDS * 1000);
          }}
          className="mt-[3vh] flex items-center gap-[1.2vw] rounded-full px-[2.4vw] py-[1.2vh]"
          style={{ background: "#C89B3C", color: "#1A1A18" }}
        >
          <Volume2 className="size-[2vw]" />
          <span className="text-[1.6vw] font-extrabold">Tap once for sound</span>
        </button>
      ) : (
        <div className="mt-[3vh] text-center">
          <p
            className="flex items-center justify-center gap-[1vw] text-[1.6vw] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#C89B3C" }}
          >
            <Music className="size-[2vw] animate-pulse" />
            {finished ? "Name that tune" : "Song round"}
          </p>

          {finished ? (
            clip.answer ? (
              <p className="mt-[1vh] text-[3.4vw] font-extrabold" style={{ color: "#F4EFE4" }}>
                {clip.answer}
              </p>
            ) : (
              <p className="mt-[1vh] text-[2vw]" style={{ color: "#F4EFE466" }}>
                Answers at the desk
              </p>
            )
          ) : (
            <p
              className="num mt-[1vh] text-[4.6vw] font-extrabold leading-none"
              style={{ color: "#F4EFE4" }}
            >
              {left}
            </p>
          )}
        </div>
      )}
    </>
  );
}
