import { describe, expect, it } from "vitest";

import { checkInFor, divisionFor, hueFor, initialsFor, paymentFor, reportStatusFor, rosterCounts, rosterFromRegistrations, type RosterSource } from "./roster";

function source(over: Partial<RosterSource> = {}): RosterSource {
  return {
    id: "reg-1",
    fullName: "Ahmed Khan",
    email: "ahmed@example.com",
    mobile: "0300 1234567",
    area: "Clifton",
    playingLevel: "recreational",
    registrationStatus: "approved",
    paymentStatus: "verified",
    checkedInAt: null,
    submittedAt: "2026-08-10T10:00:00Z",
    ...over,
  };
}

describe("divisionFor", () => {
  it("reads the three levels the public form offers", () => {
    expect(divisionFor("beginner")).toBe("beginner");
    expect(divisionFor("recreational")).toBe("recreational");
    expect(divisionFor("advanced")).toBe("advanced");
  });

  it("understands the wording used on the form, not just the ids", () => {
    expect(divisionFor("Beginners / new to the game")).toBe("beginner");
    expect(divisionFor("Advanced / regulars")).toBe("advanced");
  });

  it("keeps an unrecognised level on the roster instead of dropping it", () => {
    // Turning a paid entrant away is worse than putting them in the wrong division.
    expect(divisionFor("")).toBe("recreational");
    expect(divisionFor("no idea")).toBe("recreational");
  });

  it("never returns masters, which was removed from the event", () => {
    for (const level of ["masters", "master", "expert", "pro"]) {
      expect(divisionFor(level)).not.toBe("masters");
    }
  });
});

describe("checkInFor", () => {
  it("treats a recorded arrival time as arrival", () => {
    expect(checkInFor(source({ checkedInAt: "2026-08-23T09:15:00Z" }))).toBe("checked-in");
  });

  it("does not claim arrival without a time", () => {
    expect(checkInFor(source({ checkedInAt: null }))).toBe("not-arrived");
  });

  it("shows a withdrawal as withdrawn rather than merely absent", () => {
    expect(checkInFor(source({ registrationStatus: "withdrawn" }))).toBe("withdrawn");
  });

  it("still reports a withdrawn player who arrived as arrived", () => {
    // They are standing in the room; the director needs to see that.
    const arrived = source({ registrationStatus: "withdrawn", checkedInAt: "2026-08-23T09:00:00Z" });
    expect(checkInFor(arrived)).toBe("checked-in");
  });
});

describe("paymentFor", () => {
  it("counts only a verified payment as paid", () => {
    expect(paymentFor("verified")).toBe("paid");
  });

  it("leaves an uploaded receipt pending", () => {
    // A screenshot is a claim. A human still has to confirm the money arrived.
    expect(paymentFor("receipt-uploaded")).toBe("pending");
    expect(paymentFor("unpaid")).toBe("pending");
    expect(paymentFor("")).toBe("pending");
  });

  it("carries waived and refunded through", () => {
    expect(paymentFor("waived")).toBe("waived");
    expect(paymentFor("refunded")).toBe("refunded");
  });
});

describe("initialsFor", () => {
  it("takes the first and last name", () => {
    expect(initialsFor("Ahmed Khan")).toBe("AK");
  });

  it("uses first and last of three or more names, not the middle", () => {
    expect(initialsFor("Nida Fatima Khan")).toBe("NK");
  });

  it("handles a single name", () => {
    expect(initialsFor("Ahmed")).toBe("A");
  });

  it("survives empty and whitespace-only input", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });
});

