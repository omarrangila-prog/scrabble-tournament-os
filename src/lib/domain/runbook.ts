/**
 * The event day, as a numbered list of steps.
 *
 * A tester ran this software and reported they could not work out how to operate Round 1,
 * and that they would rather use the old paper system. Both complaints were about the same
 * thing: the control room showed twenty-one buttons of equal weight, a dropdown of
 * seventeen state names, and no answer to the only question a director actually has, which
 * is *what do I do next*.
 *
 * `phaseGuidance` already answers it from the event's state alone. That is not enough. "You
 * are in result entry" is true and useless when three boards are missing scores and the
 * director cannot see which. This module takes the counts as well, so a step can say what is
 * holding it up and refuse to look ready when it is not.
 *
 * Seven steps, always the same seven, always in the same order. Steps that are finished say
 * so, the current one carries the single action worth taking, and the ones after it stay
 * visible but quiet — an organiser should be able to see the whole shape of the day on
 * arrival, not discover it a screen at a time.
 */

import type { EventState } from "./events";

export type StepId =
  | "check-in"
  | "lock-roster"
  | "pair"
  | "publish"
  | "play"
  | "scores"
  | "finalize";

/**
 * What the button does, for a caller that owns the writing.
 *
 * This module decides what should happen and never how. The control room already owns
 * locking, pairing and publishing; handing it an intent keeps one implementation of each.
 */
export type StepAction =
  | { kind: "navigate"; to: "check-in" | "score-entry" | "standings"; label: string }
  | { kind: "lock-roster"; label: string }
  | { kind: "pair"; label: string }
  | { kind: "start-round"; label: string }
  | { kind: "finalize-round"; label: string }
  | { kind: "next-round"; label: string }
  | { kind: "finish-tournament"; label: string };

export type StepStatus =
  /** Behind us. */
  | "done"
  /** The step the room is on. */
  | "now"
  /** The step the room is on, and something is in the way. */
  | "blocked"
  /** Still to come. */
  | "later";

export interface RunbookStep {
  id: StepId;
  /** 1-7, so it can be read aloud. */
  number: number;
  title: string;
  /** What is true right now — counts, not instructions. */
  detail: string;
  status: StepStatus;
  /** Why this cannot proceed. Present only when status is "blocked". */
  blocker?: string;
  /** The one thing to do. Absent on a step that is not the current one. */
  action?: StepAction;
}

export interface RunbookInput {
  state: EventState;
  /** The round being played or prepared. Zero before the first is published. */
  round: number;
  totalRounds: number;
  registered: number;
  checkedIn: number;
  rosterLocked: boolean;
  /** Boards in the current round, byes included. Zero before a round is published. */
  boardsPublished: number;
  /** Boards with a result. A bye needs none and is never counted as outstanding. */
  resultsRecorded: number;
  resultsOutstanding: number;
  disputes: number;
  /** Checked-in players with no category. Pairing cannot place them. */
  playersWithoutCategory: number;
  /**
   * True while a draw is open for review and has not been published.
   *
   * Without this, step 4 (publish) can never be current: after lock the room is on "pair",
   * and once boards exist it has already moved to play/scores. The preview modal is the
   * only mid-state between those two.
   */
  pairingPreviewOpen?: boolean;
}

export interface Runbook {
  /** "Round 2 of 5" — or what is happening instead. */
  headline: string;
  /** One sentence naming where the event is. */
  status: string;
  steps: RunbookStep[];
  /** The step the room is on. Never null: there is always something to do next. */
  current: RunbookStep;
  /** Set when the current step cannot proceed, so a banner can carry it. */
  blocker?: string;
}

const TITLES: Record<StepId, string> = {
  "check-in": "Check players in",
  "lock-roster": "Lock the roster",
  pair: "Make the pairings",
  publish: "Check the draw, then publish",
  play: "Start the round",
  scores: "Enter the scores",
  finalize: "Finish the round",
};

const ORDER: StepId[] = [
  "check-in",
  "lock-roster",
  "pair",
  "publish",
  "play",
  "scores",
  "finalize",
];

