/**
 * Rolling entry: who is waiting, and who they could play right now.
 *
 * A round is a time window. Once it starts, every match already on it is fixed — nobody is
 * moved, nothing is redrawn. But the window stays open: somebody arriving five minutes in can
 * still play, if there is somebody in their category with nobody to play and a table free in
 * that category's block. This module answers those two questions from the waiting list.
 *
 * It proposes; it never writes. Staff confirm a proposal, and the database checks it again
 * against the boards as they stand at that instant — because between the proposal and the
 * tap, the room may have changed.
 */

export interface Waiting {
  id: string;
  fullName: string;
  playerNumber: string;
  division: string;
  /** Arrival time. Proposals pair in arrival order, which is a rule the room can see. */
  checkedInAt: string;
}

export interface Proposal {
  division: string;
  a: Waiting;
  b: Waiting;
}

export interface WaitingRoom {
  /** Ready to be confirmed: two waiting players of one category. */
  proposals: Proposal[];
  /** Still without an opponent. At most one per category. */
  waiting: Waiting[];
}

/**
 * Pairs the waiting list, within categories, in arrival order.
 *
 * Whoever has waited longest is paired first, so nobody watches a later arrival get a table
 * ahead of them. An odd one stays waiting — not on a bye. A bye during a running round is a
 * director's decision, made when the round is ended and not before, because the next person
 * through the door may be their opponent.
 */
export function proposeLateMatches(waitingList: Waiting[]): WaitingRoom {
  const byDivision = new Map<string, Waiting[]>();
  for (const w of waitingList) {
    byDivision.set(w.division, [...(byDivision.get(w.division) ?? []), w]);
  }

  const proposals: Proposal[] = [];
  const waiting: Waiting[] = [];

  for (const [division, pool] of [...byDivision.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...pool].sort((x, y) => x.checkedInAt.localeCompare(y.checkedInAt));

    for (let i = 0; i + 1 < ordered.length; i += 2) {
      proposals.push({ division, a: ordered[i], b: ordered[i + 1] });
    }
    if (ordered.length % 2 === 1) waiting.push(ordered[ordered.length - 1]);
  }

  return { proposals, waiting };
}

/**
 * How long a late match actually has.
 *
 * Nobody gets a fresh clock. A pair confirmed at 12:07 into a round ending at 12:25 has
 * eighteen minutes, and the card that proposes them should say so before anybody sits down —
 * a player told "you have twenty minutes" and stopped after eighteen has been lied to.
 */
export function remainingForLateMatch(
  roundEndsAt: string | null,
  now: string,
): { minutes: number; label: string } | null {
  if (!roundEndsAt) return null;

  const ms = new Date(roundEndsAt).getTime() - new Date(now).getTime();
  if (Number.isNaN(ms)) return null;

  const minutes = Math.max(0, Math.floor(ms / 60000));
  return {
    minutes,
    label: minutes === 0 ? "less than a minute left" : `${minutes} minute${minutes === 1 ? "" : "s"} left`,
  };
}

/**
 * One line per waiting player, for the desk.
 *
 * Says the category, because the desk's next question is always "is there another one of
 * those coming?", and it can only be answered if the category is in front of them.
 */
export function waitingLine(w: Waiting): string {
  return `${w.fullName} (${w.division}) — waiting for an opponent`;
}
