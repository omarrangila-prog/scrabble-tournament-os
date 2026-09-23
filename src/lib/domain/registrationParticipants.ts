/**
 * Who is actually taking part, when a ticket covers two activities.
 *
 * The Cafe Leap form sells three things: a painting seat, a Scrabble entry, and both
 * together. It asked for one name. That works right up until a parent buys the combo for two
 * children, or a couple splits it — one paints, one plays — and the desk has a single name, a
 * single category, and no way to tell which of the two people standing in front of them is on
 * the board sheet.
 *
 * So a registration names a participant per activity, and the combo ticket always names two
 * different people. The two activities run side by side in the same room at the same time —
 * nobody can sit four rounds of Scrabble and paint — so a combo bought for one person is not
 * a cheaper ticket, it is a ticket half of which cannot be used. The form used to offer
 * "same participant for both" and default to it, which made the impossible case the easy one.
 *
 * The Scrabble participant is the one the tournament knows about — the roster, the pairing,
 * the player number and the certificate all follow that name. The painting participant is
 * recorded beside them and never enters the draw, because painting has no rounds.
 */

/** What the participant is signing up for. */
export type ActivityChoice = "painting" | "scrabble" | "both";

/**
 * One thing an event sells, as the organiser priced it.
 *
 * Configured per event rather than written here. The three Cafe Leap tickets were a literal
 * array in the form, keyed off the event slug — so a second workshop meant editing a
 * component, and the price a participant was charged lived in a file nobody running the
 * event could open.
 */
export interface ActivityOption {
  key: ActivityChoice;
  /** What the participant chooses, e.g. "Scrabble Tournament". */
  label: string;
  /**
   * The regular price per person, in whole currency units.
   *
   * What somebody pays with no membership, before any early bird. `rates` below adds the
   * brackets around it; an activity with none is simply this price.
   */
  price: number;
  /** The short name that goes on the record and the price list, e.g. "Scrabble". */
  rateLabel: string;
  /**
   * One line under the option, where the choice needs explaining.
   *
   * Used where a ticket covers something other than one person, which has to be said while
   * somebody is choosing rather than discovered two fields later.
   */
  note?: string;
  /** What the price covers, e.g. "Snacks and a beverage included." */
  includes?: string;
  /**
   * The brackets this activity is sold at, beyond the regular price.
   *
   * Per activity rather than per event: the tournament is tiered — member, early bird, a
   * higher price at the door — and the painting seat is not. One rate card for the whole
   * event could not express that, which is why the member question used to sit above a
   * ticket price it had no effect on.
   */
  rates?: ActivityRate[];
}

/** One bracket an activity is sold at. */
export interface ActivityRate {
  /**
   * `regular` is the price anybody pays and the one everything else is measured against;
   * `online` needs them to be paying now rather than at the desk; `member` needs the
   * membership claim; `early-bird` needs a closing date; `walk-in` is the price at the door
   * and is never charged here.
   */
  id: ActivityRateId;
  label: string;
  amount: number;
  /** Early bird only. Inclusive: a rate available "until the 7th" works all of that day. */
  availableUntil?: string;
}

export type ActivityRateId = "regular" | "online" | "member" | "early-bird" | "walk-in";

const ACTIVITY_RATE_IDS: ActivityRateId[] = [
  "regular",
  "online",
  "member",
  "early-bird",
  "walk-in",
];

export function activityRatesFrom(payload: unknown, regular: number): ActivityRate[] {
  if (!Array.isArray(payload)) return [];

  const rates = payload
    .map((raw): ActivityRate | null => {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as Record<string, unknown>;

      const id = ACTIVITY_RATE_IDS.find((k) => k === r.id);
      const amount = Number(r.amount);
      if (!id || !Number.isFinite(amount) || amount < 0) return null;

      const until = String(r.availableUntil ?? "").trim();

      return {
        id,
        label: String(r.label ?? "").trim() || DEFAULT_RATE_LABEL[id],
        amount,
        ...(until ? { availableUntil: until } : {}),
      };
    })
    .filter((r): r is ActivityRate => r !== null);

  if (rates.length === 0) return [];

  /* The regular price is the activity's own, so a card cannot quietly contradict it. */
  return rates.some((r) => r.id === "regular")
    ? rates.map((r) => (r.id === "regular" ? { ...r, amount: regular } : r))
    : [{ id: "regular", label: DEFAULT_RATE_LABEL.regular, amount: regular }, ...rates];
}

const DEFAULT_RATE_LABEL: Record<ActivityRateId, string> = {
  regular: "Regular",
  online: "Pay online",
  member: "PSA member",
  "early-bird": "Early bird",
  "walk-in": "Walk-in, at the door",
};

