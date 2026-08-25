import { describe, expect, it } from "vitest";

import { categoriesFrom } from "./useEventCategories";

describe("reading an event's categories", () => {
  it("keeps id, name, short name and accent as given", () => {
    const [c] = categoriesFrom([
      { id: "under-12", name: "Under 12", shortName: "U12", accent: "primary" },
    ]);
    expect(c).toEqual({ id: "under-12", name: "Under 12", shortName: "U12", accent: "primary" });
  });

  /*
   * A board sheet has a narrow column. A category saved without a short name would otherwise
   * render an empty one, so the name's first letters stand in.
   */
  it("falls back to the first letters of the name when no short name was given", () => {
    const [c] = categoriesFrom([{ id: "schools", name: "Schools" }]);
    expect(c.shortName).toBe("SCH");
  });

  it("falls back to a known accent rather than emitting an unknown colour", () => {
    const [c] = categoriesFrom([{ id: "open", name: "Open", accent: "chartreuse" }]);
    expect(c.accent).toBe("primary");
  });

  /*
   * A category with no id cannot be stored on a registration, and one with no name cannot be
   * shown. Dropping it is better than rendering a blank row nobody can select.
   */
  it("drops an entry with no id or no name", () => {
    expect(categoriesFrom([{ id: "", name: "Nameless" }])).toHaveLength(0);
    expect(categoriesFrom([{ id: "x", name: "   " }])).toHaveLength(0);
    expect(categoriesFrom([{ id: "a", name: "A" }, { name: "B" }])).toHaveLength(1);
  });

  it("trims whitespace around an id and a name", () => {
    const [c] = categoriesFrom([{ id: "  open  ", name: "  Open  " }]);
    expect(c.id).toBe("open");
    expect(c.name).toBe("Open");
  });

  it("returns nothing for a payload that is not a list", () => {
    expect(categoriesFrom(null)).toEqual([]);
    expect(categoriesFrom(undefined)).toEqual([]);
    expect(categoriesFrom({ id: "open", name: "Open" })).toEqual([]);
    expect(categoriesFrom("open")).toEqual([]);
  });
});
