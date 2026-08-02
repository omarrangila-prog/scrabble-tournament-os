import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultForm, FormField, RegistrationForm } from "./events";
import {
  buildSteps,
  canReachStep,
  clearDraft,
  completedSteps,
  findReturning,
  firstNameOf,
  isVisible,
  loadDraft,
  PriorRegistration,
  saveDraft,
  STEP_DEFINITIONS,
  validateField,
  validateStep,
  visibleFields,
} from "./formSteps";

/**
 * The suite runs in node, which has no localStorage. A minimal in-memory stand-in
 * keeps the draft tests honest without pulling jsdom into every other suite.
 */
beforeAll(() => {
  if (typeof globalThis.localStorage !== "undefined") return;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
});

const form = () => defaultForm("ev-1");

/** A complete, valid answer set for the default form. */
const filled = (): Record<string, string> => ({
  fullName: "Hunain Ahmed",
  email: "hunain@example.com",
  phone: "0300 1234567",
  dob: "2004-03-15",
  experience: "1–3 years",
  division: "Advanced",
  city: "Karachi",
  club: "Karachi Scrabble Club",
  paymentMethod: "Bank transfer",
  consent: "yes",
});

describe("buildSteps", () => {
  it("produces the five steps in order", () => {
    expect(buildSteps(form()).map((s) => s.id)).toEqual([
      "about",
      "playing",
      "event",
      "payment",
      "review",
    ]);
  });

  it("matches the declared step definitions", () => {
    expect(buildSteps(form()).map((s) => s.title)).toEqual(
      STEP_DEFINITIONS.map((d) => d.title),
    );
  });

  it("places core fields in the step a participant expects", () => {
    const steps = buildSteps(form());
    const idsIn = (id: string) =>
      steps.find((s) => s.id === id)!.fields.map((f) => f.id);

    expect(idsIn("about")).toContain("email");
    expect(idsIn("playing")).toContain("division");
    expect(idsIn("event")).toContain("club");
    expect(idsIn("payment")).toContain("receipt");
  });

  it("keeps payment questions off the earlier steps", () => {
    const steps = buildSteps(form());
    for (const id of ["about", "playing", "event"]) {
      const fields = steps.find((s) => s.id === id)!.fields.map((f) => f.id);
      expect(fields).not.toContain("paymentMethod");
      expect(fields).not.toContain("receipt");
    }
  });

  it("consumes headings rather than rendering them as questions", () => {
    const all = buildSteps(form()).flatMap((s) => s.fields);
    expect(all.some((f) => f.kind === "heading")).toBe(false);
  });

  it("keeps the review step free of input fields", () => {
    expect(buildSteps(form()).find((s) => s.id === "review")!.fields).toEqual([]);
  });

  /** A director's own question must land somewhere sensible, not vanish. */
  it("places a director-added field into the step it was added under", () => {
    const base = form();
    const custom: FormField = {
      id: "dietary",
      kind: "text",
      label: "Dietary requirements",
      required: false,
    };
    const index = base.fields.findIndex((f) => f.id === "guardianPhone");
    const withCustom: RegistrationForm = {
      ...base,
      fields: [...base.fields.slice(0, index + 1), custom, ...base.fields.slice(index + 1)],
    };

    const steps = buildSteps(withCustom);
    expect(steps.find((s) => s.id === "event")!.fields.map((f) => f.id)).toContain("dietary");
  });

  it("loses no field when grouping", () => {
    const base = form();
    const inputCount = base.fields.filter((f) => f.kind !== "heading").length;
    expect(buildSteps(base).flatMap((s) => s.fields)).toHaveLength(inputCount);
  });
});

describe("visibility", () => {
  const conditional: FormField = {
    id: "reference",
    kind: "text",
    label: "Transaction reference",
    required: false,
    showWhen: { fieldId: "paymentMethod", equals: "Bank transfer" },
  };

  it("shows an unconditional field always", () => {
    expect(isVisible({ id: "x", kind: "text", label: "X", required: true }, {})).toBe(true);
  });

  it("hides a field whose condition is unmet", () => {
    expect(isVisible(conditional, { paymentMethod: "Cash at venue" })).toBe(false);
  });

  it("shows a field once its condition is met", () => {
    expect(isVisible(conditional, { paymentMethod: "Bank transfer" })).toBe(true);
  });

  it("excludes hidden fields from a step's visible list", () => {
    const step = {
      id: "payment" as const,
      title: "Payment",
      blurb: "",
      fields: [conditional],
    };
    expect(visibleFields(step, { paymentMethod: "Cash at venue" })).toEqual([]);
  });
});

