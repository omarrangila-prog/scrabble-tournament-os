import { describe, expect, it } from "vitest";

import { mapHeader, parseSource, roundsIn } from "./parse";

describe("recognising columns", () => {
  it("finds a column however the source spells it", () => {
    expect(mapHeader(["Rd", "Div", "Tbl", "Player 1", "Player 2"])).toMatchObject({
      round: 0,
      division: 1,
      table: 2,
      player: 3,
      opponent: 4,
    });
  });

  it("does not mistake 'Opponent Score' for the opponent", () => {
    const map = mapHeader(["Player", "Opponent", "Score", "Opponent Score"]);
    expect(map.opponent).toBe(1);
    expect(map.oppScore).toBe(3);
  });

  it("lets the first column claim a field", () => {
    expect(mapHeader(["Player", "Name"]).player).toBe(0);
  });
});

describe("a pairing list", () => {
  const csv = [
    "Round,Division,Table,Player,Opponent",
    "2,Advanced,17,Ahmed Khan,Hammad Ali",
    "2,Advanced,18,Sara Khan,Bilal Raza",
    "2,Beginner,3,Zoya Ali,",
  ].join("\n");

  it("reads rounds, divisions, tables and both players", () => {
    const parsed = parseSource(csv);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.matches).toHaveLength(3);
    expect(parsed.matches[0]).toMatchObject({
      round: 2,
      division: "Advanced",
      table: 17,
      scoreA: null,
      scoreB: null,
    });
    expect(parsed.matches[0].a.name).toBe("Ahmed Khan");
    expect(parsed.matches[0].b?.name).toBe("Hammad Ali");
  });

  it("treats an empty opponent as a bye", () => {
    expect(parseSource(csv).matches[2].b).toBeNull();
  });

  it("reports which rounds it found", () => {
    expect(roundsIn(parseSource(csv))).toEqual([2]);
  });

  it("uses the round it is told when the source has no round column", () => {
    const parsed = parseSource("Table,Player,Opponent\n1,A One,B Two", { defaultRound: 4 });
    expect(parsed.matches[0].round).toBe(4);
  });
});

describe("results", () => {
  it("reads scores from two columns", () => {
    const parsed = parseSource("Table,Player,Score,Opponent,Opponent Score\n1,A One,421,B Two,388");
    expect(parsed.matches[0]).toMatchObject({ scoreA: 421, scoreB: 388 });
  });

  it("reads a single '421-388' cell", () => {
    const parsed = parseSource("Table,Player,Opponent,Score\n1,A One,B Two,421-388");
    expect(parsed.matches[0]).toMatchObject({ scoreA: 421, scoreB: 388 });
  });

  it("drops a score that is not a number, and says so", () => {
    const parsed = parseSource("Table,Player,Score,Opponent,Opponent Score\n1,A One,abc,B Two,388");
    expect(parsed.matches[0].scoreA).toBeNull();
    expect(parsed.warnings.some((w) => /not a score/.test(w.message))).toBe(true);
  });

  it("reads who goes first", () => {
    const parsed = parseSource("Table,Player,Opponent,First\n1,A One,B Two,1st");
    expect(parsed.matches[0].aFirst).toBe(true);
    expect(parseSource("Table,Player,Opponent,First\n1,A One,B Two,2nd").matches[0].aFirst).toBe(false);
  });
});

