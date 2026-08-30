/**
 * When an event runs, as one line.
 *
 * The seeded event carries a hand-typed `timeDisplay` — "12:00 PM to 3:30 PM" — and the
 * public pages print it. A database event has no such field, so those pages fell back to the
 * start time alone and read "12:00", while the finish time sat in the record unshown. An
 * event that runs from noon until four told people only that it began at noon, which is the
 * half that does not help somebody decide whether they can make it.
 *
 * Derived rather than typed, because the two halves are already stored separately and a
 * third hand-written copy is a third thing to keep in step.
 */

/** "16:00" to "4:00 PM". Returns null for anything that is not a 24-hour clock time. */
export function to12Hour(time: string | undefined): string | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(time ?? "");
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  /* Midnight and noon are both 12, on opposite meridiems. */
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const meridiem = hours < 12 ? "AM" : "PM";

  return `${hour12}:${match[2]} ${meridiem}`;
}

/**
 * The line the public pages print.
 *
 * An empty string when there is no start, so a caller renders nothing rather than a stray
 * "to 4:00 PM"; the start alone when there is no finish, which is the honest thing to say
 * about an event whose end nobody has set.
 */
export function eventTimeLine(startTime?: string, endTime?: string): string {
  const start = to12Hour(startTime);
  if (!start) return "";

  const end = to12Hour(endTime);
  if (!end || end === start) return start;

  return `${start} to ${end}`;
}
