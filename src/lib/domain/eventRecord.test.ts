import { describe, expect, it } from "vitest";

import {
  EVENT,
  allPlayers,
  bestGame,
  findPlayer,
  formatRecord,
  highestGame,
  citationFor,
  ordinal,
  playedRounds,
} from "./eventRecord";

const division = (code: string) =>
  EVENT.divisions.find((d) => d.code === code)!;

describe("the official record", () => {
  it("holds every player from all three divisions", () => {
    expect(EVENT.divisions.map((d) => d.name).sort()).toEqual([
      "Advanced",
      "Beginner",
      "Recreational",
    ]);
    expect(allPlayers()).toHaveLength(59);
  });

  it("gives every player a unique link", () => {
    const slugs = allPlayers().map((e) => e.player.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("numbers a round by when it was played, not by how many games a player had", () => {
    /* Three players sat a round out; their remaining games keep their real round numbers. */
    const short = allPlayers().filter(({ player }) => player.rounds.length < 3);
    expect(short.length).toBeGreaterThan(0);
    for (const { player } of short) {
      expect(player.rounds.map((r) => r.round)).toEqual(
        [...player.rounds.map((r) => r.round)].sort((a, b) => a - b),
      );
      expect(
        Math.max(...player.rounds.map((r) => r.round)),
      ).toBeLessThanOrEqual(3);
    }
  });

  it("keeps both sides of a game consistent", () => {
    for (const { player, division: div } of allPlayers()) {
      for (const round of player.rounds) {
        if (round.opponent === null || round.scoreFor === null) continue;
        const other = div.players.find((p) => p.name === round.opponent);
        if (!other) continue;
        const mirror = other.rounds.find((r) => r.round === round.round);
        if (!mirror || mirror.scoreFor === null) continue;
        expect(mirror.scoreFor).toBe(round.scoreAgainst);
        expect(mirror.scoreAgainst).toBe(round.scoreFor);
      }
    }
  });
});

describe("what a certificate says", () => {
  it("says the same kind of thing for everybody", () => {
    for (const { player, division } of allPlayers()) {
      const citation = citationFor(player, division);
      expect(citation).toContain(division.name);
      expect(citation).toContain("23 August 2026");
      expect(citation.trim().length).toBeGreaterThan(0);
    }
  });

  it("states a ranked player's finishing position, record and spread", () => {
    const winner = findPlayer("hassan-hadi-a4")!;
    const citation = citationFor(winner.player, winner.division);
    expect(citation).toContain("1st of 12");
    expect(citation).toContain("3–0");
    expect(citation).toContain("+653");
  });

  it("claims no position for a player the standings do not rank", () => {
    const withdrawn = findPlayer("ramlah-hashim-r8")!;
    expect(withdrawn.player.ranked).toBe(false);
    expect(withdrawn.player.rank).toBeNull();
    const citation = citationFor(withdrawn.player, withdrawn.division);
    expect(citation).not.toMatch(/finishing/);
    expect(citation).toContain("played 3 rounds");
  });

  it("does not count a walkover as a game played", () => {
    /* TSH writes a walkover as 150-50 and a double walkover as 50-50. */
    const forfeited = allPlayers().find(({ player }) =>
      player.rounds.some((r) => r.scoreFor === 150 && r.scoreAgainst === 50),
    );
    expect(forfeited).toBeDefined();
    expect(bestGame(forfeited!.player)?.scoreFor).not.toBe(150);
    expect(playedRounds(forfeited!.player).length).toBeLessThan(
      forfeited!.player.rounds.length,
    );
  });

  it("awards the division's high game to the player who actually scored it", () => {
    const advanced = EVENT.divisions.find((d) => d.code === "A")!;
    const top = highestGame(advanced)!;
    expect(top.score).toBe(565);
    expect(top.by).toBe("Hassan Hadi");
  });

  it("reads a half point as a draw", () => {
    const beginner = EVENT.divisions.find((d) => d.code === "B")!;
    const drawn = beginner.players.find((p) => p.name === "Zainab Zuberi")!;
    expect(formatRecord(drawn)).toBe("2.5–0.5");
    expect(drawn.rounds.some((r) => r.result === "drew")).toBe(true);
  });

  it("writes an ordinal the way a person would read it", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 33].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "33rd",
    ]);
  });
});
