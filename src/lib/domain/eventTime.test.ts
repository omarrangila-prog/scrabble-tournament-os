import { describe, expect, it } from "vitest";

import { eventTimeLine, to12Hour } from "./eventTime";

describe("to12Hour", () => {
  it("turns an afternoon time into the one people say", () => {
    expect(to12Hour("16:00")).toBe("4:00 PM");
  });

  it("keeps noon as 12 PM rather than 0 PM", () => {
    expect(to12Hour("12:00")).toBe("12:00 PM");
  });

  it("keeps midnight as 12 AM rather than 0 AM", () => {
    expect(to12Hour("00:15")).toBe("12:15 AM");
  });

  it("keeps the minutes", () => {
    expect(to12Hour("09:30")).toBe("9:30 AM");
  });

  it("rejects an impossible clock time instead of printing it", () => {
    expect(to12Hour("25:00")).toBeNull();
    expect(to12Hour("12:75")).toBeNull();
  });

  it("rejects text and empty", () => {
    expect(to12Hour("noon")).toBeNull();
    expect(to12Hour("")).toBeNull();
    expect(to12Hour(undefined)).toBeNull();
  });
});

describe("eventTimeLine", () => {
  it("prints the range this event actually runs", () => {
    expect(eventTimeLine("12:00", "16:00")).toBe("12:00 PM to 4:00 PM");
  });

  it("prints the start alone when no finish is set", () => {
    /* Better than inventing an end time nobody entered. */
    expect(eventTimeLine("12:00", "")).toBe("12:00 PM");
    expect(eventTimeLine("12:00", undefined)).toBe("12:00 PM");
  });

  it("does not say 'to' the time it started", () => {
    expect(eventTimeLine("12:00", "12:00")).toBe("12:00 PM");
  });

  it("prints nothing at all without a start", () => {
    expect(eventTimeLine("", "16:00")).toBe("");
    expect(eventTimeLine(undefined, undefined)).toBe("");
  });

  it("ignores an unusable finish rather than dropping the start", () => {
    expect(eventTimeLine("12:00", "later")).toBe("12:00 PM");
  });
});
