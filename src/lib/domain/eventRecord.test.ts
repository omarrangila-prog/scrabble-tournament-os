import { describe, expect, it } from "vitest";

import {
  EVENT,
  allPlayers,
  bestGame,
  findPlayer,
  formatRecord,
  highestGame,
  honourFor,
  playedRounds,
} from "./eventRecord";

const division = (code: string) => EVENT.divisions.find((d) => d.code === code)!;

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
      expect(Math.max(...player.rounds.map((r) => r.round))).toBeLessThanOrEqual(3);
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
  it("names the winner and the runner-up from the official standings", () => {
    for (const div of EVENT.divisions) {
      const ranked = div.players.filter((p) => p.ranked).sort((a, b) => a.rank! - b.rank!);
      expect(honourFor(ranked[0], div).title).toBe(`Winner — ${div.name}`);
      expect(honourFor(ranked[1], div).title).toBe(`Runner-up — ${div.name}`);
    }
  });

  it("never leaves anybody without a title", () => {
    for (const { player, division: div } of allPlayers()) {
      const honour = honourFor(player, div);
      expect(honour.title.trim().length).toBeGreaterThan(0);
      expect(honour.citation.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not call a forfeit somebody's best game", () => {
    /* TSH writes a walkover as 150-50 and a double walkover as 50-50. */
    const forfeited = allPlayers().find(({ player }) =>
      player.rounds.some((r) => r.scoreFor === 150 && r.scoreAgainst === 50),
    );
    expect(forfeited).toBeDefined();
    const best = bestGame(forfeited!.player);
    expect(best?.scoreFor).not.toBe(150);
    expect(playedRounds(forfeited!.player).length).toBeLessThan(
      forfeited!.player.rounds.length,
    );
  });

  it("awards the division's high game to the player who actually scored it", () => {
    const advanced = division("A");
    const top = highestGame(advanced)!;
    expect(top.score).toBe(565);
    expect(top.by).toBe("Hassan Hadi");
  });

  it("reads a half point as a draw", () => {
    const drawn = division("B").players.find((p) => p.name === "Zainab Zuberi")!;
    expect(formatRecord(drawn)).toBe("2.5–0.5");
    expect(drawn.rounds.some((r) => r.result === "drew")).toBe(true);
  });

  it("leaves a withdrawn player unranked rather than inventing a place", () => {
    const withdrawn = findPlayer("ramlah-hashim-r8");
    expect(withdrawn).not.toBeNull();
    expect(withdrawn!.player.ranked).toBe(false);
    expect(withdrawn!.player.rank).toBeNull();
    expect(honourFor(withdrawn!.player, withdrawn!.division).title).not.toMatch(/Winner|Runner/);
  });
});

describe("a drawn round", () => {
  it("keeps a player who drew from being called unbeaten", () => {
    const drawn = findPlayer("zainab-zuberi-b1")!;
    expect(drawn.player.rounds.some((r) => r.result === "drew")).toBe(true);
    expect(honourFor(drawn.player, drawn.division).title).not.toBe("Unbeaten");
  });

  it("still calls a player with three straight wins unbeaten", () => {
    const clean = allPlayers().find(
      ({ player }) =>
        player.rank !== null &&
        player.rank > 2 &&
        player.rounds.length === 3 &&
        player.rounds.every((r) => r.result === "won"),
    );
    if (clean) expect(honourFor(clean.player, clean.division).title).toBe("Unbeaten");
  });
});
