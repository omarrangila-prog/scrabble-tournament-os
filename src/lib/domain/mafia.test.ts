import { describe, expect, it } from "vitest";

import {
  AGE_CEILING,
  AGE_FLOOR,
  EMPTY_MAFIA_ENTRY,
  MAFIA_FEE,
  ageOf,
  calendarLink,
  countdownTo,
  mafiaProblems,
  mafiaReady,
  posterDate,
  startInstant,
  weekdayOf,
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

describe("the date as the poster sets it", () => {
  it("is the day with its ordinal and the short month", () => {
    expect(posterDate("2026-11-22")).toBe("22ND NOV");
    expect(posterDate("2026-11-01")).toBe("1ST NOV");
    expect(posterDate("2026-12-03")).toBe("3RD DEC");
    expect(posterDate("2026-10-24")).toBe("24TH OCT");
  });

  it("gets the teens right, which are all TH", () => {
    expect(posterDate("2026-11-11")).toBe("11TH NOV");
    expect(posterDate("2026-11-12")).toBe("12TH NOV");
    expect(posterDate("2026-11-13")).toBe("13TH NOV");
    expect(posterDate("2026-11-21")).toBe("21ST NOV");
  });

  it("does not move with the time zone, and is empty for a date that is not one", () => {
    expect(posterDate("2026-11-22T00:00:00+05:00")).toBe("22ND NOV");
    expect(posterDate("")).toBe("");
    expect(posterDate(undefined)).toBe("");
    expect(posterDate("2026-13-40")).toBe("");
    expect(posterDate("not a date")).toBe("");
  });
});

describe("the calendar link", () => {
  const input = {
    title: "Mafia Wars",
    date: "2026-11-22",
    start: "16:30",
    end: "17:30",
    location: "The Social, Karachi",
  };

  it("names the start and end as written, in the event's own zone", () => {
    const url = new URL(calendarLink(input));
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("dates")).toBe(
      "20261122T163000/20261122T173000",
    );
    expect(url.searchParams.get("ctz")).toBe("Asia/Karachi");
    expect(url.searchParams.get("text")).toBe("Mafia Wars");
    expect(url.searchParams.get("location")).toBe("The Social, Karachi");
  });

  it("pads a one-digit hour", () => {
    expect(
      new URL(
        calendarLink({ ...input, start: "9:05", end: "10:00" }),
      ).searchParams.get("dates"),
    ).toBe("20261122T090500/20261122T100000");
  });

  it("ends when it starts if no end is given, rather than inventing a length", () => {
    expect(
      new URL(calendarLink({ ...input, end: undefined })).searchParams.get(
        "dates",
      ),
    ).toBe("20261122T163000/20261122T163000");
  });

  it("is empty without a date or a start time", () => {
    expect(calendarLink({ ...input, date: undefined })).toBe("");
    expect(calendarLink({ ...input, start: "" })).toBe("");
  });

  it("keeps awkward characters from breaking the link", () => {
    const url = new URL(
      calendarLink({
        ...input,
        title: "Mafia & Wars #1",
        location: "44s Razi Rd, PECHS",
      }),
    );
    expect(url.searchParams.get("text")).toBe("Mafia & Wars #1");
  });
});

describe("the weekday", () => {
  it("is worked out from the date alone", () => {
    expect(weekdayOf("2026-11-22")).toBe("SUNDAY");
    expect(weekdayOf("2026-11-23")).toBe("MONDAY");
    expect(weekdayOf("2026-02-28")).toBe("SATURDAY");
    expect(weekdayOf("2028-02-29")).toBe("TUESDAY");
  });

  it("refuses a date that does not exist rather than rolling it forward", () => {
    expect(weekdayOf("2026-02-31")).toBe("");
    expect(weekdayOf("2026-13-01")).toBe("");
    expect(weekdayOf("")).toBe("");
    expect(weekdayOf(undefined)).toBe("");
  });
});

describe("the start of the night", () => {
  it("is the clock time in Karachi, five hours ahead of UTC", () => {
    expect(startInstant("2026-11-22", "16:30")).toBe(Date.UTC(2026, 10, 22, 11, 30));
    expect(new Date(startInstant("2026-11-22", "16:30") as number).toISOString()).toBe("2026-11-22T11:30:00.000Z");
  });

  it("carries across midnight correctly for an early start", () => {
    expect(new Date(startInstant("2026-11-22", "02:00") as number).toISOString()).toBe("2026-11-21T21:00:00.000Z");
  });

  it("is null when either part is missing or not real", () => {
    expect(startInstant(undefined, "16:30")).toBeNull();
    expect(startInstant("2026-11-22", undefined)).toBeNull();
    expect(startInstant("2026-11-22", "25:00")).toBeNull();
    expect(startInstant("2026-11-22", "16:75")).toBeNull();
    expect(startInstant("2026-02-31", "16:30")).toBeNull();
  });
});

describe("the countdown", () => {
  const start = Date.UTC(2026, 10, 22, 11, 30);
  const end = Date.UTC(2026, 10, 22, 12, 30);
  const minute = 60000;

  it("counts down in days, hours and minutes", () => {
    const now = start - (24 * 1440 + 3 * 60 + 7) * minute;
    expect(countdownTo(start, end, now)).toEqual({ phase: "before", days: 24, hours: 3, minutes: 7 });
  });

  it("rounds down, so it never promises less time than there is", () => {
    expect(countdownTo(start, end, start - 90 * 1000)).toEqual({ phase: "before", days: 0, hours: 0, minutes: 1 });
    expect(countdownTo(start, end, start - 30 * 1000)).toEqual({ phase: "before", days: 0, hours: 0, minutes: 0 });
  });

  it("says the night is on from the moment it starts until it ends", () => {
    expect(countdownTo(start, end, start)).toEqual({ phase: "now" });
    expect(countdownTo(start, end, end - 1)).toEqual({ phase: "now" });
    expect(countdownTo(start, end, end)).toEqual({ phase: "over" });
    expect(countdownTo(start, end, end + 99999999)).toEqual({ phase: "over" });
  });

  it("stays 'now' when no end is known, rather than inventing one", () => {
    expect(countdownTo(start, null, start + 99999999)).toEqual({ phase: "now" });
  });

  it("shows nothing when there is no start", () => {
    expect(countdownTo(null, end, 0)).toBeNull();
  });
});
