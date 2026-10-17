import { describe, expect, it } from "vitest";

import { cleanName, editDistance, isTokenSubset, nameKey, nameTokens } from "./names";

describe("nameKey", () => {
  it("ignores capitals, spacing and punctuation", () => {
    expect(nameKey("  Ahmed   KHAN. ")).toBe("ahmed khan");
    expect(nameKey("Ahmed-Khan")).toBe("ahmed khan");
    expect(nameKey("O’Brien")).toBe("o brien");
  });

  it("ignores accents", () => {
    expect(nameKey("José Ålvarez")).toBe("jose alvarez");
  });

  it("does NOT treat a different word order as the same name", () => {
    /* That is a likely match for a person to confirm, never an automatic one. */
    expect(nameKey("Khan, Ahmed")).not.toBe(nameKey("Ahmed Khan"));
  });
});

describe("tokens", () => {
  it("compares words regardless of order", () => {
    expect(nameTokens("Khan, Ahmed").sort()).toEqual(nameTokens("Ahmed Khan").sort());
  });

  it("finds a name that is part of a longer one", () => {
    expect(isTokenSubset(["ahmed"], ["ahmed", "khan"])).toBe(true);
    expect(isTokenSubset(["ahmed", "ali"], ["ahmed", "khan"])).toBe(false);
    expect(isTokenSubset([], ["a"])).toBe(false);
  });
});

describe("cleanName", () => {
  it("removes a trailing record or rating", () => {
    expect(cleanName("Ahmed Khan (3-0 +214)")).toBe("Ahmed Khan");
    expect(cleanName("Sara Ali [1450]")).toBe("Sara Ali");
  });

  it("leaves a name with no decoration alone", () => {
    expect(cleanName("Hammad  Ali")).toBe("Hammad Ali");
  });
});

describe("editDistance", () => {
  it("counts single-letter slips", () => {
    expect(editDistance("ahmed khan", "ahmad khan")).toBe(1);
    expect(editDistance("sara", "sara")).toBe(0);
  });

  it("gives up early on names that are plainly different", () => {
    expect(editDistance("ahmed khan", "bilal raza", 2)).toBeGreaterThan(2);
  });
});