describe("validateField", () => {
  const f = (over: Partial<FormField> = {}): FormField => ({
    id: "x",
    kind: "text",
    label: "Field",
    required: true,
    ...over,
  });

  it("requires a value for a required field", () => {
    expect(validateField(f(), "")?.message).toContain("required");
    expect(validateField(f(), "   ")?.message).toContain("required");
  });

  it("accepts an empty optional field", () => {
    expect(validateField(f({ required: false }), "")).toBeNull();
  });

  it("asks for agreement rather than a value on consent", () => {
    expect(validateField(f({ kind: "consent" }), "")?.message).toContain("agree");
  });

  it("accepts a real email and rejects a malformed one", () => {
    expect(validateField(f({ kind: "email" }), "a@b.co")).toBeNull();
    expect(validateField(f({ kind: "email" }), "not-an-email")).not.toBeNull();
    expect(validateField(f({ kind: "email" }), "a@b")).not.toBeNull();
  });

  it("accepts Pakistani mobile numbers in the formats people type", () => {
    for (const n of ["03001234567", "0300 1234567", "+92 300 1234567", "+923001234567"]) {
      expect(validateField(f({ kind: "phone" }), n)).toBeNull();
    }
  });

  it("rejects a number that is not a mobile", () => {
    expect(validateField(f({ kind: "phone" }), "12345")).not.toBeNull();
  });

  it("says what to type rather than that the format is wrong", () => {
    expect(validateField(f({ kind: "phone" }), "12345")?.message).toContain("0300");
  });

  it("rejects a negative or non-numeric number", () => {
    expect(validateField(f({ kind: "number" }), "-5")).not.toBeNull();
    expect(validateField(f({ kind: "number" }), "abc")).not.toBeNull();
    expect(validateField(f({ kind: "number" }), "1500")).toBeNull();
  });

  it("rejects a birth date in the future", () => {
    expect(validateField(f({ kind: "date" }), "2099-01-01")).not.toBeNull();
    expect(validateField(f({ kind: "date" }), "2004-03-15")).toBeNull();
  });

  it("rejects a choice outside the offered options", () => {
    const select = f({ kind: "select", options: ["A", "B"] });
    expect(validateField(select, "C")).not.toBeNull();
    expect(validateField(select, "A")).toBeNull();
  });
});

describe("validateStep", () => {
  it("passes a fully answered step", () => {
    const about = buildSteps(form())[0];
    expect(validateStep(about, filled())).toEqual([]);
  });

  it("reports each missing required field once", () => {
    const about = buildSteps(form())[0];
    const errors = validateStep(about, {});
    expect(errors.length).toBeGreaterThan(0);
    expect(new Set(errors.map((e) => e.fieldId)).size).toBe(errors.length);
  });

  it("does not demand a value from a hidden field", () => {
    const step = {
      id: "payment" as const,
      title: "Payment",
      blurb: "",
      fields: [
        {
          id: "reference",
          kind: "text" as const,
          label: "Reference",
          required: true,
          showWhen: { fieldId: "paymentMethod", equals: "Bank transfer" },
        },
      ],
    };
    expect(validateStep(step, { paymentMethod: "Cash at venue" })).toEqual([]);
    expect(validateStep(step, { paymentMethod: "Bank transfer" })).toHaveLength(1);
  });
});

describe("canReachStep", () => {
  const steps = () => buildSteps(form());

  it("always allows the first step", () => {
    expect(canReachStep(steps(), {}, 0)).toBe(true);
  });

  it("blocks a later step while an earlier one is incomplete", () => {
    expect(canReachStep(steps(), {}, 2)).toBe(false);
  });

  it("allows review once every earlier step is valid", () => {
    expect(canReachStep(steps(), filled(), 4)).toBe(true);
  });
});

describe("completedSteps", () => {
  it("marks nothing complete on an empty form", () => {
    expect(completedSteps(buildSteps(form()), {}).size).toBe(0);
  });

  /** An untouched optional step must not appear finished. */
  it("does not mark an untouched step complete just because it is optional", () => {
    const done = completedSteps(buildSteps(form()), {
      fullName: "A B",
      email: "a@b.co",
      phone: "03001234567",
      dob: "2000-01-01",
    });
    expect(done.has("about")).toBe(true);
    expect(done.has("event")).toBe(false);
  });

  it("never marks the review step complete", () => {
    expect(completedSteps(buildSteps(form()), filled()).has("review")).toBe(false);
  });
});

