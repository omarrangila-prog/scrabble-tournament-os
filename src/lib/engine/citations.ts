/**
 * Certificate wording, derived from the record.
 *
 * A certificate is a factual claim that outlives the event. The single rule
 * here: **every phrase must be traceable to a verified result.** Nothing in
 * this module invents an achievement, embellishes a performance, or repeats
 * something the participant said about themselves.
 *
 * That last point matters more than it sounds. A participant writes their own
 * experience level and previous tournaments on the registration form. Those are
 * claims, useful for seeding and useless as evidence — a certificate saying
 * "an experienced competitor" because someone ticked a box is a fabrication
 * with a signature on it.
 *
 * So the inputs are wins, spread, placement, attendance and games played, all
 * of which the tournament computed. Wording is *selected* from these figures,
 * never generated freely.
 */

export type CertificateTier = "champion" | "runner-up" | "third" | "special" | "participation";

/** What the tournament recorded about one player. */
export interface PerformanceRecord {
  playerId: string;
  playerName: string;
  division: string;

  /** Final placing within the division, 1-based. */
  rank: number;
  fieldSize: number;

  wins: number;
  losses: number;
  draws: number;
  /** Cumulative points for minus points against. */
  spread: number;

  /** Rounds actually played, against rounds scheduled. */
  gamesPlayed: number;
  roundsScheduled: number;

  /** Highest single game score, if recorded. */
  highestGame?: number;
  /** Highest single word, only when a scorekeeper recorded it. */
  bestWord?: { word: string; points: number };

  /** Rating before and after, when the event was rated. */
  ratingBefore?: number;
  ratingAfter?: number;