/**
 * The activities an event sells, in the order they should be offered.
 *
 * An empty list is the ordinary case: a tournament with nothing but Scrabble, priced from
 * its rate card. The activity picker and the painting participant section both appear only
 * when there is something here, so no existing event changes.
 */
export function activityOptionsFrom(payload: unknown): ActivityOption[] {
  if (!Array.isArray(payload)) return [];

  const keys: ActivityChoice[] = ["painting", "scrabble", "both"];

  return payload
    .map((raw): ActivityOption | null => {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as Record<string, unknown>;

      const key = keys.find((k) => k === r.key);
      const label = String(r.label ?? "").trim();
      const price = Number(r.price);
      if (!key || !label || !Number.isFinite(price) || price < 0) return null;

      const note = String(r.note ?? "").trim();
      const includes = String(r.includes ?? "").trim();
      const rates = activityRatesFrom(r.rates, price);

      return {
        key,
        label,
        price,
        rateLabel: String(r.rateLabel ?? "").trim() || label,
        ...(note ? { note } : {}),
        ...(includes ? { includes } : {}),
        ...(rates.length ? { rates } : {}),
      };
    })
    .filter((a): a is ActivityOption => a !== null);
}

/** The details every participant gives. */
export interface ParticipantDetails {
  fullName: string;
  age: string;
  /** Optional: only asked for so the desk can reach this person separately. */
  phone: string;
}

/** The Scrabble player gives one more, because the draw needs it. */
export interface ScrabbleParticipant extends ParticipantDetails {
  /** A category id from the event's own list. */
  category: string;
}

export interface ParticipantInput {
  activity: ActivityChoice;
  scrabble: ScrabbleParticipant;
  painting: ParticipantDetails;
}

export interface ResolvedParticipants {
  scrabble: ScrabbleParticipant | null;
  painting: ParticipantDetails | null;
}

export const EMPTY_DETAILS: ParticipantDetails = { fullName: "", age: "", phone: "" };
export const EMPTY_SCRABBLE: ScrabbleParticipant = { ...EMPTY_DETAILS, category: "" };

/* -------------------------------------------------------------------------- */
/* Which sections the form shows                                               */
/* -------------------------------------------------------------------------- */

export function needsScrabbleParticipant(activity: ActivityChoice | ""): boolean {
  return activity === "scrabble" || activity === "both";
}

export function needsPaintingParticipant(activity: ActivityChoice | ""): boolean {
  return activity === "painting" || activity === "both";
}

/**
 * Whether this choice covers two people.
 *
 * The combo always does. It is a pair ticket: one of them plays, the other paints, and the
 * two happen at the same time in the same room.
 */
export function coversTwoPeople(activity: ActivityChoice | ""): boolean {
  return activity === "both";
}

/* -------------------------------------------------------------------------- */
/* Resolving one set of answers into the people it describes                   */
/* -------------------------------------------------------------------------- */

const trimmed = (d: ParticipantDetails): ParticipantDetails => ({
  fullName: d.fullName.trim(),
  age: d.age.trim(),
  phone: d.phone.trim(),
});

/**
 * The people this registration is actually for.
 *
 * Each activity carries its own person, written out in full. Nothing is stored as a pointer
 * to the other: the desk screen would have to resolve it, the CSV would have to resolve it,
 * and a later correction to one name would silently change the other — the sort of quiet
 * link nobody notices until two different people are printed on one certificate.
 */
export function resolveParticipants(input: ParticipantInput): ResolvedParticipants {
  const scrabble = needsScrabbleParticipant(input.activity)
    ? { ...trimmed(input.scrabble), category: input.scrabble.category }
    : null;

  if (!needsPaintingParticipant(input.activity)) return { scrabble, painting: null };

  return { scrabble, painting: trimmed(input.painting) };
}

/**
 * Whose name the registration carries.
 *
 * The Scrabble player, whenever there is one — they are the person the roster, the pairings
 * and the player number belong to. A painting-only registration is named after the painter,
 * because there is nobody else it could be named after.
 */