/**
 * Which step the event is on.
 *
 * Derived from what exists rather than from the state name alone, because the two can
 * disagree and what exists is the truth: a round with boards has been published whatever
 * the phase says, and a round whose scores are all in is waiting to be finished.
 */
function currentStepId(input: RunbookInput): StepId {
  const { state } = input;

  if (state === "draft" || state === "registration-open" || state === "registration-closed") {
    return "check-in";
  }

  /* Everything after the last round is finished is not a round step at all. */
  if (
    state === "final-review" ||
    state === "awards" ||
    state === "completed" ||
    state === "archived"
  ) {
    return "finalize";
  }

  if (state === "check-in-open") return input.checkedIn >= 2 ? "lock-roster" : "check-in";

  /* A published round is the fact that settles the next three steps. */
  if (input.boardsPublished > 0) {
    if (input.resultsOutstanding > 0) {
      /* Nobody has started yet if no score has been entered and the round is not running. */
      return state === "round-published" ? "play" : "scores";
    }
    return "finalize";
  }

  if (!input.rosterLocked) return "lock-roster";
  /* The draw is on screen — publishing it is what is left, not making it again. */
  if (input.pairingPreviewOpen) return "publish";
  return "pair";
}

/** The step's own one-liner: what is true, in numbers. */
function detailFor(id: StepId, input: RunbookInput): string {
  const {
    registered,
    checkedIn,
    round,
    totalRounds,
    boardsPublished,
    resultsRecorded,
    resultsOutstanding,
  } = input;

  switch (id) {
    case "check-in":
      return `${checkedIn} of ${registered} arrived${
        registered - checkedIn > 0 ? ` · ${registered - checkedIn} not here yet` : ""
      }`;
    case "lock-roster":
      return input.rosterLocked
        ? `Locked · ${checkedIn} playing`
        : `${checkedIn} checked in and ready to lock`;
    case "pair":
      return boardsPublished > 0 || input.pairingPreviewOpen
        ? `Round ${boardsPublished > 0 ? round : round + 1} is paired`
        : `Round ${round + 1} of ${totalRounds} — not paired yet`;
    case "publish":
      if (input.pairingPreviewOpen) {
        return "Draw open — check the boards, then publish from that window";
      }
      return boardsPublished > 0
        ? `${boardsPublished} board${boardsPublished === 1 ? "" : "s"} on the wall`
        : "Nothing published yet";
    case "play":
      return boardsPublished > 0
        ? `${boardsPublished} board${boardsPublished === 1 ? "" : "s"} ready to start`
        : "Waiting on pairings";
    case "scores":
      return `${resultsRecorded} of ${resultsRecorded + resultsOutstanding} recorded${
        resultsOutstanding > 0 ? ` · ${resultsOutstanding} to go` : ""
      }`;
    case "finalize":
      return round >= totalRounds
        ? `Round ${round} of ${totalRounds} — the last one`
        : `Round ${round} of ${totalRounds}`;
  }
}

/**
 * What is in the way, if anything.
 *
 * Only ever a real obstruction with something a director can do about it. "Not all scores
 * are in" is an obstruction; "the round is still being played" is just the round being
 * played, and dressing that up as a blocker would teach people to ignore the banner.
 */
function blockerFor(id: StepId, input: RunbookInput): string | undefined {
  switch (id) {
    case "lock-roster":
      if (input.checkedIn < 2) return "At least two players have to be checked in.";
      return undefined;

    case "pair":
      if (input.playersWithoutCategory > 0) {
        return input.playersWithoutCategory === 1
          ? "1 player has no category. Pairing cannot place them."
          : `${input.playersWithoutCategory} players have no category. Pairing cannot place them.`;
      }
      if (input.checkedIn < 2) return "At least two players have to be checked in.";
      return undefined;

    case "finalize":
      if (input.resultsOutstanding > 0) {
        return `${input.resultsOutstanding} board${
          input.resultsOutstanding === 1 ? "" : "s"
        } still need a score.`;
      }
      if (input.disputes > 0) {
        return input.disputes === 1
          ? "1 result is disputed and needs a ruling."
          : `${input.disputes} results are disputed and need a ruling.`;
      }
      return undefined;

    default:
      return undefined;
  }
}

