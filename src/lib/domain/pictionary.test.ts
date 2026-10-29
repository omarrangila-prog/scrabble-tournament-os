import { describe, expect, it } from "vitest";

import {
  DEFAULT_RULES,
  EMPTY_ENTRY,
  ageOf,
  emailOk,
  entryLine,
  entryReady,
  entryTotal,
  fits,
  pictionaryProblems,
  playersFor,
  problemFor,
  spotsLeft,
  type PictionaryEntry,
} from "./pictionary";

const RECEIPT = new File(["x"], "receipt.png", { type: "image/png" });

/** A complete individual, so each test can break exactly one thing. */
const solo = (over: Partial<PictionaryEntry> = {}): PictionaryEntry => ({
  ...EMPTY_ENTRY,
  type: "individual",
  players: [{ name: "Ayesha Khan", age: "16" }],
  phone: "03001234567",
  email: "ayesha@example.com",
  payment: "online",
  proofFile: RECEIPT,
  termsAccepted: true,
  ...over,
});

/** A complete pair. */
const pair = (over: Partial<PictionaryEntry> = {}): PictionaryEntry =>
  solo({
    type: "team",
    players: [
      { name: "Ayesha Khan", age: "16" },
      { name: "Sana Khan", age: "19" },
    ],
    ...over,
  });

describe("what an entry costs", () => {
  it("is 1,250 for one person", () => {
    expect(entryTotal("individual", DEFAULT_RULES)).toBe(1250);
  });

  it("is 2,000 for a pair — one price for both, not double the single", () => {
    expect(entryTotal("team", DEFAULT_RULES)).toBe(2000);
    expect(entryTotal("team", DEFAULT_RULES)).toBeLessThan(
      2 * entryTotal("individual", DEFAULT_RULES),
    );
  });

  it("follows the event's own prices", () => {
    expect(entryTotal("team", { individualFee: 900, teamFee: 1500 })).toBe(
      1500,
    );
  });
});

describe("the players an entry holds", () => {
  it("is one for an individual and two for a pair", () => {
    expect(playersFor("individual", [])).toHaveLength(1);
    expect(playersFor("team", [])).toHaveLength(2);
  });

  it("keeps what was already typed when the type changes", () => {
    const typed = [{ name: "Ayesha", age: "16" }];
    expect(playersFor("team", typed)[0]).toEqual({ name: "Ayesha", age: "16" });
    const both = [typed[0], { name: "Sana", age: "19" }];
    expect(playersFor("individual", both)).toEqual([
      { name: "Ayesha", age: "16" },
    ]);
  });
});

describe("the age limit, 13 to 23 inclusive", () => {
  const agedFor = (age: string) =>
    pictionaryProblems(solo({ players: [{ name: "Ayesha Khan", age }] }));

  it.each(["13", "14", "18", "22", "23"])("accepts %s", (age) => {
    expect(problemFor(agedFor(age), "age")).toBeUndefined();
  });

  it.each(["12", "11", "0", "24", "30", "100"])("refuses %s", (age) => {
    expect(problemFor(agedFor(age), "age")).toMatch(/between 13 and 23/);
  });

  it.each(["", "  ", "abc", "16.5", "-3", "1e1", "1000"])(
    "refuses %j as not an age",
    (age) => {
      expect(problemFor(agedFor(age), "age")).toBeTruthy();
    },
  );

  it("holds each player of a pair to it separately", () => {
    const p = pictionaryProblems(
      pair({
        players: [
          { name: "Ayesha Khan", age: "20" },
          { name: "Sana Khan", age: "25" },
        ],
      }),
    );
    expect(problemFor(p, "age", 0)).toBeUndefined();
    expect(problemFor(p, "age", 1)).toMatch(/between 13 and 23/);
  });

  it("follows the event's own limits", () => {
    const rules = { ...DEFAULT_RULES, ageMin: 15, ageMax: 20 };
    expect(
      problemFor(
        pictionaryProblems(
          solo({ players: [{ name: "Ayesha Khan", age: "14" }] }),
          rules,
        ),
        "age",
      ),
    ).toMatch(/between 15 and 20/);
  });

  it("reads ages as whole numbers only", () => {
    expect(ageOf("16")).toBe(16);
    expect(ageOf(" 16 ")).toBe(16);
    expect(ageOf("16.5")).toBeNull();
    expect(ageOf("")).toBeNull();
  });
});

