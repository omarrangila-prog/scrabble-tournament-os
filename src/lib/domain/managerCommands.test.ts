import { describe, expect, it } from "vitest";

import { parseCommand, parseDuration, parseRoster } from "./managerCommands";

describe("parseDuration", () => {
  it.each([
    ["25", 25],
    ["25 min", 25],
    ["25 minutes", 25],
    ["25m", 25],
    ["1h", 60],
    ["1 hour", 60],
    ["1h 30m", 90],
    ["1:30", 90],
    ["1.5 hours", 90],
    ["half an hour", 30],
  ])("reads %s as %i minutes", (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it("refuses what is not a time", () => {
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("500")).toBeNull();
  });
});

describe("parseRoster", () => {
  const list = `Section A:
Rania
Prachi

Section B:
Ismail
Zoya
Section C
Mehrbano`;

  it("puts names under the heading above them", () => {
    const rows = parseRoster(list);
    expect(rows.map((r) => `${r.section}/${r.name}`)).toEqual([
      "Section A/Rania",
      "Section A/Prachi",
      "Section B/Ismail",
      "Section B/Zoya",
      "Section C/Mehrbano",
    ]);
  });

  it("reuses the event's own section names", () => {
    const rows = parseRoster("a:\nRania", ["Section A", "Section B"]);
    expect(rows[0].section).toBe("Section A");
  });

  it("reads CSV columns, skipping a header row", () => {
    const rows = parseRoster("Name,Section,Category\nRania,Section A,Beginner\nHuda,B,Masters", ["Section A", "Section B"]);
    expect(rows).toEqual([
      { name: "Rania", section: "Section A", category: "beginner" },
      { name: "Huda", section: "Section B", category: "masters" },
    ]);
  });

  it("reads tab-separated text pasted from a spreadsheet", () => {
    expect(parseRoster("Rania\tSection A")[0]).toMatchObject({ name: "Rania", section: "Section A" });
  });

  it("strips bullets and numbers, and drops duplicates in a section", () => {
    const rows = parseRoster("Section A:\n1. Rania\n- Rania\n• Prachi");
    expect(rows.map((r) => r.name)).toEqual(["Rania", "Prachi"]);
  });

  it("keeps two students with the same name in different sections", () => {
    const rows = parseRoster("Section A:\nZoya\nSection B:\nZoya");
    expect(rows).toHaveLength(2);
  });
});

describe("parseCommand", () => {
  it("adds students to a section", () => {
    expect(parseCommand("add Rania to Section A")).toEqual({ kind: "add", names: ["Rania"], section: "Section A" });
    expect(parseCommand("add Rania, Prachi and Khizer to section b beginner")).toEqual({
      kind: "add",
      names: ["Rania", "Prachi", "Khizer"],
      section: "Section B",
      category: "beginner",
    });
  });

  it("sets times for rounds", () => {
    expect(parseCommand("round 1 is 20 minutes, round 2 is 25 minutes")).toEqual({
      kind: "round-times",
      items: [
        { round: 1, minutes: 20 },
        { round: 2, minutes: 25 },
      ],
    });
    expect(parseCommand("set round 3 to 1h")).toEqual({ kind: "round-times", items: [{ round: 3, minutes: 60 }] });
    expect(parseCommand("set every round to 30 minutes")).toEqual({ kind: "round-times", items: [{ round: "all", minutes: 30 }] });
    expect(parseCommand("round time 25")).toEqual({ kind: "round-times", items: [{ round: "all", minutes: 25 }] });
  });

  it("pairs, publishes and runs the clock", () => {
    expect(parseCommand("pair round 2")).toEqual({ kind: "pair", mode: "auto" });
    expect(parseCommand("pair by hand")).toEqual({ kind: "pair", mode: "hand" });
    expect(parseCommand("publish")).toEqual({ kind: "publish" });
    expect(parseCommand("start the round")).toEqual({ kind: "clock", action: "start" });
    expect(parseCommand("add 5 minutes")).toEqual({ kind: "extend", minutes: 5 });
    expect(parseCommand("pause")).toEqual({ kind: "clock", action: "pause" });
  });

  it("changes rounds, sections and who plays", () => {
    expect(parseCommand("set rounds to 4")).toEqual({ kind: "rounds", count: 4 });
    expect(parseCommand("4 rounds")).toEqual({ kind: "rounds", count: 4 });
    expect(parseCommand("sections: A, B, C")).toEqual({ kind: "sections", names: ["Section A", "Section B", "Section C"] });
    expect(parseCommand("masters only")).toEqual({ kind: "mode", mode: "masters" });
    expect(parseCommand("both")).toEqual({ kind: "mode", mode: "both" });
  });

  it("moves, renames and deletes students", () => {
    expect(parseCommand("move Zoya (Section B) to Section C")).toEqual({
      kind: "move",
      name: "Zoya",
      fromSection: "Section B",
      section: "Section C",
    });
    expect(parseCommand("move Huda to masters")).toEqual({ kind: "move", name: "Huda", category: "masters" });
    expect(parseCommand("rename Zoya to Zoya Khan")).toEqual({ kind: "rename", from: "Zoya", to: "Zoya Khan" });
    expect(parseCommand("delete Ahmed")).toEqual({ kind: "delete", name: "Ahmed" });
  });

  it("reads a score", () => {
    expect(parseCommand("Rania 320 Prachi 280")).toEqual({ kind: "score", a: "Rania", scoreA: 320, b: "Prachi", scoreB: 280 });
    expect(parseCommand("Rania beat Prachi 320 to 280")).toEqual({ kind: "score", a: "Rania", scoreA: 320, b: "Prachi", scoreB: 280 });
  });

  it("does not guess", () => {
    expect(parseCommand("make me a sandwich")).toEqual({ kind: "unknown" });
    expect(parseCommand("")).toEqual({ kind: "unknown" });
  });
});
