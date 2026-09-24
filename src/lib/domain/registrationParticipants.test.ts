import { describe, expect, it } from "vitest";

import {
  activityOptionsFrom,
  ageInYear,
  coversTwoPeople,
  needsPaintingParticipant,
  needsScrabbleParticipant,
  participantLines,
  participantProblems,
  phoneOk,
  yearOfBirthOk,
  primaryActivity,
  primaryParticipant,
  resolveParticipants,
  type ParticipantInput,
} from "./registrationParticipants";

/**
 * Who is on the ticket.
 *
 * The rule these enforce: the combo always covers two different people, because the
 * tournament and the workshop run at the same hour in the same room. Every test that covers
 * it asserts the precondition first, because a test that quietly falls into the
 * single-participant branch passes while proving nothing about the branch it names.
 */

const input = (over: Partial<ParticipantInput> = {}): ParticipantInput => ({
  activity: "scrabble",
  scrabble: { fullName: "Ahmed Khan", yearOfBirth: "1995", phone: "0300 1234567", category: "beginner" },
  painting: { fullName: "", yearOfBirth: "", phone: "" },
  ...over,
});

describe("which sections a form shows", () => {
  it("asks for the Scrabble player for Scrabble and for both", () => {
    expect(needsScrabbleParticipant("scrabble")).toBe(true);
    expect(needsScrabbleParticipant("both")).toBe(true);
    expect(needsScrabbleParticipant("painting")).toBe(false);
  });

  it("asks for the painter for painting and for both", () => {
    expect(needsPaintingParticipant("painting")).toBe(true);
    expect(needsPaintingParticipant("both")).toBe(true);
    expect(needsPaintingParticipant("scrabble")).toBe(false);
  });

  it("treats the combo, and only the combo, as a ticket for two people", () => {
    expect(coversTwoPeople("both")).toBe(true);
    expect(coversTwoPeople("scrabble")).toBe(false);
    expect(coversTwoPeople("painting")).toBe(false);
  });

  it("asks the Scrabble player for the contact number, or the painter when there is no player", () => {
    expect(primaryActivity("both")).toBe("scrabble");
    expect(primaryActivity("scrabble")).toBe("scrabble");
    expect(primaryActivity("painting")).toBe("painting");
  });
});

describe("resolveParticipants", () => {
  it("names only the Scrabble player for a Scrabble entry", () => {
    const resolved = resolveParticipants(input({ activity: "scrabble" }));
    expect(resolved.scrabble?.fullName).toBe("Ahmed Khan");
    expect(resolved.painting).toBeNull();
  });

  it("names only the painter for a painting entry", () => {
    const resolved = resolveParticipants(
      input({ activity: "painting", painting: { fullName: "Sara Khan", yearOfBirth: "1998", phone: "03001112222" } }),
    );
    expect(resolved.scrabble).toBeNull();
    expect(resolved.painting?.fullName).toBe("Sara Khan");
  });

  it("keeps the two people on a combo apart", () => {
    const two = input({
      activity: "both",
      painting: { fullName: "Sara Khan", yearOfBirth: "2017", phone: "" },
    });
    expect(two.activity).toBe("both");

    const resolved = resolveParticipants(two);
    expect(resolved.scrabble?.fullName).toBe("Ahmed Khan");
    expect(resolved.painting?.fullName).toBe("Sara Khan");
    expect(resolved.painting?.yearOfBirth).toBe("2017");
  });

  it("never lets the draw leak onto the painter", () => {
    const resolved = resolveParticipants(
      input({ activity: "both", painting: { fullName: "Sara Khan", yearOfBirth: "2017", phone: "" } }),
    );
    /* Painting has no rounds, so a category on that record would mean nothing. */
    expect(resolved.painting).not.toHaveProperty("category");
    expect(resolved.painting).not.toBe(resolved.scrabble);
  });

  it("trims what was typed", () => {
    const resolved = resolveParticipants(
      input({
        scrabble: { fullName: "  Ahmed Khan ", yearOfBirth: " 1995 ", phone: " 0300 1234567 ", category: "beginner" },
      }),
    );
    expect(resolved.scrabble?.fullName).toBe("Ahmed Khan");
    expect(resolved.scrabble?.phone).toBe("0300 1234567");
  });
});