describe("a valid entry", () => {
  it("passes as an individual and as a pair", () => {
    expect(pictionaryProblems(solo())).toEqual([]);
    expect(entryReady(pair())).toBe(true);
  });

  it("does not need a receipt when paying cash", () => {
    expect(entryReady(solo({ payment: "cash", proofFile: null }))).toBe(true);
  });
});

describe("what is missing", () => {
  it("needs a name for every player", () => {
    expect(
      problemFor(
        pictionaryProblems(solo({ players: [{ name: " ", age: "16" }] })),
        "name",
      ),
    ).toMatch(/your full name/);
    const p = pictionaryProblems(
      pair({
        players: [
          { name: "Ayesha Khan", age: "16" },
          { name: "", age: "19" },
        ],
      }),
    );
    expect(problemFor(p, "name", 1)).toMatch(/second player/);
    expect(problemFor(p, "name", 0)).toBeUndefined();
  });

  it("refuses the same person twice in a pair, however it is typed", () => {
    const p = pictionaryProblems(
      pair({
        players: [
          { name: "Ayesha Khan", age: "16" },
          { name: "ayesha  khan", age: "16" },
        ],
      }),
    );
    expect(problemFor(p, "name", 1)).toMatch(/own name/);
  });

  it("needs a mobile number", () => {
    expect(
      problemFor(pictionaryProblems(solo({ phone: "0300" })), "phone"),
    ).toBeTruthy();
    expect(entryReady(solo({ phone: "+92 300 1234567" }))).toBe(true);
  });

  it("needs an email address that looks like one", () => {
    expect(
      problemFor(pictionaryProblems(solo({ email: "" })), "email"),
    ).toBeTruthy();
    expect(
      problemFor(pictionaryProblems(solo({ email: "ayesha@" })), "email"),
    ).toBeTruthy();
    expect(
      problemFor(
        pictionaryProblems(solo({ email: "no spaces@x.com" })),
        "email",
      ),
    ).toBeTruthy();
    expect(emailOk(" ayesha@example.com ")).toBe(true);
  });

  it("needs a receipt when paying online, and only then", () => {
    expect(
      problemFor(pictionaryProblems(solo({ proofFile: null })), "proof"),
    ).toMatch(/payment proof/i);
  });

  it("needs the terms ticked when there are terms, and not otherwise", () => {
    expect(
      problemFor(pictionaryProblems(solo({ termsAccepted: false })), "terms"),
    ).toBeTruthy();
    expect(
      entryReady(solo({ termsAccepted: false }), {
        ...DEFAULT_RULES,
        termsOffered: false,
      }),
    ).toBe(true);
  });

  it("reports everything at once on an empty form", () => {
    const fields = pictionaryProblems(EMPTY_ENTRY).map((p) => p.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "name",
        "age",
        "phone",
        "email",
        "proof",
        "terms",
      ]),
    );
  });
});

describe("reading an entry back", () => {
  it("makes one line for a list", () => {
    expect(entryLine({ players: ["Ayesha"], ages: [16] })).toBe("Ayesha (16)");
    expect(entryLine({ players: ["Ayesha", "Sana"], ages: [16, 19] })).toBe(
      "Ayesha (16) & Sana (19)",
    );
    expect(entryLine({ players: ["Ayesha"], ages: [] })).toBe("Ayesha");
  });
});

describe("spots", () => {
  it("counts what is left, never below zero", () => {
    expect(spotsLeft(30, 32)).toBe(2);
    expect(spotsLeft(32, 32)).toBe(0);
    expect(spotsLeft(40, 32)).toBe(0);
    expect(spotsLeft(null, 32)).toBeNull();
  });

  it("knows a pair needs two and a single needs one", () => {
    expect(fits("team", 2)).toBe(true);
    expect(fits("team", 1)).toBe(false);
    expect(fits("individual", 1)).toBe(true);
    expect(fits("individual", 0)).toBe(false);
    expect(fits("team", null)).toBe(true);
  });
});