  /** True when this was the player's first rated event. */
  isDebut?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Facts                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A single verifiable statement about a performance.
 *
 * `evidence` names the figures it came from, so a director reviewing a
 * certificate can check the claim rather than trust it.
 */
export interface Fact {
  /** Reads as a clause inside a sentence, e.g. "four victories". */
  phrase: string;
  /** How strongly this distinguishes the player. Highest is quoted first. */
  weight: number;
  evidence: string;
}

const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/** Small numbers read better as words in a formal citation. */
function spell(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/**
 * Every true statement available about a performance.
 *
 * Returns only what the figures support. A player who won nothing gets no
 * victory clause rather than a softened one.
 */
export function factsFor(record: PerformanceRecord): Fact[] {
  const facts: Fact[] = [];

  /* ---- Placement ---------------------------------------------------- */

  if (record.rank === 1) {
    facts.push({
      phrase: `first place in the ${record.division} division`,
      weight: 100,
      evidence: `Rank ${record.rank} of ${record.fieldSize}`,
    });
  } else if (record.rank <= 3) {
    facts.push({
      phrase: `${ordinal(record.rank)} place in the ${record.division} division`,
      weight: 90,
      evidence: `Rank ${record.rank} of ${record.fieldSize}`,
    });
  } else if (record.fieldSize >= 8 && record.rank <= Math.ceil(record.fieldSize / 4)) {
    facts.push({
      phrase: `a top-quarter finish in a field of ${record.fieldSize}`,
      weight: 70,
      evidence: `Rank ${record.rank} of ${record.fieldSize}`,
    });
  }

  /* ---- Results ------------------------------------------------------- */

  if (record.wins > 0) {
    facts.push({
      phrase: `${spell(record.wins)} ${record.wins === 1 ? "victory" : "victories"}`,
      weight: 60 + Math.min(20, record.wins),
      evidence: `${record.wins}W ${record.losses}L${record.draws ? ` ${record.draws}D` : ""}`,
    });
  }

  if (record.gamesPlayed > 0 && record.wins === record.gamesPlayed) {
    facts.push({
      phrase: "an unbeaten record",
      weight: 95,
      evidence: `Won all ${record.gamesPlayed} games`,
    });
  }

  /* ---- Spread -------------------------------------------------------- */

  if (record.spread > 0) {
    facts.push({
      phrase: `a positive spread of ${record.spread.toLocaleString("en-PK")}`,
      weight: 50 + Math.min(20, Math.floor(record.spread / 100)),
      evidence: `Spread ${record.spread > 0 ? "+" : ""}${record.spread}`,
    });
  }

  /* ---- Individual highs ---------------------------------------------- */

  if (record.bestWord && record.bestWord.points > 0) {
    facts.push({
      phrase: `a ${record.bestWord.points}-point play of ${record.bestWord.word.toUpperCase()}`,
      weight: 65,
      evidence: `Best word ${record.bestWord.word.toUpperCase()}, ${record.bestWord.points} points`,
    });
  }

  if (record.highestGame && record.highestGame > 0) {
    facts.push({
      phrase: `a highest game of ${record.highestGame}`,
      weight: 45,
      evidence: `Highest game ${record.highestGame}`,
    });
  }

  /* ---- Improvement ---------------------------------------------------- */

  if (
    typeof record.ratingBefore === "number" &&
    typeof record.ratingAfter === "number" &&
    record.ratingAfter > record.ratingBefore
  ) {
    const gain = record.ratingAfter - record.ratingBefore;
    facts.push({
      phrase: `a rating gain of ${gain} points`,
      weight: 55 + Math.min(15, Math.floor(gain / 10)),
      evidence: `Rating ${record.ratingBefore} to ${record.ratingAfter}`,
    });
  }

  /* ---- Attendance ------------------------------------------------------ */

  if (record.roundsScheduled > 0 && record.gamesPlayed === record.roundsScheduled) {
    facts.push({
      phrase: `every one of the ${record.roundsScheduled} rounds played`,
      weight: 30,
      evidence: `Played ${record.gamesPlayed} of ${record.roundsScheduled} rounds`,
    });
  }

  /* ---- Debut ----------------------------------------------------------- */

  if (record.isDebut) {
    facts.push({
      phrase: "a first competitive tournament",
      weight: 40,
      evidence: "No previous rated event",
    });
  }

  return facts.sort((a, b) => b.weight - a.weight);
}

/* -------------------------------------------------------------------------- */
/* Titles                                                                      */
/* -------------------------------------------------------------------------- */

export interface TitleOption {
  title: string;
  /** The figure that earns this title. */
  basis: string;
}

/**
 * Personalised participation titles, each earned by a specific figure.
 *
 * A title nobody qualifies for is never offered. If a player's record supports
 * nothing distinctive, the honest fallback is a plain participation title
 * rather than a flattering invention.
 */
export function titlesFor(record: PerformanceRecord): TitleOption[] {
  const options: TitleOption[] = [];
  const played = record.gamesPlayed;
  const winRate = played > 0 ? record.wins / played : 0;

  if (record.rank === 1)
    options.push({ title: "Division Champion", basis: `Finished 1st of ${record.fieldSize}` });

  if (record.gamesPlayed > 0 && record.wins === record.gamesPlayed)
    options.push({ title: "Unbeaten Performer", basis: `Won all ${played} games` });

  if (record.isDebut && winRate >= 0.5)
    options.push({
      title: "Excellent Tournament Debut",
      basis: `First event, ${record.wins} of ${played} won`,
    });
  else if (record.isDebut)
    options.push({ title: "Promising Tournament Debut", basis: "First competitive event" });

  if (record.spread > 500)
    options.push({
      title: "Strong Positive Spread",
      basis: `Spread +${record.spread.toLocaleString("en-PK")}`,
    });

  if (
    typeof record.ratingBefore === "number" &&
    typeof record.ratingAfter === "number" &&
    record.ratingAfter - record.ratingBefore >= 30
  )
    options.push({
      title: "Most Improved",
      basis: `Rating ${record.ratingBefore} to ${record.ratingAfter}`,
    });

  if (winRate >= 0.4 && winRate <= 0.6 && played >= 4)
    options.push({
      title: "Consistent Performer",
      basis: `${record.wins}W ${record.losses}L across ${played} games`,
    });

  if (record.bestWord && record.bestWord.points >= 60)
    options.push({
      title: "Notable Word Play",
      basis: `${record.bestWord.word.toUpperCase()} for ${record.bestWord.points}`,
    });

  if (record.roundsScheduled > 0 && played === record.roundsScheduled && options.length === 0)
    options.push({
      title: "Full Tournament Participation",
      basis: `Played all ${record.roundsScheduled} rounds`,
    });

  // Nothing distinctive in the record is not a failure — it is a plain
  // participation certificate, which is what the player earned.
  if (options.length === 0)
    options.push({
      title: "Certificate of Participation",
      basis: `Played ${played} game${played === 1 ? "" : "s"}`,
    });

  return options;
}

/* -------------------------------------------------------------------------- */
/* Citations                                                                   */
/* -------------------------------------------------------------------------- */

export interface Citation {
  /** The sentence printed on the certificate. */
  text: string;
  /** Every figure the sentence rests on, for the director to check. */
  evidence: string[];
}

/**
 * Builds the citation sentence.
 *
 * Uses the participant's name rather than a pronoun throughout: the platform
 * does not record anyone's pronouns, and guessing from a name would misgender
 * real people on a document they keep.
 *
 * At most three clauses — a citation listing everything reads as padding and
 * buries whatever the player actually did well.
 */
export function buildCitation(
  record: PerformanceRecord,
  tier: CertificateTier,
  maxClauses = 3,
): Citation {
  const facts = factsFor(record).slice(0, Math.max(1, maxClauses));

  if (facts.length === 0) {
    return {
      text: `In recognition of ${record.playerName}'s participation in the ${record.division} division.`,
      evidence: [`Entered the ${record.division} division`],
    };
  }

  const phrases = facts.map((f) => f.phrase);
  const joined =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;

  const opening =
    tier === "champion" || tier === "runner-up" || tier === "third"
      ? "Awarded to"
      : "Presented to";

  return {
    text: `${opening} ${record.playerName} in recognition of ${joined}.`,
    evidence: facts.map((f) => f.evidence),
  };
}

/** Which tier a record earns, before any special award is applied. */
export function tierFor(record: PerformanceRecord): CertificateTier {
  if (record.rank === 1) return "champion";
  if (record.rank === 2) return "runner-up";
  if (record.rank === 3) return "third";
  return "participation";
}

/* -------------------------------------------------------------------------- */
/* Guard                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Checks a citation contains nothing the record cannot support.
 *
 * A director may edit wording by hand, and an edited citation is still a
 * factual claim the organization signs. This catches superlatives that no
 * figure backs — "best", "outstanding", "exceptional" — so praise that was not
 * earned is caught before it is printed rather than after.
 */
export function unsupportedClaims(text: string, record: PerformanceRecord): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();

  const superlatives = ["best", "finest", "greatest", "top ", "highest", "outstanding", "exceptional"];
  const isTopThree = record.rank <= 3;
  for (const word of superlatives) {
    if (lower.includes(word) && !isTopThree && !record.bestWord && !record.highestGame) {
      problems.push(
        `"${word.trim()}" is not supported by this record: finished ${ordinal(record.rank)} of ${record.fieldSize} with no recorded high score.`,
      );
      break;
    }
  }

  if (lower.includes("unbeaten") && record.losses > 0)
    problems.push(`"unbeaten" contradicts the record: ${record.losses} loss${record.losses === 1 ? "" : "es"}.`);

  if (lower.includes("champion") && record.rank !== 1)
    problems.push(`"champion" contradicts the record: finished ${ordinal(record.rank)}.`);

  if (lower.includes("undefeated") && record.losses > 0)
    problems.push(`"undefeated" contradicts the record: ${record.losses} recorded.`);

  return problems;
}