export function primaryParticipant(resolved: ResolvedParticipants): ParticipantDetails {
  return resolved.scrabble ?? resolved.painting ?? EMPTY_DETAILS;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export type ParticipantField =
  | "scrabbleName"
  | "scrabbleAge"
  | "scrabblePhone"
  | "scrabbleCategory"
  | "paintingName"
  | "paintingAge"
  | "paintingPhone"
  /** Both names are the same person, which the combo ticket cannot cover. */
  | "samePerson";

export interface ParticipantProblem {
  field: ParticipantField;
  message: string;
}

const nameOk = (value: string) => value.trim().length >= 2;

/** 3 to 110. Outside that it is a typo, and a typo in an age puts somebody in the wrong draw. */
export function ageOk(value: string): boolean {
  const n = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(n) && n >= 3 && n <= 110;
}

/** Ten digits or more, however they were typed — spaces, dashes and a country code all pass. */
export function phoneOk(value: string): boolean {
  return value.replace(/\D/g, "").length >= 10;
}

/**
 * Which of the two people the event will actually ring.
 *
 * One number is required and it belongs to whoever the registration is named after. Asking
 * both people for a mandatory number doubles the typing for the overwhelmingly common case
 * of one person registering themselves.
 */
export function primaryActivity(activity: ActivityChoice | ""): "scrabble" | "painting" | null {
  if (needsScrabbleParticipant(activity)) return "scrabble";
  if (needsPaintingParticipant(activity)) return "painting";
  return null;
}

/**
 * What is still missing, named by field so the form can put each message where it belongs.
 *
 * `categoryRequired` is false for an event with no categories configured — a painting-only
 * venue, or a tournament that runs one open field — because demanding a choice from an empty
 * list is a form nobody can finish.
 */
export function participantProblems(
  input: ParticipantInput,
  options: { categoryRequired: boolean } = { categoryRequired: true },
): ParticipantProblem[] {
  const problems: ParticipantProblem[] = [];
  const primary = primaryActivity(input.activity);

  if (needsScrabbleParticipant(input.activity)) {
    if (!nameOk(input.scrabble.fullName))
      problems.push({ field: "scrabbleName", message: "Please give the name for the board sheet." });
    if (!ageOk(input.scrabble.age))
      problems.push({ field: "scrabbleAge", message: "Please give an age." });

    /* Required of the person the registration is named after, optional of the other. */
    const phone = input.scrabble.phone.trim();
    if (primary === "scrabble" ? !phoneOk(phone) : phone !== "" && !phoneOk(phone))
      problems.push({
        field: "scrabblePhone",
        message: "Please give a cell number we can reach you on.",
      });

    if (options.categoryRequired && input.scrabble.category.trim() === "")
      problems.push({ field: "scrabbleCategory", message: "Please choose a category." });
  }

  if (needsPaintingParticipant(input.activity)) {
    if (!nameOk(input.painting.fullName))
      problems.push({ field: "paintingName", message: "Please give the painter's name." });
    if (!ageOk(input.painting.age))
      problems.push({ field: "paintingAge", message: "Please give an age." });

    const phone = input.painting.phone.trim();
    if (primary === "painting" ? !phoneOk(phone) : phone !== "" && !phoneOk(phone))
      problems.push({
        field: "paintingPhone",
        message:
          primary === "painting"
            ? "Please give a cell number we can reach you on."
            : "That number does not look right. Leave it blank if there is no second number.",
      });
  }

  /*
   * One name entered twice.
   *
   * The two activities run at the same time in the same room, so a combo naming one person
   * is a ticket half of which cannot be used — and it would put somebody on a board sheet
   * for four rounds they are booked to spend painting. Caught here rather than at the door.
   */
  if (coversTwoPeople(input.activity)) {
    const player = input.scrabble.fullName.trim().toLowerCase();
    const painter = input.painting.fullName.trim().toLowerCase();
    if (player !== "" && player === painter)
      problems.push({
        field: "samePerson",
        message:
          "Both activities run at the same time, so they need two different people. " +
          "Name whoever is painting.",
      });
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* What the desk reads                                                         */
/* -------------------------------------------------------------------------- */

/** What was stored on the registration, as the desk screens read it back. */
export interface StoredParticipants {
  activity?: string;
  scrabbleName?: string;
  scrabbleCategory?: string;
  paintingName?: string;
}

/**
 * The two lines a volunteer reads off the screen.
 *
 * Deliberately the shape the organiser asked for — "Scrabble: Ahmed Khan — Beginner",
 * "Painting: Sara Khan" — because the question being answered at the desk is which of the
 * two people in front of them is which, and that is settled by reading a line aloud.
 *
 * Returns nothing for a registration from an ordinary tournament, where there is one
 * activity and the name at the top of the card already says everything.
 */
export function participantLines(stored: StoredParticipants): string[] {
  const lines: string[] = [];

  if (stored.scrabbleName)
    lines.push(
      `Scrabble: ${stored.scrabbleName}${stored.scrabbleCategory ? ` — ${stored.scrabbleCategory}` : ""}`,
    );

  if (stored.paintingName) lines.push(`Painting: ${stored.paintingName}`);

  /*
   * Both lines, always — including the case where they name the same person.
   *
   * That combination should no longer be possible, and if an old record or a hand-entered
   * one carries it, the desk needs to see it rather than have it quietly folded into one
   * tidy line: it means somebody is booked to play and to paint at the same hour.
   */
  return lines;
}
