import { describe, expect, it } from "vitest";

import {
  AGE_CEILING,
  AGE_FLOOR,
  EMPTY_MAFIA_ENTRY,
  MAFIA_FEE,
  ageOf,
  mafiaProblems,
  mafiaReady,
  problemFor,
  tidyName,
  type MafiaEntry,
} from "./mafia";

const OPTIONS = { termsOffered: true };
const RECEIPT = new File(["x"], "receipt.png", { type: "image/png" });

/** A complete sign-up, so each test can break exactly one thing. */
const entry = (over: Partial<MafiaEntry> = {}): MafiaEntry => ({
  ...EMPTY_MAFIA_ENTRY,
  fullName: "Ayesha Khan",
  age: "21",
  phone: "03001234567",
  mediaConsent: true,
  proofFile: RECEIPT,
  termsAccepted: true,
  ...over,
});

describe("a valid sign-up", () => {
  it("passes", () => {
    expect(mafiaProblems(entry(), OPTIONS)).toEqual([]);
    expect(mafiaReady(entry(), OPTIONS)).toBe(true);
  });

  it("passes when the answer about photographs is no", () => {
    expect(mafiaReady(entry({ mediaConsent: false }), OPTIONS)).toBe(true);
  });

  it("costs 1,400 a head", () => {
    expect(MAFIA_FEE).toBe(1400);
  });
});

describe("what is missing", () => {
  it("needs a name", () => {
    expect(
      problemFor(mafiaProblems(entry({ fullName: " " }), OPTIONS), "name"),
    ).toBeTruthy();
    expect(
      problemFor(mafiaProblems(entry({ fullName: "A" }), OPTIONS), "name"),
    ).toBeTruthy();
  });

  it.each(["", "  ", "abc", "21.5", "-3", "1e1", "1000"])(
    "refuses %j as an age",
    (age) => {
      expect(
        problemFor(mafiaProblems(entry({ age }), OPTIONS), "age"),
      ).toBeTruthy();
    },
  );

  it("refuses an age that is only a typo, and accepts every real one", () => {
    expect(
      problemFor(mafiaProblems(entry({ age: "0" }), OPTIONS), "age"),
    ).toBeTruthy();
    expect(
      problemFor(
        mafiaProblems(entry({ age: String(AGE_FLOOR - 1) }), OPTIONS),
        "age",
      ),
    ).toBeTruthy();
    expect(
      problemFor(
        mafiaProblems(entry({ age: String(AGE_CEILING + 1) }), OPTIONS),
        "age",
      ),
    ).toBeTruthy();
    for (const age of [
      String(AGE_FLOOR),
      "13",
      "18",
      "35",
      "60",
      String(AGE_CEILING),
    ])
      expect(
        problemFor(mafiaProblems(entry({ age }), OPTIONS), "age"),
      ).toBeUndefined();
  });

  it("reads ages as whole numbers only", () => {
    expect(ageOf(" 21 ")).toBe(21);
    expect(ageOf("21.5")).toBeNull();
    expect(ageOf("")).toBeNull();
  });

  it("needs a mobile number, in any format", () => {
    expect(
      problemFor(mafiaProblems(entry({ phone: "0300" }), OPTIONS), "phone"),
    ).toBeTruthy();
    expect(mafiaReady(entry({ phone: "+92 300 1234567" }), OPTIONS)).toBe(true);
    expect(mafiaReady(entry({ phone: "0300-123-4567" }), OPTIONS)).toBe(true);
  });

  it("needs an answer about photographs, and a no is an answer", () => {
    expect(
      problemFor(
        mafiaProblems(entry({ mediaConsent: null }), OPTIONS),
        "consent",
      ),
    ).toBeTruthy();
    expect(
      problemFor(
        mafiaProblems(entry({ mediaConsent: false }), OPTIONS),
        "consent",
      ),
    ).toBeUndefined();
  });

  it("always needs a receipt, because there is no cash option", () => {
    expect(
      problemFor(mafiaProblems(entry({ proofFile: null }), OPTIONS), "proof"),
    ).toMatch(/payment proof/i);
  });

  it("needs the terms ticked when there are terms, and not otherwise", () => {
    expect(
      problemFor(
        mafiaProblems(entry({ termsAccepted: false }), OPTIONS),
        "terms",
      ),
    ).toBeTruthy();
    expect(
      mafiaReady(entry({ termsAccepted: false }), { termsOffered: false }),
    ).toBe(true);
  });

  it("reports everything at once on an empty form", () => {
    const fields = mafiaProblems(EMPTY_MAFIA_ENTRY, OPTIONS).map(
      (p) => p.field,
    );
    expect(fields).toEqual(
      expect.arrayContaining([
        "name",
        "age",
        "phone",
        "consent",
        "proof",
        "terms",
      ]),
    );
  });
});

describe("names", () => {
  it("are tidied", () => {
    expect(tidyName("  Ayesha   Khan ")).toBe("Ayesha Khan");
  });
});