describe("primaryParticipant", () => {
  it("files the registration under the Scrabble player, who is the one who gets paired", () => {
    const resolved = resolveParticipants(
      input({ activity: "both", painting: { fullName: "Sara Khan", yearOfBirth: "2017", phone: "" } }),
    );
    expect(resolved.painting?.fullName).toBe("Sara Khan");
    expect(primaryParticipant(resolved).fullName).toBe("Ahmed Khan");
  });

  it("files a painting-only registration under the painter", () => {
    const resolved = resolveParticipants(
      input({ activity: "painting", painting: { fullName: "Sara Khan", yearOfBirth: "1998", phone: "03001112222" } }),
    );
    expect(resolved.scrabble).toBeNull();
    expect(primaryParticipant(resolved).fullName).toBe("Sara Khan");
  });
});

describe("participantProblems", () => {
  it("passes a complete Scrabble entry", () => {
    expect(participantProblems(input())).toEqual([]);
  });

  it("names a missing Scrabble name, year of birth and category separately", () => {
    const problems = participantProblems(
      input({ scrabble: { fullName: "", yearOfBirth: "", phone: "0300 1234567", category: "" } }),
    );
    expect(problems.map((p) => p.field).sort()).toEqual([
      "scrabbleCategory",
      "scrabbleName",
      "scrabbleYearOfBirth",
    ]);
  });

  it("does not demand a category from an event that has none", () => {
    const problems = participantProblems(
      input({ scrabble: { fullName: "Ahmed Khan", yearOfBirth: "1995", phone: "0300 1234567", category: "" } }),
      { categoryRequired: false },
    );
    expect(problems).toEqual([]);
  });

  it("requires the contact number from the player and not from the painter", () => {
    const two = input({
      activity: "both",
      painting: { fullName: "Sara Khan", yearOfBirth: "2017", phone: "" },
    });
    expect(two.painting.phone).toBe("");
    expect(participantProblems(two)).toEqual([]);
  });

  it("refuses a second number that was typed wrong rather than left blank", () => {
    const two = input({
      activity: "both",
      painting: { fullName: "Sara Khan", yearOfBirth: "2017", phone: "0300" },
    });
    const problems = participantProblems(two);
    expect(problems.map((p) => p.field)).toEqual(["paintingPhone"]);
  });

  it("always asks who is painting on a combo", () => {
    const two = input({ activity: "both" });
    expect(two.painting.fullName).toBe("");
    expect(participantProblems(two).map((p) => p.field).sort()).toEqual([
      "paintingName",
      "paintingYearOfBirth",
    ]);
  });

  it("refuses one person entered for both activities", () => {
    /* The two run at the same hour, so this books somebody into two places at once. */
    const one = input({
      activity: "both",
      painting: { fullName: "Ahmed Khan", yearOfBirth: "1995", phone: "" },
    });
    expect(one.scrabble.fullName).toBe(one.painting.fullName);
    const problems = participantProblems(one);
    expect(problems.map((p) => p.field)).toEqual(["samePerson"]);
    expect(problems[0].message).toMatch(/two different people/);
  });

  it("refuses the same person however it was capitalised or spaced", () => {
    const one = input({
      activity: "both",
      painting: { fullName: "  ahmed khan ", yearOfBirth: "1995", phone: "" },
    });
    expect(one.scrabble.fullName).not.toBe(one.painting.fullName);
    expect(participantProblems(one).map((p) => p.field)).toContain("samePerson");
  });

  it("does not cry duplicate while the painter's name is still empty", () => {
    const two = input({ activity: "both" });
    expect(two.painting.fullName).toBe("");
    expect(participantProblems(two).map((p) => p.field)).not.toContain("samePerson");
  });

  it("says nothing about two names on a single-activity ticket", () => {
    const solo = input({
      activity: "scrabble",
      painting: { fullName: "Ahmed Khan", yearOfBirth: "1995", phone: "" },
    });
    expect(coversTwoPeople(solo.activity)).toBe(false);
    expect(participantProblems(solo)).toEqual([]);
  });

  it("requires the number from the painter on a painting-only entry", () => {
    const only = input({
      activity: "painting",
      painting: { fullName: "Sara Khan", yearOfBirth: "1998", phone: "" },
    });
    expect(primaryActivity(only.activity)).toBe("painting");
    expect(participantProblems(only).map((p) => p.field)).toEqual(["paintingPhone"]);
  });
});

