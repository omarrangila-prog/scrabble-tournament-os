/**
 * Signing up for coaching, which is not entering a tournament.
 *
 * A training session has no rounds, no draw, no standings and no winner, so almost nothing
 * the tournament domain knows is relevant here. What a coach actually needs is who is coming,
 * how old they are, who to ring if they are a child, and whether they have paid — and that is
 * the whole of this file.
 *
 * It deliberately shares nothing with `registrationParticipants` beyond the two field
 * validators, because the shapes only look alike. A trainee has no category, is never paired,
 * and must never acquire either by inheriting a type that has them: the record is written to
 * its own collection for exactly that reason, and a type that carried a `category` would be an
 * invitation to start filling one in.
 */

import { ageInYear, phoneOk, yearOfBirthOk } from "./registrationParticipants";

/**
 * PKR 1,000 a person, which is the one price coaching is sold at.
 *
 * A fallback, not the source. What a trainee is actually charged is the event row's own
 * `fee`, so a price change is an edit to one row; this is only what the form shows if that
 * row cannot be read at all. The two are kept in step deliberately — a stale constant here
 * would quote one price and bill another.
 */
export const TRAINING_FEE = 1000;

/**
 * The age at which the form stops asking for a parent.
 *
 * Eighteen, measured in whole years against the calendar year, which is the same convention
 * the tournament's age groups use. A seventeen-year-old gets guardian fields and an
 * eighteen-year-old does not.
 */
export const ADULT_AGE = 18;

/** How a trainee says they will pay. Mirrors the tournament's choices, minus the walk-in. */
export type TrainingPayment = "online" | "cash";

/**
 * One signup.
 *
 * `guardianName` and `guardianPhone` are blank for an adult and required for a child. The
 * trainee's own phone is optional either way: a twelve-year-old may not have one, and the
 * number that matters is the one somebody answers.
 */
export interface TrainingSignup {
  fullName: string;
  yearOfBirth: string;
  /** Worked out from the year, so the two can never disagree. */
  age: string;
  /** The trainee's own number. Optional — the guardian's is the one used for a child. */
  phone: string;
  guardianName: string;
  guardianPhone: string;
  /** Which sessions they want, from the event's own list. */
  preferredSlot: string;
  /** Scrabble experience, in their own words. Free text, never a rating. */
  experience: string;
  /**
   * Whether they are already a PSA member. Claimed, never verified here.
   *
   * Unlike the tournament form, this earns no discount: training is a flat fee, and the
   * question is asked because the coach wants to know who is already in the association —
   * a member has played rated games and usually starts in a different group. `null` is
   * "not answered yet", which is why it is not a plain boolean.
   */
  psaMember: boolean | null;
  payment: TrainingPayment;
  /** The receipt, when paying online. Uploaded by the caller. */
  proofFile: File | null;
  termsAccepted: boolean;
}

export const EMPTY_SIGNUP: TrainingSignup = {
  fullName: "",
  yearOfBirth: "",
  age: "",
  phone: "",
  guardianName: "",
  guardianPhone: "",
  preferredSlot: "",
  experience: "",
  psaMember: null,
  payment: "cash",
  proofFile: null,
  termsAccepted: false,
};

/**
 * Whether this trainee is a child, and so needs a guardian on the record.
 *
 * Unknown until the year of birth is four valid digits, which is why this returns null rather
 * than false: a form that shows guardian fields the instant somebody types "2" has decided
 * they are a child on no evidence, and one that defaults to adult hides a required field.
 */
export function isMinor(yearOfBirth: string, year: number): boolean | null {
  const age = ageInYear(yearOfBirth, year);
  if (age === null) return null;
  return age < ADULT_AGE;
}

/** The fields a signup can be wrong in, named so the form can put each message in place. */
export type TrainingField =
  | "fullName"
  | "yearOfBirth"
  | "phone"
  | "guardianName"
  | "guardianPhone"
  | "preferredSlot"
  | "psaMember"
  | "terms"
  | "proof";

export interface TrainingProblem {
  field: TrainingField;
  message: string;
}

/**
 * What is still missing or wrong.
 *
 * One pass over the whole signup rather than a check per field, so the submit button and the
 * messages under the inputs can never disagree about whether the form is ready.
 *
 * A contact number is required, but which one depends on age: for a child it is the
 * guardian's and the trainee's own is optional, and for an adult it is their own. Demanding
 * both from a parent registering an eight-year-old would be asking for a number that does not
 * exist.
 */
export function trainingProblems(
  signup: TrainingSignup,
  options: { year: number; slotRequired: boolean },
): TrainingProblem[] {
  const problems: TrainingProblem[] = [];
  const minor = isMinor(signup.yearOfBirth, options.year);

  if (signup.fullName.trim().length < 2)
    problems.push({ field: "fullName", message: "Please give the trainee's full name." });

  if (!yearOfBirthOk(signup.yearOfBirth, options.year))
    problems.push({ field: "yearOfBirth", message: "Please give a four-digit year of birth." });

  if (minor === true) {
    if (signup.guardianName.trim().length < 2)
      problems.push({ field: "guardianName", message: "Please give a parent or guardian's name." });

    if (!phoneOk(signup.guardianPhone))
      problems.push({
        field: "guardianPhone",
        message: "Please give a mobile number we can reach the parent on.",
      });

    /* The child's own number is optional, but a half-typed one is still a mistake. */
    if (signup.phone.trim() !== "" && !phoneOk(signup.phone))
      problems.push({ field: "phone", message: "That number looks too short." });
  } else if (minor === false && !phoneOk(signup.phone)) {
    problems.push({ field: "phone", message: "Please give a mobile number." });
  }

  if (options.slotRequired && signup.preferredSlot.trim() === "")
    problems.push({ field: "preferredSlot", message: "Please choose when you can attend." });

  if (signup.psaMember === null)
    problems.push({ field: "psaMember", message: "Please answer yes or no." });

  if (signup.payment === "online" && signup.proofFile === null)
    problems.push({ field: "proof", message: "Please attach your payment proof." });

  if (!signup.termsAccepted)
    problems.push({ field: "terms", message: "Please confirm you have read this." });

  return problems;
}

/** Whether this signup may be submitted at all. */
export function signupReady(
  signup: TrainingSignup,
  options: { year: number; slotRequired: boolean },
): boolean {
  return trainingProblems(signup, options).length === 0;
}

/** The message for one field, or undefined. */
export function problemFor(
  problems: TrainingProblem[],
  field: TrainingField,
): string | undefined {
  return problems.find((p) => p.field === field)?.message;
}

/**
 * Who the coach rings.
 *
 * The guardian for a child, the trainee for an adult. One answer, worked out once here, so
 * the signup list and any message sent from it cannot pick differently.
 */
export function contactFor(signup: {
  phone: string;
  guardianPhone: string;
}): string {
  return signup.guardianPhone.trim() || signup.phone.trim();
}

/** "Ayesha Khan (12), parent Sana Khan" — one line for a list. */
export function signupLine(signup: {
  fullName: string;
  age: string;
  guardianName: string;
}): string {
  const age = signup.age.trim();
  const name = signup.fullName.trim();
  const head = age ? `${name} (${age})` : name;
  const guardian = signup.guardianName.trim();
  return guardian ? `${head}, parent ${guardian}` : head;
}
