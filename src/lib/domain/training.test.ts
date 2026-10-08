import { describe, expect, it } from "vitest";

import {
  ADULT_AGE,
  EMPTY_SIGNUP,
  TRAINING_FEE,
  contactFor,
  isMinor,
  problemFor,
  signupLine,
  signupReady,
  trainingProblems,
  type TrainingSignup,
} from "./training";

const YEAR = 2026;
const OPTIONS = { year: YEAR, slotRequired: true };

/** A complete adult signup, so each test can break exactly one thing. */
const adult = (over: Partial<TrainingSignup> = {}): TrainingSignup => ({
  ...EMPTY_SIGNUP,
  fullName: "Ayesha Khan",
  yearOfBirth: "1995",
  age: "31",
  phone: "03001234567",
  preferredSlot: "Saturday morning",
  termsAccepted: true,
  ...over,
});

/** The same, for a child: no own phone, a guardian instead. */
const child = (over: Partial<TrainingSignup> = {}): TrainingSignup =>
  adult({
    fullName: "Hamza Khan",
    yearOfBirth: "2014",
    age: "12",
    phone: "",
    guardianName: "Sana Khan",
    guardianPhone: "03009876543",
    ...over,
  });

describe("the price", () => {
  it("is 800 rupees a person", () => {
    expect(TRAINING_FEE).toBe(800);
  });
});

describe("isMinor", () => {
  it("is unknown until the year is four valid digits", () => {
    /* The precondition: a half-typed year must not be read as an answer either way. */
    expect(isMinor("", YEAR)).toBeNull();
    expect(isMinor("2", YEAR)).toBeNull();
    expect(isMinor("201", YEAR)).toBeNull();
    expect(isMinor("abcd", YEAR)).toBeNull();
  });

  it("treats somebody turning 18 this year as an adult", () => {
    expect(isMinor(String(YEAR - ADULT_AGE), YEAR)).toBe(false);
  });

  it("treats somebody a year younger as a child", () => {
    expect(isMinor(String(YEAR - ADULT_AGE + 1), YEAR)).toBe(true);
  });
});

describe("an adult signup", () => {
  it("is ready when name, year, phone and slot are given", () => {
    expect(signupReady(adult(), OPTIONS)).toBe(true);
  });

  it("needs their own number, because there is no guardian to ring", () => {
    const problems = trainingProblems(adult({ phone: "" }), OPTIONS);
    expect(problemFor(problems, "phone")).toBeDefined();
  });

  it("does not ask an adult for a parent", () => {
    const problems = trainingProblems(adult(), OPTIONS);
    expect(problemFor(problems, "guardianName")).toBeUndefined();
    expect(problemFor(problems, "guardianPhone")).toBeUndefined();
  });
});

describe("a child signup", () => {
  it("is ready without the child's own number", () => {
    /* Assert the precondition: this is genuinely a minor with no phone of their own. */
    expect(isMinor(child().yearOfBirth, YEAR)).toBe(true);
    expect(child().phone).toBe("");
    expect(signupReady(child(), OPTIONS)).toBe(true);
  });

  it("needs a parent's name and number", () => {
    const problems = trainingProblems(child({ guardianName: "", guardianPhone: "" }), OPTIONS);
    expect(problemFor(problems, "guardianName")).toBeDefined();
    expect(problemFor(problems, "guardianPhone")).toBeDefined();
  });

  it("refuses a parent number that is too short to dial", () => {
    const problems = trainingProblems(child({ guardianPhone: "0300" }), OPTIONS);
    expect(problemFor(problems, "guardianPhone")).toBeDefined();
  });

  it("still rejects a half-typed number for the child", () => {
    const problems = trainingProblems(child({ phone: "0300" }), OPTIONS);
    expect(problemFor(problems, "phone")).toBeDefined();
  });
});

describe("the year of birth", () => {
  it("refuses two digits rather than guessing a century", () => {
    const problems = trainingProblems(adult({ yearOfBirth: "95" }), OPTIONS);
    expect(problemFor(problems, "yearOfBirth")).toBeDefined();
  });

  it("refuses a year nobody could have been born in", () => {
    expect(problemFor(trainingProblems(adult({ yearOfBirth: "1700" }), OPTIONS), "yearOfBirth"))
      .toBeDefined();
    expect(problemFor(trainingProblems(adult({ yearOfBirth: "2030" }), OPTIONS), "yearOfBirth"))
      .toBeDefined();
  });
});

describe("paying online", () => {
  it("requires a receipt", () => {
    const problems = trainingProblems(adult({ payment: "online" }), OPTIONS);
    expect(problemFor(problems, "proof")).toBeDefined();
  });

  it("accepts one once attached", () => {
    const file = new File(["x"], "receipt.png", { type: "image/png" });
    expect(signupReady(adult({ payment: "online", proofFile: file }), OPTIONS)).toBe(true);
  });

  it("asks a cash payer for nothing", () => {
    /* The precondition: this signup has no receipt at all. */
    expect(adult().proofFile).toBeNull();
    expect(problemFor(trainingProblems(adult(), OPTIONS), "proof")).toBeUndefined();
  });
});

describe("the slot", () => {
  it("is required when the event offers a choice", () => {
    const problems = trainingProblems(adult({ preferredSlot: "" }), OPTIONS);
    expect(problemFor(problems, "preferredSlot")).toBeDefined();
  });

  it("is not required when there is nothing to choose from", () => {
    const problems = trainingProblems(adult({ preferredSlot: "" }), {
      year: YEAR,
      slotRequired: false,
    });
    expect(problemFor(problems, "preferredSlot")).toBeUndefined();
  });
});

describe("the terms", () => {
  it("must be accepted", () => {
    expect(signupReady(adult({ termsAccepted: false }), OPTIONS)).toBe(false);
  });
});

describe("who the coach rings", () => {
  it("is the parent for a child", () => {
    expect(contactFor(child())).toBe("03009876543");
  });

  it("is the trainee for an adult", () => {
    expect(contactFor(adult())).toBe("03001234567");
  });
});

describe("the list line", () => {
  it("names the parent for a child", () => {
    expect(signupLine(child())).toBe("Hamza Khan (12), parent Sana Khan");
  });

  it("is just the trainee for an adult", () => {
    expect(signupLine(adult())).toBe("Ayesha Khan (31)");
  });
});