describe("year of birth", () => {
  it("works the age out from the event's year, not from a birthday", () => {
    /* December and January babies share an age group, which is how age groups are drawn. */
    expect(ageInYear("1995", 2026)).toBe(31);
    expect(ageInYear("2017", 2026)).toBe(9);
  });

  it("takes a year a player could have been born in", () => {
    expect(yearOfBirthOk("2023", 2026)).toBe(true);
    expect(yearOfBirthOk("1916", 2026)).toBe(true);
    expect(yearOfBirthOk("2024", 2026)).toBe(false);
    expect(yearOfBirthOk("1915", 2026)).toBe(false);
  });

  it("refuses a two-digit year rather than guessing at it", () => {
    /* "98" is 1998 to the person typing it and 98 AD to arithmetic. */
    expect(yearOfBirthOk("98", 2026)).toBe(false);
    expect(ageInYear("98", 2026)).toBeNull();
  });

  it("refuses anything that is not four digits", () => {
    expect(yearOfBirthOk("", 2026)).toBe(false);
    expect(yearOfBirthOk("nineteen", 2026)).toBe(false);
    expect(yearOfBirthOk("19955", 2026)).toBe(false);
    expect(yearOfBirthOk("19 95", 2026)).toBe(false);
  });

  it("moves with the year the event runs in", () => {
    const born = "1995";
    expect(ageInYear(born, 2026)).toBe(31);
    expect(ageInYear(born, 2027)).toBe(32);
  });

  it("takes a number however it was typed", () => {
    expect(phoneOk("0300 1234567")).toBe(true);
    expect(phoneOk("+92 300 1234567")).toBe(true);
    expect(phoneOk("0300-123")).toBe(false);
  });
});

describe("participantLines", () => {
  it("names each activity's person for the desk", () => {
    expect(
      participantLines({
        scrabbleName: "Ahmed Khan",
        scrabbleCategory: "Beginner",
        paintingName: "Sara Khan",
      }),
    ).toEqual(["Scrabble: Ahmed Khan — Beginner", "Painting: Sara Khan"]);
  });

  it("shows both lines even when an old record names one person twice", () => {
    /*
     * The form can no longer produce this. If a stored record carries it, the desk has to
     * see it — somebody is booked to play and to paint in the same hour — rather than have
     * it folded into one tidy line that hides the clash.
     */
    expect(
      participantLines({
        scrabbleName: "Ahmed Khan",
        scrabbleCategory: "Beginner",
        paintingName: "Ahmed Khan",
      }),
    ).toEqual(["Scrabble: Ahmed Khan — Beginner", "Painting: Ahmed Khan"]);
  });

  it("says nothing it was not given", () => {
    expect(participantLines({})).toEqual([]);
    expect(participantLines({ paintingName: "Sara Khan" })).toEqual(["Painting: Sara Khan"]);
  });
});

describe("activityOptionsFrom", () => {
  it("reads what the organiser configured", () => {
    expect(
      activityOptionsFrom([
        { key: "painting", label: "Painting", price: 1000, rateLabel: "Paint" },
        { key: "both", label: "BOTH!", price: 1800, rateLabel: "Combo Deal" },
      ]),
    ).toEqual([
      { key: "painting", label: "Painting", price: 1000, rateLabel: "Paint" },
      { key: "both", label: "BOTH!", price: 1800, rateLabel: "Combo Deal" },
    ]);
  });

  it("is empty for an event that sells one thing", () => {
    expect(activityOptionsFrom(undefined)).toEqual([]);
    expect(activityOptionsFrom([])).toEqual([]);
  });

  it("drops a row that could not be charged from", () => {
    const options = activityOptionsFrom([
      { key: "scrabble", label: "Scrabble", price: 1000 },
      { key: "chess", label: "Chess", price: 500 },
      { key: "painting", label: "", price: 900 },
      { key: "both", label: "Both", price: "free" },
    ]);
    expect(options.map((o) => o.key)).toEqual(["scrabble"]);
    /* No short name configured, so the label stands in rather than an empty price row. */
    expect(options[0].rateLabel).toBe("Scrabble");
  });
});