describe("draft persistence", () => {
  beforeEach(() => localStorage.clear());

  it("restores saved answers and position", () => {
    saveDraft({
      eventId: "ev-1",
      values: { fullName: "Hunain Ahmed" },
      step: 2,
      savedAt: "2026-08-02T00:00:00.000Z",
    });
    const back = loadDraft("ev-1");
    expect(back?.values.fullName).toBe("Hunain Ahmed");
    expect(back?.step).toBe(2);
  });

  /** A file input cannot be restored, so it must not be implied. */
  it("never saves the receipt", () => {
    saveDraft({
      eventId: "ev-1",
      values: { fullName: "A", receipt: "proof.jpg" },
      step: 3,
      savedAt: "x",
    });
    expect(loadDraft("ev-1")?.values.receipt).toBeUndefined();
  });

  it("keeps drafts separate per event", () => {
    saveDraft({ eventId: "ev-1", values: { city: "Karachi" }, step: 0, savedAt: "x" });
    expect(loadDraft("ev-2")).toBeNull();
  });

  it("returns null when nothing was saved", () => {
    expect(loadDraft("ev-nothing")).toBeNull();
  });

  it("returns null rather than throwing on corrupt data", () => {
    localStorage.setItem("bluffy-registration-draft-ev-1", "{not json");
    expect(loadDraft("ev-1")).toBeNull();
  });

  it("clears a draft once submitted", () => {
    saveDraft({ eventId: "ev-1", values: { city: "Karachi" }, step: 0, savedAt: "x" });
    clearDraft("ev-1");
    expect(loadDraft("ev-1")).toBeNull();
  });
});

describe("findReturning", () => {
  const history: PriorRegistration[] = [
    {
      fullName: "Hunain Ahmed",
      email: "hunain@example.com",
      mobile: "03001234567",
      city: "Karachi",
      club: "Karachi Scrabble Club",
      preferredDivision: "Recreational",
      eventName: "Pakistan Championship",
      submittedAt: "2025-11-01T00:00:00.000Z",
    },
    {
      fullName: "Hunain Ahmed",
      email: "HUNAIN@example.com",
      mobile: "03001234567",
      city: "Lahore",
      club: "Lahore Scrabble Club",
      // Stored under the old label, as real historic data would be.
      preferredDivision: "Advance",
      eventName: "Spring Open",
      submittedAt: "2026-04-01T00:00:00.000Z",
    },
    {
      fullName: "Ayesha Khan",
      email: "ayesha@example.com",
      mobile: "03007654321",
      city: "Islamabad",
      club: "Islamabad Club",
      preferredDivision: "Masters",
      eventName: "Spring Open",
      submittedAt: "2026-04-01T00:00:00.000Z",
    },
  ];

  it("finds a returning participant regardless of email case", () => {
    expect(findReturning("Hunain@Example.com", history)?.eventCount).toBe(2);
  });

  it("offers the most recent details, since people move", () => {
    const match = findReturning("hunain@example.com", history)!;
    expect(match.prefill.city).toBe("Lahore");
    expect(match.prior.eventName).toBe("Spring Open");
  });

  it("returns nothing for an unknown email", () => {
    expect(findReturning("nobody@example.com", history)).toBeNull();
  });

  it("returns nothing for an incomplete email rather than guessing", () => {
    expect(findReturning("hun", history)).toBeNull();
    expect(findReturning("", history)).toBeNull();
  });

  /** Never hand one person's details to another. */
  it("does not match on name or phone alone", () => {
    expect(findReturning("different@example.com", history)).toBeNull();
  });

  it("offers only fields safe to prefill", () => {
    const keys = Object.keys(findReturning("hunain@example.com", history)!.prefill);
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("dob");
    expect(keys).toContain("city");
  });
});

describe("firstNameOf", () => {
  it("takes the first word", () => {
    expect(firstNameOf("Hunain Ahmed")).toBe("Hunain");
    expect(firstNameOf("  Ayesha   Khan ")).toBe("Ayesha");
  });

  it("handles a single name", () => {
    expect(firstNameOf("Hunain")).toBe("Hunain");
  });
});

/**
 * The division select and the submit handler's lookup table are declared in
 * different files. When they disagree — as they did, with the form offering
 * "Advance" and the map keyed on "Advanced" — the mismatch is silent: the
 * lookup misses and the entry is filed under the fallback division instead.
 */
describe("division option labels", () => {
  const DIVISION_VALUE: Record<string, string> = {
    Beginner: "beginner",
    Recreational: "recreational",
    Advanced: "advanced",
    Masters: "masters",
  };

  it("offers exactly the labels the submit handler can resolve", () => {
    const field = form().fields.find((f) => f.id === "division");
    expect(field?.options).toBeDefined();
    for (const option of field!.options!) {
      expect(DIVISION_VALUE[option]).toBeDefined();
    }
  });
});
