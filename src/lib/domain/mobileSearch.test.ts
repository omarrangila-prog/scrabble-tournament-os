import { describe, expect, it } from "vitest";

/**
 * Finding somebody at the desk by their mobile number.
 *
 * Three entrants arrived with their number written "+92 336 8505214" while everybody else is
 * written "0336 8505214". Those two strings share no leading digits — a country code replaces
 * the trunk zero rather than sitting in front of it — so the desk, which compared the digits
 * as given, could not find them by the number printed on their own phone.
 *
 * This is the matching rule on its own, so the behaviour is pinned regardless of what the
 * import happens to have normalised. The desk page and `recover_registration` both use it.
 */
function matches(stored: string, typed: string): boolean {
  const mobile = stored.replace(/\D/g, "");
  const digits = typed.replace(/\D/g, "");
  const tail = digits.length >= 7 ? digits.slice(-7) : null;
  return tail !== null ? mobile.endsWith(tail) : digits !== "" && mobile.includes(digits);
}

describe("finding an entrant by mobile number", () => {
  it("matches the same number written locally and internationally", () => {
    const forms = ["+92 336 8505214", "0336 8505214", "03368505214", "923368505214", "+923368505214"];

    for (const stored of forms) {
      for (const typed of forms) {
        expect(matches(stored, typed), `${stored} should match ${typed}`).toBe(true);
      }
    }
  });

  it("matches through the punctuation the sheet actually uses", () => {
    expect(matches("0345-9266647", "0345 9266647")).toBe(true);
    expect(matches("0321 2586691", "03212586691")).toBe(true);
  });

  it("does not match two different people", () => {
    // Two real entrants, whose numbers differ only after the network prefix.
    expect(matches("03222585711", "03368505214")).toBe(false);
    expect(matches("03055330654", "03313537401")).toBe(false);
  });

  it("treats a few digits as a partial search rather than a whole number", () => {
    /*
     * Under seven digits there is no number to align, so it searches for the digits anywhere.
     * That is what somebody reading the last of a number off a badge wants, and it returns
     * everybody it could be for the desk to choose from — including, here, two entrants who
     * share a mobile completely.
     */
    expect(matches("03368505214", "5214")).toBe(true);
    expect(matches("03368505214", "336")).toBe(true);
    expect(matches("03222585711", "5214")).toBe(false);
  });

  it("finds nobody on an empty search", () => {
    expect(matches("03368505214", "")).toBe(false);
    expect(matches("03368505214", "   ")).toBe(false);
  });
});
