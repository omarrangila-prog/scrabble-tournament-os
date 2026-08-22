/**
 * The guess-the-song clips, read at runtime rather than compiled in.
 *
 * The organizer adds a file and a line to a manifest; nothing here needs rebuilding. That
 * matters because the songs are chosen the night before by somebody who is not going to open
 * a code editor.
 *
 * No clips is a normal state, not an error. The song round simply does not appear.
 */

export interface SongClip {
  file: string;
  /** Shown only after the clip has finished, so the room has something to shout at. */
  answer?: string;
}

/** Twenty seconds, as the event describes it. Long enough to know it, short enough to argue. */
export const CLIP_SECONDS = 20;

export function clipUrl(file: string): string {
  return `/songs/${file}`;
}

/**
 * Reads the manifest.
 *
 * Every failure returns no clips rather than throwing: a missing file, a typo in the JSON, or
 * no network. A wall display that crashes because somebody mistyped a song title is worse
 * than one that quietly holds no song round.
 */
export async function readSongs(): Promise<SongClip[]> {
  try {
    const res = await fetch("/songs/manifest.json", { cache: "no-store" });
    if (!res.ok) return [];

    const body = (await res.json()) as { clips?: unknown };
    if (!Array.isArray(body.clips)) return [];

    return body.clips
      .map((raw) => raw as Record<string, unknown>)
      .filter((raw) => typeof raw.file === "string" && raw.file.trim() !== "")
      .map((raw) => ({
        file: String(raw.file).trim(),
        answer: typeof raw.answer === "string" && raw.answer.trim() !== ""
          ? String(raw.answer).trim()
          : undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * Which clip belongs to which round.
 *
 * One per round, in order, and it stops rather than looping: playing the same song twice
 * because the tournament ran longer than the playlist is worse than playing none.
 */
export function clipForRound(clips: SongClip[], round: number): SongClip | null {
  if (round < 1) return null;
  return clips[round - 1] ?? null;
}
