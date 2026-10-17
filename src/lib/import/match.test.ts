import { describe, expect, it } from "vitest";

import { matchPlayers, resolution, skippedKeys, summarise, type RosterPlayer } from "./match";
import type { ExternalPlayerRef } from "./parse";
import { nameKey } from "./names";

const roster: RosterPlayer[] = [
  { id: "r1", name: "Ahmed Khan", number: "101", division: "advanced", checkedIn: true },
  { id: "r2", name: "Hammad Ali", number: "102", division: "advanced", checkedIn: true },
  { id: "r3", name: "Sara Khan", number: "103", division: "beginner", checkedIn: false },
  { id: "r4", name: "Bilal Raza", number: "104", division: "beginner", checkedIn: true },
  { id: "r5", name: "Zoya Ali", number: "105", division: "recreational", checkedIn: true },
  { id: "r6", name: "Zoya Ali", number: "106", division: "beginner", checkedIn: true },
];

const ref = (name: string, extra: Partial<ExternalPlayerRef> = {}): ExternalPlayerRef => ({
  name,
  key: nameKey(name),
  ...extra,
});

describe("an exact match", () => {
  it("is the same name apart from capitals, spacing and punctuation", () => {
    const [m] = matchPlayers([ref("  AHMED  khan. ")], roster);
    expect(m).toMatchObject({ status: "exact", recordId: "r1", via: "name" });
  });

  it("is a number together with the same name", () => {
    const [m] = matchPlayers([ref("Ahmed Khan", { number: "101" })], roster);
    expect(m).toMatchObject({ status: "exact", recordId: "r1", via: "number" });
  });

  it("is a saved confirmation from an earlier round, even if the name is respelt", () => {
    const [m] = matchPlayers([ref("Ahmad Khaan")], roster, new Map([[nameKey("Ahmad Khaan"), "r1"]]));
    expect(m).toMatchObject({ status: "exact", recordId: "r1", via: "saved" });
  });

  it("ignores a saved confirmation for somebody who is no longer registered", () => {
    const [m] = matchPlayers([ref("Ghost Player")], roster, new Map([[nameKey("Ghost Player"), "gone"]]));
    expect(m.status).toBe("none");
  });
});

describe("a likely match is never automatic", () => {
  it("is the same words in another order", () => {
    const [m] = matchPlayers([ref("Khan, Ahmed")], roster);
    expect(m.status).toBe("likely");
    expect(m.recordId).toBeNull();
    expect(m.candidates[0]).toMatchObject({ id: "r1", reason: "Same words in a different order" });
  });

  it("is a one-letter slip", () => {
    const [m] = matchPlayers([ref("Ahmad Khan")], roster);
    expect(m.status).toBe("likely");
    expect(m.candidates[0].id).toBe("r1");
  });

  it("is a first name alone, offered with everybody who could be meant", () => {
    const [m] = matchPlayers([ref("Zoya")], roster);
    expect(m.status).toBe("likely");
    expect(m.candidates.map((c) => c.id).sort()).toEqual(["r5", "r6"]);
  });

  it("is a number that fits a different name", () => {
    const [m] = matchPlayers([ref("Somebody Else", { number: "103" })], roster);
    expect(m.status).toBe("likely");
    expect(m.recordId).toBeNull();
    expect(m.candidates[0]).toMatchObject({ id: "r3" });
  });

  it("is two registrations that share one name", () => {
    /* The precondition: the roster really has two Zoya Alis. */
    expect(roster.filter((p) => nameKey(p.name) === "zoya ali")).toHaveLength(2);
    const [m] = matchPlayers([ref("Zoya Ali")], roster);
    expect(m.status).toBe("likely");
    expect(m.candidates).toHaveLength(2);
  });
});

describe("no match", () => {
  it("is a name nothing resembles", () => {
    const [m] = matchPlayers([ref("Quentin Tarantino")], roster);
    expect(m).toMatchObject({ status: "none", recordId: null, candidates: [] });
  });
});

describe("one answer per outside player", () => {
  it("looks each distinct player up once", () => {
    const matches = matchPlayers([ref("Ahmed Khan"), ref("ahmed khan"), ref("Sara Khan")], roster);
    expect(matches).toHaveLength(2);
  });
});

describe("resolving with a person's confirmations", () => {
  const matches = matchPlayers([ref("Ahmed Khan"), ref("Khan, Sara"), ref("Nobody Known")], roster);

  it("uses exact matches as they are", () => {
    const resolved = resolution(matches, new Map());
    expect(resolved.get(nameKey("Ahmed Khan"))).toBe("r1");
    expect(resolved.has(nameKey("Khan, Sara"))).toBe(false);
  });

  it("uses a confirmed likely match", () => {
    const resolved = resolution(matches, new Map([[nameKey("Khan, Sara"), "r3"]]));
    expect(resolved.get(nameKey("Khan, Sara"))).toBe("r3");
  });

  it("leaves out a player the person chose to leave out", () => {
    const resolved = resolution(matches, new Map([[nameKey("Nobody Known"), null]]));
    expect(resolved.has(nameKey("Nobody Known"))).toBe(false);
  });

  it("lets a person correct an exact match, because the same name can be the other person", () => {
    const resolved = resolution(matches, new Map([[nameKey("Ahmed Khan"), "r2"]]));
    expect(resolved.get(nameKey("Ahmed Khan"))).toBe("r2");
  });

  it("lets a person leave out even an exact match", () => {
    const choices = new Map<string, string | null>([[nameKey("Ahmed Khan"), null]]);
    expect(resolution(matches, choices).has(nameKey("Ahmed Khan"))).toBe(false);
    expect([...skippedKeys(choices)]).toEqual([nameKey("Ahmed Khan")]);
  });

  it("counts what is still unresolved", () => {
    expect(summarise(matches, new Map())).toEqual({ exact: 1, likely: 1, none: 1, unresolved: 2 });
    expect(summarise(matches, new Map([[nameKey("Khan, Sara"), "r3"]])).unresolved).toBe(1);
  });

  it("does not count a player deliberately left out as unresolved", () => {
    const left = new Map<string, string | null>([[nameKey("Nobody Known"), null]]);
    expect(summarise(matches, left).unresolved).toBe(1);
  });
});
