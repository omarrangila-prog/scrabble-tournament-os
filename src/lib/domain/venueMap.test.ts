import { describe, expect, it } from "vitest";

import { parseCoords, venueLine, venueMapSrc } from "./venueMap";

describe("parseCoords", () => {
  it("accepts a pasted pair, spaces and all", () => {
    expect(parseCoords("24.8652732, 67.064693")).toBe("24.8652732,67.064693");
  });

  it("accepts negatives on both sides of zero", () => {
    expect(parseCoords("-33.8688,-151.2093")).toBe("-33.8688,-151.2093");
  });

  it("rejects a latitude off the Earth", () => {
    /* 91 is a plausible typo for 19 and would centre the map on nothing. */
    expect(parseCoords("91.0,67.0")).toBeNull();
  });

  it("rejects a longitude off the Earth", () => {
    expect(parseCoords("24.86,181.0")).toBeNull();
  });

  it("rejects a pasted URL, which is the likeliest wrong paste", () => {
    expect(parseCoords("https://maps.app.goo.gl/3ipeRXbLSXp3iqR76")).toBeNull();
  });

  it("rejects empty and undefined", () => {
    expect(parseCoords("")).toBeNull();
    expect(parseCoords(undefined)).toBeNull();
  });
});

describe("venueMapSrc", () => {
  it("prefers coordinates, which name one point rather than search for it", () => {
    const src = venueMapSrc({
      coords: "24.8652732, 67.064693",
      venueName: "The Cafe Leap",
      address: "Block 6, Razi Rd",
      city: "Karachi",
    });
    expect(src).toContain("q=24.8652732%2C67.064693");
    expect(src).toContain("output=embed");
    /* The address must not leak into a coordinate query and re-introduce the ambiguity. */
    expect(src).not.toContain("Cafe");
  });

  it("falls back to the full address when there are no coordinates", () => {
    const src = venueMapSrc({
      venueName: "The Cafe Leap",
      address: "Block 6, Razi Rd",
      city: "Karachi",
    });
    expect(src).toContain("The%20Cafe%20Leap");
    expect(src).toContain("Karachi");
  });

  it("shows nothing rather than searching for a venue name alone", () => {
    /* "The Cafe Leap, Karachi" with no street is a guess between branches. */
    expect(venueMapSrc({ venueName: "The Cafe Leap", city: "Karachi" })).toBeNull();
  });

  it("shows nothing when the event has no location at all", () => {
    expect(venueMapSrc({})).toBeNull();
  });

  it("ignores unusable coordinates instead of centring on nowhere", () => {
    const src = venueMapSrc({
      coords: "not coordinates",
      venueName: "The Cafe Leap",
      address: "Block 6, Razi Rd",
      city: "Karachi",
    });
    expect(src).toContain("The%20Cafe%20Leap");
  });
});

describe("venueLine", () => {
  it("does not repeat a city the address already ends with", () => {
    expect(venueLine("Block 6, Razi Rd, Block 6 P.E.C.H.S., Karachi", "Karachi")).toBe(
      "Block 6, Razi Rd, Block 6 P.E.C.H.S., Karachi",
    );
  });

  it("ignores case when deciding that", () => {
    expect(venueLine("12 Main Rd, KARACHI", "Karachi")).toBe("12 Main Rd, KARACHI");
  });

  it("adds the city when the address stops short of it", () => {
    expect(venueLine("Block 6, Razi Rd", "Karachi")).toBe("Block 6, Razi Rd, Karachi");
  });

  it("keeps a street named after the city, which is not a repeat", () => {
    /* Only a trailing match counts, or "Karachi Road, Lahore" would lose its city. */
    expect(venueLine("Karachi Road", "Lahore")).toBe("Karachi Road, Lahore");
  });

  it("copes with either half missing", () => {
    expect(venueLine("", "Karachi")).toBe("Karachi");
    expect(venueLine("Block 6, Razi Rd", "")).toBe("Block 6, Razi Rd");
    expect(venueLine(undefined, undefined)).toBe("");
  });
});
