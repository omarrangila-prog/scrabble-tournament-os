/**
 * The line that makes a certificate that person's own.
 *
 * Everybody gets one, not only the winners. Somebody who finished sixth still played the
 * day, and a certificate that says nothing about them is a form letter — but the way to
 * fix that is not to tell them they were excellent. Every note here is a fact drawn from
 * their own results, chosen because it is the most distinctive true thing available.
 *
 * The rules that matter:
 *
 *   - Nothing is invented. If a player has no distinguishing figure, the note says what
 *     they did — played every round — rather than inventing praise. A compliment nobody
 *     earned devalues the ones that were.
 *   - Superlatives are checked against the field. "Highest game of the day" is only used
 *     when it actually was; a tie makes it "among the highest", because two people
 *     cannot each have the highest.
 *   - Notes are chosen to differ within a division where the facts allow it, so a table
 *     of certificates does not read as the same sentence repeated.
 */

import type { PerformanceRecord } from "./citations";

export interface PersonalNote {
  /** The sentence printed on the certificate. */
  text: string;
  /** Why it is true, for a director checking before issuing. */
  evidence: string;
}

/** How distinctive a note is. Higher wins when a player qualifies for several. */
type Candidate = PersonalNote & { weight: number };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Every true note for this player, best first.
 *
 * `field` is the whole division, which is what makes a superlative checkable. Without it
 * the best this could say is "scored 431", which is a number rather than a compliment.
 */
function candidatesFor(record: PerformanceRecord, field: PerformanceRecord[]): Candidate[] {
  const out: Candidate[] = [];

  /*
   * Only this player's own category.
   *
   * Every superlative below is worded "in the <category> category", and comparing against
   * the whole event made those claims false: a beginner was told their score was the
   * highest in the beginner category after being measured against the recreational
   * players. Categories are the unit these prizes are awarded in, so they are the unit
   * the wording has to be checked against.
   */
  const category = field.filter((r) => r.division === record.division);
  const others = category.filter((r) => r.playerId !== record.playerId);

  /* ---- Unbeaten, which speaks for itself ------------------------------- */
  if (record.gamesPlayed > 1 && record.losses === 0 && record.draws === 0) {
    out.push({
      weight: 100,
      text: `unbeaten across ${plural(record.gamesPlayed, "game", "games")}`,
      evidence: `${record.wins} wins, no losses`,
    });
  }

  /* ---- The highest single game ----------------------------------------- */
  if (record.highestGame && record.highestGame > 0) {
    const higher = others.filter((r) => (r.highestGame ?? 0) > record.highestGame!).length;
    const equal = others.filter((r) => (r.highestGame ?? 0) === record.highestGame).length;

    if (higher === 0 && equal === 0) {
      out.push({
        weight: 95,
        text: `whose ${record.highestGame} was the highest single game in the ${record.division} category`,
        evidence: `Highest game in the category: ${record.highestGame}`,
      });
    } else if (higher === 0) {
      /*
       * A tie. Both players scored it, so neither can be told they alone did — the
       * wording has to survive the other person reading their certificate too.
       */
      out.push({
        weight: 90,
        text: `whose ${record.highestGame} was among the highest single games in the ${record.division} category`,
        evidence: `Joint highest game in the category: ${record.highestGame}`,
      });
    } else if (higher < Math.max(1, Math.ceil(category.length / 3))) {
      out.push({
        weight: 60,
        text: `who put together a ${record.highestGame} along the way`,
        evidence: `Best game: ${record.highestGame}`,
      });
    }
  }

  /* ---- Best margin, which is not the same as winning most -------------- */
  if (record.gamesPlayed > 0 && record.spread > 0) {
    const better = others.filter((r) => r.spread > record.spread).length;
    if (better === 0 && others.length > 0) {
      out.push({
        weight: 85,
        text: `who finished with the strongest points margin in the ${record.division} category`,
        evidence: `Best spread in the category: +${record.spread}`,
      });
    }
  }

  /* ---- A best word, when a scorekeeper actually recorded one ----------- */
  if (record.bestWord && record.bestWord.points > 0) {
    out.push({
      weight: 80,
      text: `who found ${record.bestWord.word.toUpperCase()} for ${record.bestWord.points}`,
      evidence: `Best word recorded: ${record.bestWord.word} (${record.bestWord.points})`,
    });
  }

  /* ---- Winning most games without topping the table -------------------- */
  if (record.wins > 0 && record.rank > 1) {
    const moreWins = others.filter((r) => r.wins > record.wins).length;
    if (moreWins === 0) {
      out.push({
        weight: 75,
        text: `who won ${plural(record.wins, "game", "games")} — as many as anyone in the ${record.division} category`,
        evidence: `${record.wins} wins, level with the most in the category`,
      });
    } else if (record.wins >= Math.ceil(record.gamesPlayed / 2) && record.gamesPlayed > 1) {
      out.push({
        weight: 40,
        text: `who won ${plural(record.wins, "game", "games")} of ${record.gamesPlayed}`,
        evidence: `${record.wins} wins from ${record.gamesPlayed} games`,
      });
    }
  }

  /* ---- A first event ---------------------------------------------------- */
  if (record.isDebut) {
    out.push({
      weight: 35,
      text: "at their first tournament",
      evidence: "First rated event",
    });
  }

  /* ---- Turning up for all of it ---------------------------------------- */
  if (record.roundsScheduled > 1 && record.gamesPlayed >= record.roundsScheduled) {
    out.push({
      weight: 20,
      text: `who played every one of the ${record.roundsScheduled} rounds`,
      evidence: `Played all ${record.roundsScheduled} rounds`,
    });
  }

  /*
   * The floor. Says what happened and nothing more — no adjective, because there is no
   * figure behind one. This is what somebody who lost every game receives, and it should
   * not read as a consolation prize.
   */
  if (record.gamesPlayed > 0) {
    out.push({
      weight: 10,
      /*
       * No category here. The sentence above already names it, and "for finishing 1st in
       * the recreational category / who played 1 game in the recreational category" reads
       * as a stutter on the printed page.
       */
      text: `who played ${plural(record.gamesPlayed, "game", "games")} on the day`,
      evidence: `${record.gamesPlayed} games played`,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/**
 * One note per player, chosen so a division's certificates differ where the facts allow.
 *
 * Assigning each player their own best note independently would give every strong player
 * the same sentence. Working through the field in ranking order and preferring an unused
 * note spreads them out, while never reaching for something untrue — a player with only
 * one available note keeps it, even if somebody above them already used it.
 */
export function personalNotes(field: PerformanceRecord[]): Map<string, PersonalNote> {
  const order = [...field].sort((a, b) => a.rank - b.rank);
  const used = new Set<string>();
  const notes = new Map<string, PersonalNote>();

  for (const record of order) {
    const candidates = candidatesFor(record, field);
    const fresh = candidates.find((c) => !used.has(c.text));
    const chosen = fresh ?? candidates[0];

    if (!chosen) continue;

    used.add(chosen.text);
    notes.set(record.playerId, { text: chosen.text, evidence: chosen.evidence });
  }

  return notes;
}

/** The note for one player, when the whole field is to hand. */
export function personalNote(
  record: PerformanceRecord,
  field: PerformanceRecord[],
): PersonalNote | undefined {
  return personalNotes(field).get(record.playerId);
}
