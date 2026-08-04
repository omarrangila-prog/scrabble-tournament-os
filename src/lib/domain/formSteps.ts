/**
 * Turning a flat registration form into a short guided flow.
 *
 * A single long page asks a participant to hold every question in their head at
 * once, on a phone, often at a bus stop. Splitting it into five short steps
 * means each screen asks one kind of thing, validation lands where the mistake
 * was made, and progress is visible.
 *
 * The grouping is derived from the form's own `heading` fields rather than
 * hardcoded, so a director who adds a question to their form gets it in the
 * right step without anyone editing this file.
 */

import { FormField, RegistrationForm } from "./events";

export type StepId = "about" | "playing" | "event" | "payment" | "review";

export interface StepDefinition {
  id: StepId;
  title: string;
  /** One line explaining what this step is for. */
  blurb: string;
}

export const STEP_DEFINITIONS: StepDefinition[] = [
  { id: "about", title: "About you", blurb: "Who you are and how we reach you." },
  { id: "playing", title: "Playing information", blurb: "Your experience and preferred level." },
  { id: "event", title: "Event details", blurb: "Your school or club, and anything we should know." },
  { id: "payment", title: "Payment", blurb: "The fee, and how you are paying it." },
  { id: "review", title: "Review", blurb: "Check everything before submitting." },
];

/**
 * Which step a field belongs to.
 *
 * Core fields are placed by their identity so the flow is stable. Anything a
 * director adds falls into the step whose heading precedes it, and anything
 * before the first heading is treated as an "about you" question.
 */
const FIELD_STEP: Record<string, StepId> = {
  fullName: "about",
  email: "about",
  phone: "about",
  dob: "about",

  experience: "playing",
  rating: "playing",
  division: "playing",
  previousEvents: "playing",

  city: "event",
  club: "event",
  guardianName: "event",
  guardianPhone: "event",

  paymentMethod: "payment",
  reference: "payment",
  receipt: "payment",
  consent: "payment",
};

/** Heading ids that open each step, for director-added fields. */
const HEADING_STEP: Record<string, StepId> = {
  "h-about": "about",
  "h-play": "playing",
  "h-guardian": "event",
  "h-pay": "payment",
};

export interface Step extends StepDefinition {
  fields: FormField[];
}

/**
 * Groups a form's fields into steps.
 *
 * Headings are consumed rather than rendered — the step title replaces them —
 * and empty steps are kept so the progress indicator does not renumber itself
 * when a director removes an optional question.
 */
export function buildSteps(form: RegistrationForm): Step[] {
  const byStep = new Map<StepId, FormField[]>();
  for (const def of STEP_DEFINITIONS) byStep.set(def.id, []);

  let current: StepId = "about";

  for (const field of form.fields) {
    if (field.kind === "heading") {
      current = HEADING_STEP[field.id] ?? current;
      continue;
    }
    const target = FIELD_STEP[field.id] ?? current;
    byStep.get(target)!.push(field);
  }

  return STEP_DEFINITIONS.map((def) => ({ ...def, fields: byStep.get(def.id) ?? [] }));
}

/* -------------------------------------------------------------------------- */
/* Visibility                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether a field applies, given what has been answered.
 *
 * A question that cannot apply should not be asked at all — showing a disabled
 * guardian field to an adult is noise, and asking for a transaction reference
 * from someone paying cash is a question with no right answer.
 */
export function isVisible(field: FormField, values: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  return values[field.showWhen.fieldId] === field.showWhen.equals;
}

/** The fields on a step that currently apply. */
export function visibleFields(step: Step, values: Record<string, string>): FormField[] {
  return step.fields.filter((f) => isVisible(f, values));
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface ValidationError {
  fieldId: string;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Pakistani mobile numbers, with or without country code and separators. */
const PHONE_DIGITS = /^(?:92|0)?3\d{9}$/;

/**
 * Checks one field's value.
 *
 * Messages name what to do rather than what went wrong: "Enter a mobile number
 * like 0300 1234567" beats "Invalid format".
 */
export function validateField(
  field: FormField,
  value: string | undefined,
): ValidationError | null {
  const raw = (value ?? "").trim();

  if (field.required && !raw) {
    if (field.kind === "consent")
      return { fieldId: field.id, message: "Please agree before continuing." };
    return { fieldId: field.id, message: `${field.label} is required.` };
  }

  if (!raw) return null;

  switch (field.kind) {
    case "email":
      if (!EMAIL.test(raw))
        return { fieldId: field.id, message: "Enter an email address like name@example.com." };
      break;

    case "phone": {
      const digits = raw.replace(/[\s()+-]/g, "");
      if (!PHONE_DIGITS.test(digits))
        return { fieldId: field.id, message: "Enter a mobile number like 0300 1234567." };
      break;
    }

    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n))
        return { fieldId: field.id, message: `${field.label} must be a number.` };
      if (n < 0) return { fieldId: field.id, message: `${field.label} cannot be negative.` };
      break;
    }

    case "date": {
      const parsed = new Date(raw).getTime();
      if (Number.isNaN(parsed))
        return { fieldId: field.id, message: "Enter a valid date." };
      if (parsed > Date.now())
        return { fieldId: field.id, message: "That date is in the future." };
      break;
    }

    case "select":
    case "radio":
      if (field.options?.length && !field.options.includes(raw))
        return { fieldId: field.id, message: `Choose one of the listed options.` };
      break;
  }

  return null;
}