describe("hueFor", () => {
  it("gives the same name the same colour every time", () => {
    expect(hueFor("Ahmed Khan")).toBe(hueFor("Ahmed Khan"));
  });

  it("stays inside the hue circle", () => {
    for (const name of ["Ahmed Khan", "Nida", "", "Zoya Q", "A very long name indeed"]) {
      const hue = hueFor(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("separates different names", () => {
    expect(hueFor("Ahmed Khan")).not.toBe(hueFor("Nida Khan"));
  });
});

describe("rosterFromRegistrations", () => {
  it("leaves rejected registrations off the roster", () => {
    const roster = rosterFromRegistrations([
      source({ id: "a", registrationStatus: "approved" }),
      source({ id: "b", registrationStatus: "rejected" }),
    ]);

    expect(roster.map((p) => p.id)).toEqual(["a"]);
  });

  it("keeps waitlisted players, who may still get a seat", () => {
    const roster = rosterFromRegistrations([source({ id: "w", registrationStatus: "waitlisted" })]);
    expect(roster).toHaveLength(1);
  });

  it("numbers entries in registration order", () => {
    const roster = rosterFromRegistrations([
      source({ id: "second", submittedAt: "2026-08-10T12:00:00Z" }),
      source({ id: "first", submittedAt: "2026-08-10T09:00:00Z" }),
    ]);

    // Given deliberately out of order, so the sort is doing the work.
    expect(roster.map((p) => [p.id, p.playerId])).toEqual([
      ["first", "AB-001"],
      ["second", "AB-002"],
    ]);
  });

  it("never prints the check-in code as the entry number", () => {
    // The code is what a participant types to check in. On a badge it would let
    // a bystander check them in.
    const roster = rosterFromRegistrations([source()]);
    expect(roster[0]!.playerId).toBe("AB-001");
  });

  it("seeds within each division, not across the whole field", () => {
    const roster = rosterFromRegistrations([
      source({ id: "b1", playingLevel: "beginner", submittedAt: "2026-08-10T09:00:00Z" }),
      source({ id: "a1", playingLevel: "advanced", submittedAt: "2026-08-10T10:00:00Z" }),
      source({ id: "b2", playingLevel: "beginner", submittedAt: "2026-08-10T11:00:00Z" }),
    ]);

    const seeds = new Map(roster.map((p) => [p.id, { division: p.division, seed: p.seed }]));
    expect(seeds.get("b1")).toEqual({ division: "beginner", seed: 1 });
    expect(seeds.get("b2")).toEqual({ division: "beginner", seed: 2 });
    // A different division restarts at 1 rather than continuing to 2.
    expect(seeds.get("a1")).toEqual({ division: "advanced", seed: 1 });
  });

  it("reports no results for a tournament that has not been played", () => {
    const [player] = rosterFromRegistrations([source()]);

    expect(player!.wins).toBe(0);
    expect(player!.losses).toBe(0);
    expect(player!.spread).toBe(0);
    expect(player!.rank).toBe(0);
  });

  it("marks everyone unrated rather than inventing ratings", () => {
    const [player] = rosterFromRegistrations([source()]);
    expect(player!.ratingStatus).toBe("unrated");
    expect(player!.rating).toBe(0);
  });

  it("still shows a row when the name is missing", () => {
    const [player] = rosterFromRegistrations([source({ fullName: "" })]);
    expect(player!.fullName).toBe("Name not given");
    expect(player!.initials).toBe("?");
  });

  it("falls back to the venue city when no area was given", () => {
    const [player] = rosterFromRegistrations([source({ area: null })]);
    expect(player!.city).toBe("Karachi");
  });

  it("carries the arrival time through for the check-in log", () => {
    const at = "2026-08-23T09:15:00Z";
    const [player] = rosterFromRegistrations([source({ checkedInAt: at })]);
    expect(player!.checkIn).toBe("checked-in");
    expect(player!.checkInAt).toBe(at);
  });

  it("keeps the mobile as the reachable number", () => {
    const [player] = rosterFromRegistrations([source({ mobile: "0333 6665761" })]);
    expect(player!.emergencyContact.phone).toBe("0333 6665761");
  });

  it("returns an empty roster for no registrations", () => {
    expect(rosterFromRegistrations([])).toEqual([]);
  });
});

describe("rosterCounts", () => {
  it("counts arrivals and payments separately", () => {
    const roster = rosterFromRegistrations([
      source({ id: "a", paymentStatus: "verified", checkedInAt: "2026-08-23T09:00:00Z" }),
      source({ id: "b", paymentStatus: "receipt-uploaded", checkedInAt: null }),
      source({ id: "c", paymentStatus: "verified", checkedInAt: null }),
    ]);

    // Precondition: the fixture really does mix the two states.
    expect(roster.filter((p) => p.checkIn === "checked-in")).toHaveLength(1);

    expect(rosterCounts(roster)).toEqual({
      total: 3,
      checkedIn: 1,
      paid: 2,
      awaitingPayment: 1,
    });
  });

  it("is all zeroes for an empty roster", () => {
    expect(rosterCounts([])).toEqual({ total: 0, checkedIn: 0, paid: 0, awaitingPayment: 0 });
  });
});

describe("reportStatusFor", () => {
  it("counts a submitted registration as a confirmed entry", () => {
    /*
     * The precondition: 'submitted' is what the database actually stores. A test using
     * 'approved' here would pass while the real value went on reading zero.
     */
    expect(reportStatusFor("submitted")).toBe("approved");
  });

  it("keeps the standings that are real distinctions", () => {
    expect(reportStatusFor("rejected")).toBe("rejected");
    expect(reportStatusFor("waitlisted")).toBe("waitlisted");
    expect(reportStatusFor("withdrawn")).toBe("withdrawn");
  });

  it("is not fooled by case or spacing", () => {
    expect(reportStatusFor(" Rejected ")).toBe("rejected");
    expect(reportStatusFor("SUBMITTED")).toBe("approved");
  });

  it("treats an unrecognised value as an entry rather than losing the person", () => {
    // Same reasoning as divisionFor: a person who registered must still be counted.
    expect(reportStatusFor("active")).toBe("approved");
    expect(reportStatusFor("")).toBe("approved");
  });
});
