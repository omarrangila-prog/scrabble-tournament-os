import { describe, expect, it } from "vitest";

import { artProblems, artTotal, type ArtEntry } from "./art";

const entry = (over: Partial<ArtEntry> = {}): ArtEntry => ({
  fullName: "Sara Ali",
  age: "12",
  phone: "0300 1234567",
  email: "",
  activities: ["canvas"],
  payment: "cash",
  proofFile: null,
  ...over,
});

describe("artTotal", () => {
  it("charges per activity", () => {
    expect(artTotal([])).toBe(0);
    expect(artTotal(["canvas"])).toBe(1000);
    expect(artTotal(["tote"])).toBe(1000);
    expect(artTotal(["canvas", "tote"])).toBe(2000);
  });
  it("takes a code's amount off the total, never below nothing", () => {
    expect(artTotal(["canvas"], 1000, 300)).toBe(700);
    expect(artTotal(["canvas", "tote"], 1000, 300)).toBe(1700);
    expect(artTotal([], 1000, 300)).toBe(0);
    expect(artTotal(["canvas"], 200, 300)).toBe(0);
  });
  it("never charges twice for the same activity", () => {
    expect(artTotal(["canvas", "canvas"])).toBe(1000);
  });
});

describe("artProblems", () => {
  it("accepts a complete cash entry, email optional", () => {
    expect(artProblems(entry())).toEqual([]);
  });
  it("needs a name, an age, a phone and an activity", () => {
    const fields = artProblems(entry({ fullName: "", age: "", phone: "12", activities: [] })).map((p) => p.field);
    expect(fields).toEqual(["fullName", "age", "phone", "activities"]);
  });
  it("needs a receipt for online payment only", () => {
    expect(artProblems(entry({ payment: "online" })).map((p) => p.field)).toEqual(["proof"]);
    expect(artProblems(entry({ payment: "online", proofFile: { name: "r.jpg", type: "image/jpeg", size: 1000 } }))).toEqual([]);
  });
  it("refuses a code that is unknown or does not qualify", () => {
    expect(artProblems(entry(), "unknown").map((p) => p.field)).toEqual(["promo"]);
    expect(artProblems(entry(), "not-eligible").map((p) => p.field)).toEqual(["promo"]);
    expect(artProblems(entry(), "accepted")).toEqual([]);
  });
  it("checks an email only when one is given", () => {
    expect(artProblems(entry({ email: "nope" })).map((p) => p.field)).toEqual(["email"]);
  });
});