/** Every problem on one step. Empty means the step may be left. */
export function validateStep(
  step: Step,
  values: Record<string, string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const field of visibleFields(step, values)) {
    const error = validateField(field, values[field.id]);
    if (error) errors.push(error);
  }
  return errors;
}

/** Whether every step up to and including `index` is complete. */
export function canReachStep(
  steps: Step[],
  values: Record<string, string>,
  index: number,
): boolean {
  for (let i = 0; i < index && i < steps.length; i++) {
    if (steps[i].id === "review") continue;
    if (validateStep(steps[i], values).length > 0) return false;
  }
  return true;
}

/** Steps that are complete, for the progress indicator. */
export function completedSteps(steps: Step[], values: Record<string, string>): Set<StepId> {
  const done = new Set<StepId>();
  for (const step of steps) {
    if (step.id === "review") continue;
    const applicable = visibleFields(step, values);
    // A step nobody has touched is not "complete" just because it is optional.
    const touched = applicable.some((f) => (values[f.id] ?? "").trim().length > 0);
    if (touched && validateStep(step, values).length === 0) done.add(step.id);
  }
  return done;
}

/* -------------------------------------------------------------------------- */
/* Draft persistence                                                           */
/* -------------------------------------------------------------------------- */

export interface FormDraft {
  eventId: string;
  values: Record<string, string>;
  step: number;
  savedAt: string;
}

function draftKey(eventId: string): string {
  return `bluffy-registration-draft-${eventId}`;
}

/**
 * Saves progress so a participant can close the page and come back.
 *
 * Deliberately excludes the receipt: a file cannot be restored from a string,
 * and implying it was saved would leave someone believing they had uploaded
 * proof of payment when they had not.
 */
export function saveDraft(draft: FormDraft): void {
  if (typeof localStorage === "undefined") return;
  const { receipt: _receipt, ...values } = draft.values;
  void _receipt;
  try {
    localStorage.setItem(draftKey(draft.eventId), JSON.stringify({ ...draft, values }));
  } catch {
    // A full or blocked storage quota must never break the form itself.
  }
}

export function loadDraft(eventId: string): FormDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.values) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(eventId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(draftKey(eventId));
  } catch {
    // Nothing to do — a stale draft is harmless.
  }
}

/* -------------------------------------------------------------------------- */
/* Returning participants                                                      */
/* -------------------------------------------------------------------------- */

/** A previous entry, used to offer a participant their own details back. */
export interface PriorRegistration {
  fullName: string;
  email: string;
  mobile: string;
  city: string;
  club: string;
  preferredDivision: string;
  eventName: string;
  submittedAt: string;
}

export interface ReturningMatch {
  prior: PriorRegistration;
  /** Events this person has entered before. */
  eventCount: number;
  /** Values offered for prefill, which the participant confirms. */
  prefill: Record<string, string>;
}

/**
 * Finds a returning participant by email.
 *
 * Matching is on email alone and on exact equality after normalisation. A
 * looser match — name, or partial phone — would occasionally hand one person's
 * details to another, which is worse than making someone type their city again.
 */
export function findReturning(
  email: string,
  history: PriorRegistration[],
): ReturningMatch | null {
  const needle = email.trim().toLowerCase();
  if (!needle || !EMAIL.test(needle)) return null;

  const mine = history.filter((h) => h.email.trim().toLowerCase() === needle);
  if (!mine.length) return null;

  // Most recent entry wins: people move city and change club.
  const prior = [...mine].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];

  return {
    prior,
    eventCount: mine.length,
    prefill: {
      fullName: prior.fullName,
      phone: prior.mobile,
      city: prior.city,
      club: prior.club,
      division: prior.preferredDivision,
    },
  };
}

/** First name, for the welcome-back line. */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