describe("a player-centric export, where each game appears twice", () => {
  const csv = [
    "Round,Table,Player,Score,Opponent,Opponent Score,First",
    "1,5,Ahmed Khan,421,Hammad Ali,388,1",
    "1,5,Hammad Ali,388,Ahmed Khan,421,2",
    "1,6,Sara Khan,300,Bilal Raza,300,2",
    "1,6,Bilal Raza,300,Sara Khan,300,1",
  ].join("\n");

  it("folds the two views into one game", () => {
    const parsed = parseSource(csv);
    expect(parsed.matches).toHaveLength(2);
    expect(parsed.warnings).toEqual([]);
  });

  it("keeps the scores the right way round", () => {
    const m = parseSource(csv).matches[0];
    expect(m.a.name).toBe("Ahmed Khan");
    expect([m.scoreA, m.scoreB]).toEqual([421, 388]);
    expect(m.aFirst).toBe(true);
  });

  it("flags a source that contradicts itself rather than choosing", () => {
    const bad = csv.replace("Hammad Ali,388,Ahmed Khan,421,2", "Hammad Ali,390,Ahmed Khan,421,2");
    const parsed = parseSource(bad);
    expect(parsed.warnings.some((w) => w.level === "error" && /two different scores/.test(w.message))).toBe(true);
  });
});

describe("an 'A vs B' cell", () => {
  it("splits on the word vs and not on a hyphen in a name", () => {
    const parsed = parseSource("Table,Player\n1,Ahmed Khan vs Hammad Ali-Raza\n2,Sara-Jane Lee vs Bilal");
    expect(parsed.matches[0].a.name).toBe("Ahmed Khan");
    expect(parsed.matches[0].b?.name).toBe("Hammad Ali-Raza");
    expect(parsed.matches[1].a.name).toBe("Sara-Jane Lee");
  });
});

describe("decorated names", () => {
  it("drops a trailing record in brackets", () => {
    const parsed = parseSource("Table,Player,Opponent\n1,Ahmed Khan (3-0 +214),Hammad Ali (2-1 +145)");
    expect(parsed.matches[0].a.name).toBe("Ahmed Khan");
    expect(parsed.matches[0].b?.name).toBe("Hammad Ali");
  });
});

describe("an external id", () => {
  it("is used as the player's key, so a respelling does not lose them", () => {
    const parsed = parseSource("Table,ID,Player,Opponent ID,Opponent\n1,77,A One,88,B Two");
    expect(parsed.matches[0].a.key).toBe("id:77");
    expect(parsed.matches[0].b?.key).toBe("id:88");
  });
});

describe("standings", () => {
  it("are read, but are not matches", () => {
    const parsed = parseSource("Rank,Player,Wins,Losses,Spread\n1,Ahmed Khan,3,0,214\n2,Hammad Ali,2,1,145");
    expect(parsed.matches).toEqual([]);
    expect(parsed.standings).toHaveLength(2);
    expect(parsed.standings[0]).toMatchObject({ rank: 1, wins: 3, losses: 0, spread: 214 });
  });
});

describe("bad input", () => {
  it("says so when there is no table at all", () => {
    const parsed = parseSource("");
    expect(parsed.matches).toEqual([]);
    expect(parsed.warnings.some((w) => w.level === "error")).toBe(true);
  });

  it("says so when there is a table with no recognisable header", () => {
    const parsed = parseSource("foo,bar\n1,2");
    expect(parsed.warnings.some((w) => /header row/.test(w.message))).toBe(true);
  });

  it("reads an HTML page", () => {
    const html =
      "<table><tr><th>Table</th><th>Player</th><th>Opponent</th></tr><tr><td>4</td><td>A One</td><td>B Two</td></tr></table>";
    expect(parseSource(html).matches[0]).toMatchObject({ table: 4 });
  });

  it("joins a pairings table and a results table on one page into one set of games", () => {
    const html = `
      <table><tr><th>Table</th><th>Player</th><th>Opponent</th></tr><tr><td>4</td><td>A One</td><td>B Two</td></tr></table>
      <table><tr><th>Player</th><th>Score</th><th>Opponent</th><th>Opponent Score</th></tr><tr><td>A One</td><td>400</td><td>B Two</td><td>350</td></tr></table>`;
    const parsed = parseSource(html, { defaultRound: 1 });
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0]).toMatchObject({ table: 4, scoreA: 400, scoreB: 350 });
  });
});
