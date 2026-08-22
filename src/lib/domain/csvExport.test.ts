import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/utils";

/**
 * The export is opened in Excel, so it has to survive Excel.
 *
 * Two of these are the difference between a usable roster and a useless one: every mobile in
 * this event begins with a zero, and Excel silently turns 03222927461 into 3222927461 unless
 * the cell is written as a formula string.
 */
describe("CSV that Excel reads correctly", () => {
  it("keeps the leading zero on a mobile number", () => {
    const csv = toCsv([["Mobile"], ["03222927461"]]);
    expect(csv).toContain('="03222927461"');
    expect(csv).not.toMatch(/^3222927461$/m);
  });

  it("leaves ordinary numbers alone", () => {
    /* A fee is a number and should stay one, or it cannot be summed in the sheet. */
    const csv = toCsv([["Amount"], [1250], ["800"]]);
    expect(csv).toContain("1250");
    expect(csv).not.toContain('="1250"');
    expect(csv).not.toContain('="800"');
  });

  it("does not mistake a name that starts with a zero-ish word", () => {
    expect(toCsv([["0 tables"]])).toBe("0 tables");
    expect(toCsv([["0"]])).toBe("0");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([['Ali, Muhammad']])).toBe('"Ali, Muhammad"');
    expect(toCsv([['He said "hi"']])).toBe('"He said ""hi"""');
    expect(toCsv([["two\nlines"]])).toBe('"two\nlines"');
  });

  it("ends lines the way the convention says", () => {
    expect(toCsv([["a"], ["b"]])).toBe("a\r\nb");
  });

  it("survives the shapes this roster actually contains", () => {
    const csv = toCsv([
      ["Player #", "Name", "Mobile", "Amount"],
      ["101", "Abdul wasay Narinja", "03222927461", 800],
      ["120", "sharimkizoja123°", "03353976286", 1000],
      ["180", "Mohammed aabid", "03323012919", ""],
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('="03222927461"');
    expect(lines[2]).toContain("sharimkizoja123°");
    // No amount established is blank, never zero.
    expect(lines[3].endsWith(",")).toBe(true);
  });
});
