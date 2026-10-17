/**
 * The addresses an organiser hands out, built in one place.
 *
 * Nobody should be assembling these by hand on the morning of an event. A slug typed from memory
 * into a message is a link that 404s in front of eighty people, so staff copy a button and this
 * is what the button copies.
 */

export interface PublicLinks {
  /** Standings, pairings and results, for a phone. */
  live: string;
  /** The registration list as a table. */
  registrations: string;
  /** The same list as a CSV that is regenerated on every request. */
  csv: string;
  /** Large current pairings for the venue television, pinned to this event. */
  tv: string;
}

export function publicLinks(origin: string, slug: string): PublicLinks {
  const base = origin.replace(/\/+$/, "");
  const s = encodeURIComponent(slug);
  return {
    live: `${base}/events/${s}/live`,
    registrations: `${base}/public/events/${s}/registrations`,
    csv: `${base}/public/events/${s}/registrations.csv`,
    /* `?event=` pins the screen to this tournament, so a venue running two rooms cannot cross them. */
    tv: `${base}/live/pairings?event=${s}`,
  };
}