/** The single action on the current step. */
function actionFor(id: StepId, input: RunbookInput): StepAction | undefined {
  switch (id) {
    case "check-in":
      return { kind: "navigate", to: "check-in", label: "Open the check-in desk" };

    case "lock-roster":
      if (input.checkedIn < 2) {
        return { kind: "navigate", to: "check-in", label: "Open the check-in desk" };
      }
      return { kind: "lock-roster", label: `Lock ${input.checkedIn} players in` };

    case "pair":
      if (input.playersWithoutCategory > 0) {
        return { kind: "navigate", to: "check-in", label: "Assign the missing categories" };
      }
      return { kind: "pair", label: `Make round ${input.round + 1} pairings` };

    case "publish":
      /*
       * The preview modal is the action. A button here that called "pair" again would
       * regenerate the draw underneath the one the director is already checking.
       */
      return undefined;

    case "play":
      return { kind: "start-round", label: `Start round ${input.round}` };

    case "scores":
      return { kind: "navigate", to: "score-entry", label: `Enter round ${input.round} scores` };

    case "finalize":
      if (input.resultsOutstanding > 0 || input.disputes > 0) {
        return { kind: "navigate", to: "score-entry", label: "Go to score entry" };
      }
      if (input.round >= input.totalRounds) {
        return { kind: "finish-tournament", label: "Finish the tournament" };
      }
      return { kind: "next-round", label: `Finish round ${input.round} and pair the next` };
  }
}

/** A sentence naming where the event is, for somebody who has just walked up to the laptop. */
function statusLine(input: RunbookInput, current: StepId): string {
  if (input.state === "completed" || input.state === "archived") {
    return "The tournament is finished.";
  }
  if (input.state === "final-review" || input.state === "awards") {
    return "All rounds are played. The results are under final review.";
  }
  if (input.state === "break") return "The room is on a break.";

  switch (current) {
    case "check-in":
      return "Players are arriving.";
    case "lock-roster":
      return "Everybody who is here is checked in. The roster has not been locked.";
    case "pair":
      return `Round ${input.round + 1} has not been paired.`;
    case "publish":
      return input.pairingPreviewOpen
        ? `Round ${input.round + 1} is in the draw window — publish it there, then start the clock.`
        : `Round ${input.round + 1} is paired and waiting to be published.`;
    case "play":
      return `Round ${input.round} is on the wall. The clock has not started.`;
    case "scores":
      return `Round ${input.round} is being played.`;
    case "finalize":
      return input.resultsOutstanding > 0
        ? `Round ${input.round} is waiting on ${input.resultsOutstanding} score${
            input.resultsOutstanding === 1 ? "" : "s"
          }.`
        : `Every score for round ${input.round} is in.`;
  }
}

/** The day, as steps. */
export function runbookFor(input: RunbookInput): Runbook {
  const current = currentStepId(input);
  const currentIndex = ORDER.indexOf(current);
  const blocker = blockerFor(current, input);

  const steps: RunbookStep[] = ORDER.map((id, index) => {
    const status: StepStatus =
      index < currentIndex
        ? "done"
        : index > currentIndex
          ? "later"
          : blocker
            ? "blocked"
            : "now";

    return {
      id,
      number: index + 1,
      title: TITLES[id],
      detail: detailFor(id, input),
      status,
      ...(status === "blocked" ? { blocker } : {}),
      ...(index === currentIndex ? { action: actionFor(id, input) } : {}),
    };
  });

  const headline =
    input.state === "completed" || input.state === "archived"
      ? "Tournament complete"
      : input.round > 0
        ? `Round ${input.round} of ${input.totalRounds}`
        : "Before the first round";

  return {
    headline,
    status: statusLine(input, current),
    steps,
    current: steps[currentIndex],
    ...(blocker ? { blocker } : {}),
  };
}
