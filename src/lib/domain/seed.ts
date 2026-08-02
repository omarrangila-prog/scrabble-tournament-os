/**
 * Deterministic demo-data generator.
 *
 * Everything here is derived from a fixed seed so the demo looks identical on
 * every machine and after every "Reset Demo Data". Rounds 1–4 are played and
 * verified; round 5 is live with the exact operational picture the spec calls
 * for (61 live, 1 complete, 3 pending).
 */

import {
  ActivityEntry,
  Announcement,
  AuditEntry,
  Dispute,
  Division,
  DivisionId,
  MessageCampaign,
  Organization,
  Pairing,
  Player,
  ResultSubmission,
  Round,
  Tournament,
  User,
  Venue,
} from "./types";
import { CITIES, CLUBS, FEMALE_FIRST, LAST, MALE_FIRST, SCHOOLS } from "./names";

/** Mulberry32 — small, fast, deterministic PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];
const int = (r: () => number, min: number, max: number) =>
  Math.floor(r() * (max - min + 1)) + min;

export const DEMO_DATE = "2026-07-31";
const T = (h: number, m: number) =>
  new Date(`${DEMO_DATE}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:00`).toISOString();

export const ORGANIZATION: Organization = {
  id: "org-federation",
  name: "Bluffy Alphabattle",
  country: "Pakistan",
  contactEmail: "info@tournamentos.demo",
};

export const VENUE: Venue = {
  id: "venue-nseh",
  name: "National Sports & Events Hall",
  city: "Karachi",
  halls: ["Hall A — Masters & Open", "Hall B — Youth & Junior", "Hall C — Overflow"],
  // Ground-floor boards; used by the accessibility pairing constraint.
  accessibleBoards: Array.from({ length: 20 }, (_, i) => i + 1),
  totalBoards: 72,
};

export const DIVISIONS: Division[] = [
  { id: "masters", name: "Masters", shortName: "MST", ratingFloor: 1750, ratingCeiling: 2200, accent: "primary" },
  { id: "advanced", name: "Advanced", shortName: "ADV", ratingFloor: 1300, ratingCeiling: 1800, accent: "secondary" },
  { id: "recreational", name: "Recreational", shortName: "REC", ratingFloor: 1100, ratingCeiling: 1650, maxAge: 18, accent: "success" },
  { id: "beginner", name: "Beginner", shortName: "NOV", ratingFloor: 800, ratingCeiling: 1350, maxAge: 14, accent: "warning" },
];

export const USERS: User[] = [
  { id: "u-dir", name: "Sir Hani", email: "director@tournamentos.demo", role: "director", organizationId: "org-federation", initials: "SH" },
  { id: "u-score", name: "Sana Malik", email: "scorekeeper@tournamentos.demo", role: "scorekeeper", organizationId: "org-federation", initials: "SM" },
  { id: "u-check", name: "Bilal Ahmed", email: "checkin@tournamentos.demo", role: "checkin", organizationId: "org-federation", initials: "BA" },
  { id: "u-arb", name: "Farah Qureshi", email: "arbiter@tournamentos.demo", role: "arbiter", organizationId: "org-federation", initials: "FQ" },
  { id: "u-disp", name: "Hamza Nawaz", email: "display@tournamentos.demo", role: "display", organizationId: "org-federation", initials: "HN" },
];

export const TOURNAMENT: Tournament = {
  id: "t-pnsc-2026",
  name: "Bluffy Alphabattle Championship 2026 — Demo",
  organizer: "Bluffy Alphabattle",
  organizationId: "org-federation",
  venueId: "venue-nseh",
  city: "Karachi",
  startDate: "2026-07-29",
  endDate: "2026-08-02",
  timeZone: "Asia/Karachi (PKT, UTC+5)",
  status: "live",
  system: "swiss",
  totalRounds: 9,
  currentRound: 5,
  divisions: ["masters", "advanced", "recreational", "beginner"],
  rankingRules: ["wins", "spread", "head-to-head"],
  constraints: {
    avoidRepeatOpponents: true,
    balanceStarts: true,
    avoidSameClub: true,
    respectAccessibility: true,
    maxRatingGap: 400,
    maxByesPerPlayer: 1,
    rankProximityWindow: 4,
  },
  gameMinutes: 50,
  breakMinutes: 15,
  visibility: "public",
  registrationOpen: false,
  registrationFee: 2500,
  currency: "PKR",
  capacity: 160,
  sponsors: ["Gulf Stationers", "Karachi Book Depot", "PakTel", "Indus Bank"],
};

/** Division sizes total 128. */
const DIVISION_PLAN: { id: DivisionId; count: number; base: number; spread: number }[] = [
  { id: "masters", count: 32, base: 1980, spread: 210 },
  { id: "advanced", count: 48, base: 1560, spread: 240 },
  { id: "recreational", count: 30, base: 1380, spread: 230 },
  { id: "beginner", count: 18, base: 1080, spread: 210 },
];

/**
 * The three specific players the guided demo drives. They are pinned to fixed
 * identities so the script ("Ahmad Raza 498 — Usman Ali 472") always works.
 */
export const DEMO_PLAYER_A = "PK-003";
export const DEMO_PLAYER_B = "PK-018";

function buildPlayers(): Player[] {
  const r = rng(20260731);
  const players: Player[] = [];
  let n = 0;

  for (const plan of DIVISION_PLAN) {
    const isYouth = plan.id === "recreational" || plan.id === "beginner";
    for (let i = 0; i < plan.count; i++) {
      n += 1;
      const female = r() < (isYouth ? 0.42 : 0.3);
      const first = female ? pick(r, FEMALE_FIRST) : pick(r, MALE_FIRST);
      const last = pick(r, LAST);
      const playerId = `PK-${String(n).padStart(3, "0")}`;
      const rating = Math.round(plan.base + (r() - 0.5) * plan.spread * 2);
      const ratingStatus =
        r() < 0.06 ? "unrated" : r() < 0.14 ? "provisional" : "rated";

      players.push({
        id: `p-${n}`,
        playerId,
        fullName: `${first} ${last}`,
        initials: `${first[0]}${last[0]}`,
        avatarHue: (n * 47) % 360,
        city: pick(r, CITIES),
        club: isYouth ? pick(r, SCHOOLS) : pick(r, CLUBS),
        division: plan.id,
        rating: ratingStatus === "unrated" ? 0 : rating,
        ratingStatus,
        seed: 0, // assigned after sort
        wins: 0,
        losses: 0,
        draws: 0,
        spread: 0,
        rank: 0,
        previousRank: 0,
        checkIn: "checked-in",
        checkInAt: T(8, int(r, 10, 55)),
        attendance: {},
        opponentHistory: [],
        boardHistory: [],
        byeRounds: [],
        tournamentHistory:
          r() < 0.55
            ? [
                { year: 2025, event: "National Championship", place: `${int(r, 2, 40)}th` },
                { year: 2024, event: "Sindh Open", place: `${int(r, 1, 24)}th` },
              ]
            : [{ year: 2025, event: "Regional Qualifier", place: `${int(r, 3, 30)}th` }],
        emergencyContact: {
          name: `${pick(r, MALE_FIRST)} ${last}`,
          relationship: isYouth ? "Parent" : "Sibling",
          phone: `+92 3${int(r, 10, 49)} ${int(r, 1000000, 9999999)}`,
        },
        accommodation:
          r() < 0.05
            ? pick(r, [
                "Wheelchair access required — ground-floor board",
                "Large-print tiles requested",
                "Requires seating near exit",
                "Hearing assistance — quiet board preferred",
              ])
            : undefined,
        payment: r() < 0.9 ? "paid" : r() < 0.6 ? "pending" : "waived",
        registeredAt: new Date(2026, 5, int(r, 1, 28)).toISOString(),
      });
    }
  }

  // Pin the two guided-demo identities.
  const a = players.find((p) => p.playerId === DEMO_PLAYER_A)!;
  a.fullName = "Ahmad Raza";
  a.initials = "AR";
  a.division = "masters";
  a.rating = 2064;
  a.ratingStatus = "rated";
  a.city = "Karachi";
  a.club = "Karachi Scrabble Club";
  a.accommodation = undefined;

  const b = players.find((p) => p.playerId === DEMO_PLAYER_B)!;
  b.fullName = "Usman Ali";
  b.initials = "UA";
  b.division = "masters";
  b.rating = 2031;
  b.ratingStatus = "rated";
  b.city = "Lahore";
  b.club = "Lahore Word Masters";
  b.accommodation = undefined;

  // Seed within each division by rating, unrated last.
  for (const d of DIVISIONS) {
    const pool = players
      .filter((p) => p.division === d.id)
      .sort((x, y) => (y.rating || -1) - (x.rating || -1));
    pool.forEach((p, i) => (p.seed = i + 1));
  }

  return players;
}

/**
 * Pairs an ordered queue so that no two players who have already met are put
 * together. Backtracks when a greedy choice would strand the tail with only
 * rematches left; falls back to the nearest opponent if the field genuinely
 * offers no alternative.
 */
function foldPairs(queue: Player[]): [Player, Player][] {
  const result: [Player, Player][] = [];

  const solve = (pool: Player[]): boolean => {
    if (pool.length === 0) return true;
    const a = pool[0];
    const rest = pool.slice(1);
    for (let i = 0; i < rest.length; i++) {
      if (a.opponentHistory.includes(rest[i].id)) continue;
      const b = rest[i];
      result.push([a, b]);
      if (solve([...rest.slice(0, i), ...rest.slice(i + 1)])) return true;
      result.pop();
    }
    return false;
  };

  if (!solve(queue)) {
    // No perfect assignment exists — pair in order and let the engine flag it.
    result.length = 0;
    for (let i = 0; i + 1 < queue.length; i += 2) result.push([queue[i], queue[i + 1]]);
  }
  return result;
}

/**
 * Plays rounds 1..4 deterministically, filling W/L/D, spread and history.
 * Higher rating wins more often, with enough upsets to make analytics honest.
 */
function playHistory(players: Player[]): {
  pairings: Pairing[];
  rounds: Round[];
} {
  const r = rng(77001);
  const pairings: Pairing[] = [];
  const rounds: Round[] = [];
  let boardCounter = 1;

  for (let round = 1; round <= 4; round++) {
    boardCounter = 1;
    for (const d of DIVISIONS) {
      // Sort by current record then rating — a plain Swiss ordering.
      const pool = players
        .filter((p) => p.division === d.id)
        .sort(
          (x, y) =>
            y.wins - x.wins || y.spread - x.spread || (y.rating || 0) - (x.rating || 0),
        );

      const queue = [...pool];
      // Odd division → lowest-ranked player without a bye receives one.
      if (queue.length % 2 === 1) {
        const idx = [...queue].reverse().findIndex((p) => p.byeRounds.length === 0);
        const byePlayer = idx >= 0 ? queue[queue.length - 1 - idx] : queue[queue.length - 1];
        queue.splice(queue.indexOf(byePlayer), 1);
        byePlayer.byeRounds.push(round);
        byePlayer.wins += 1;
        byePlayer.spread += 50;
        byePlayer.attendance[round] = true;
        pairings.push({
          id: `pr-${round}-bye-${byePlayer.id}`,
          tournamentId: TOURNAMENT.id,
          round,
          division: d.id,
          board: 0,
          playerAId: byePlayer.id,
          playerBId: null,
          status: "bye",
          locked: false,
          reason: "Odd player count in division. Bye assigned to the lowest-ranked player who had not yet received one.",
          confidence: 100,
          conflicts: [],
          completedAt: T(9, 30),
        });
      }

      // Swiss fold with backtracking so history contains no repeat meetings.
      for (const [pa, pb] of foldPairs(queue)) {
        const board = boardCounter++;

        const gapFactor = ((pa.rating || 1200) - (pb.rating || 1200)) / 400;
        const pAWin = 1 / (1 + Math.pow(10, -gapFactor));
        const roll = r();
        const draw = r() < 0.03;
        const aWins = roll < pAWin;

        const base = int(r, 330, 470);
        const margin = draw ? 0 : int(r, 12, 180);
        const scoreA = aWins || draw ? base + (draw ? 0 : margin) : base;
        const scoreB = aWins || draw ? base : base + margin;

        if (draw) {
          pa.draws += 1;
          pb.draws += 1;
        } else if (aWins) {
          pa.wins += 1;
          pb.losses += 1;
        } else {
          pb.wins += 1;
          pa.losses += 1;
        }
        pa.spread += scoreA - scoreB;
        pb.spread += scoreB - scoreA;
        pa.opponentHistory.push(pb.id);
        pb.opponentHistory.push(pa.id);
        pa.boardHistory.push(board);
        pb.boardHistory.push(board);
        pa.attendance[round] = true;
        pb.attendance[round] = true;

        pairings.push({
          id: `pr-${round}-${board}`,
          tournamentId: TOURNAMENT.id,
          round,
          division: d.id,
          board,
          playerAId: pa.id,
          playerBId: pb.id,
          scoreA,
          scoreB,
          status: "verified",
          locked: false,
          reason: "Adjacent in standings, no prior meeting, no active restrictions.",
          confidence: int(r, 88, 99),
          conflicts: [],
          startedAt: T(9, 0),
          completedAt: T(10, int(r, 5, 50)),
        });
      }
    }

    rounds.push({
      id: `r-${round}`,
      tournamentId: TOURNAMENT.id,
      number: round,
      status: "complete",
      publishedAt: T(8, 30),
      startsAt: T(9, 0),
      pairingCount: pairings.filter((p) => p.round === round).length,
    });
  }

  return { pairings, rounds };
}

/**
 * Builds the live Round 5 board picture: 61 live, 1 verified, 3 pending
 * verification — matching the operational numbers in the specification.
 */
function buildRoundFive(players: Player[]): { pairings: Pairing[]; round: Round } {
  const r = rng(50505);
  const pairings: Pairing[] = [];
  let board = 1;

  for (const d of DIVISIONS) {
    const pool = players
      .filter((p) => p.division === d.id)
      .sort(
        (x, y) => y.wins - x.wins || y.spread - x.spread || (y.rating || 0) - (x.rating || 0),
      );
    const queue = [...pool];

    if (queue.length % 2 === 1) {
      const idx = [...queue].reverse().findIndex((p) => p.byeRounds.length === 0);
      const byePlayer = idx >= 0 ? queue[queue.length - 1 - idx] : queue[queue.length - 1];
      queue.splice(queue.indexOf(byePlayer), 1);
      pairings.push({
        id: `pr-5-bye-${byePlayer.id}`,
        tournamentId: TOURNAMENT.id,
        round: 5,
        division: d.id,
        board: 0,
        playerAId: byePlayer.id,
        playerBId: null,
        status: "bye",
        locked: false,
        reason: "Odd player count. Lowest-ranked player without a previous bye.",
        confidence: 100,
        conflicts: [],
      });
    }

    const seated = foldPairs(queue);
    for (const [pa, pb] of seated) {
      const b = board++;
      pairings.push({
        id: `pr-5-${b}`,
        tournamentId: TOURNAMENT.id,
        round: 5,
        division: d.id,
        board: b,
        playerAId: pa.id,
        playerBId: pb.id,
        status: "live",
        locked: false,
        reason:
          "These players are adjacent in the standings, have not played each other, have similar records and have no active pairing restrictions.",
        confidence: int(r, 86, 99),
        conflicts: [],
        startedAt: T(11, 15),
      });
    }
  }

  // Board 3 is the guided-demo board: Ahmad Raza vs Usman Ali, still live.
  // Implemented as pairwise slot swaps so no player can ever be duplicated.
  const a = players.find((p) => p.playerId === DEMO_PLAYER_A)!;
  const b = players.find((p) => p.playerId === DEMO_PLAYER_B)!;
  const board3 = pairings.find((p) => p.board === 3 && p.round === 5);

  /** Moves `playerId` into the given slot of `target`, swapping the occupants. */
  const swapInto = (target: Pairing, slot: "playerAId" | "playerBId", playerId: string) => {
    const occupant = target[slot];
    if (occupant === playerId) return;
    if (occupant === null) return;
    const source = pairings.find(
      (p) => p !== target && (p.playerAId === playerId || p.playerBId === playerId),
    );
    // Never displace a bye — that would leave the bye player unassigned.
    if (!source || source.playerBId === null) return;
    const sourceSlot = source.playerAId === playerId ? "playerAId" : "playerBId";
    target[slot] = playerId;
    source[sourceSlot] = occupant;
  };

  if (board3) {
    // Seat B first: pulling B into slot B can otherwise evict A once A is
    // already seated. Ordering this way leaves both seats stable.
    swapInto(board3, "playerBId", b.id);
    swapInto(board3, "playerAId", a.id);
    // If the two ended up crossed, straighten them without touching other boards.
    if (board3.playerAId === b.id && board3.playerBId === a.id) {
      board3.playerAId = a.id;
      board3.playerBId = b.id;
    }
    board3.reason =
      "Both players are on 3–1 records and adjacent in the Masters standings. They have not met in this event.";
    board3.confidence = 96;
  }

  const live = pairings.filter((p) => p.status === "live");

  // 3 boards awaiting verification (14, 33, 51 — referenced by the Copilot).
  for (const bn of [14, 33, 51]) {
    const p = live.find((x) => x.board === bn);
    if (p) {
      p.status = "awaiting-verification";
      p.scoreA = int(r, 380, 470);
      p.scoreB = int(r, 330, 440);
      p.completedAt = T(12, int(r, 10, 40));
    }
  }

  // 1 board already complete and verified.
  const done = live.find((x) => x.board === 7);
  if (done) {
    done.status = "verified";
    done.scoreA = 441;
    done.scoreB = 398;
    done.completedAt = T(12, 5);
  }

  return {
    pairings,
    round: {
      id: "r-5",
      tournamentId: TOURNAMENT.id,
      number: 5,
      status: "in-progress",
      publishedAt: T(11, 0),
      startsAt: T(11, 15),
      pairingCount: pairings.length,
    },
  };
}

/** Applies the spec's attendance picture: 124 in, 3 absent, 1 late. */
function applyAttendance(players: Player[]) {
  const r = rng(31337);
  const eligible = players.filter(
    (p) => p.playerId !== DEMO_PLAYER_A && p.playerId !== DEMO_PLAYER_B,
  );
  const shuffled = [...eligible].sort(() => r() - 0.5);

  shuffled.slice(0, 3).forEach((p) => {
    p.checkIn = "absent";
    p.checkInAt = undefined;
  });
  const late = shuffled[3];
  late.checkIn = "late";
  late.checkInAt = undefined;
  late.expectedArrival = T(13, 15);
}

export function buildSeed() {
  const players = buildPlayers();
  const { pairings: history, rounds } = playHistory(players);
  const { pairings: r5, round: round5 } = buildRoundFive(players);
  applyAttendance(players);

  // Rank players inside their division from the completed rounds.
  for (const d of DIVISIONS) {
    const pool = players
      .filter((p) => p.division === d.id)
      .sort(
        (x, y) => y.wins - x.wins || y.spread - x.spread || (y.rating || 0) - (x.rating || 0),
      );
    pool.forEach((p, i) => {
      p.rank = i + 1;
      p.previousRank = i + 1;
    });
  }

  const pairings = [...history, ...r5];

  /*
   * Position Ahmad Raza for the guided demo.
   *
   * Standings are always derived from verified game scores, so his position is
   * set by adjusting the margins of his own completed games — never by writing
   * a rank directly. Target: 3–1 on a spread that leaves him third behind the
   * two unbeaten players, and first once he beats Usman Ali by 26 on board 3.
   */
  const ahmad = players.find((p) => p.playerId === DEMO_PLAYER_A)!;
  const TARGET_SPREAD = 395;

  const ahmadGames = pairings.filter(
    (p) => p.round <= 4 && p.playerBId !== null && (p.playerAId === ahmad.id || p.playerBId === ahmad.id),
  );
  const currentSpread = ahmadGames.reduce((total, g) => {
    const isA = g.playerAId === ahmad.id;
    return total + ((isA ? g.scoreA! : g.scoreB!) - (isA ? g.scoreB! : g.scoreA!));
  }, 0);

  // Spread the adjustment across the games he won, keeping every score plausible.
  const wins = ahmadGames.filter((g) => {
    const isA = g.playerAId === ahmad.id;
    return (isA ? g.scoreA! : g.scoreB!) > (isA ? g.scoreB! : g.scoreA!);
  });
  if (wins.length > 0) {
    const perGame = Math.round((TARGET_SPREAD - currentSpread) / wins.length);
    for (const g of wins) {
      const isA = g.playerAId === ahmad.id;
      const opponentKey = isA ? "scoreB" : "scoreA";
      // Reduce the opponent's score, with a floor that keeps the game realistic.
      g[opponentKey] = Math.max(240, g[opponentKey]! - perGame);
    }
  }

  // Recompute the affected players' cached record fields from the games.
  for (const p of players) {
    const games = pairings.filter(
      (x) => x.round <= 4 && x.playerBId !== null && (x.playerAId === p.id || x.playerBId === p.id),
    );
    let spread = 0;
    for (const g of games) {
      const isA = g.playerAId === p.id;
      spread += (isA ? g.scoreA! : g.scoreB!) - (isA ? g.scoreB! : g.scoreA!);
    }
    // Byes contributed a fixed nominal spread in playHistory.
    p.spread = spread + p.byeRounds.length * 50;
  }

  // Re-rank each division from the adjusted records.
  for (const d of DIVISIONS) {
    players
      .filter((p) => p.division === d.id)
      .sort((x, y) => y.wins - x.wins || y.spread - x.spread || (y.rating || 0) - (x.rating || 0))
      .forEach((p, i) => {
        p.rank = i + 1;
        p.previousRank = i + 1;
      });
  }
  const allRounds = [...rounds, round5];

  return {
    organization: ORGANIZATION,
    venue: VENUE,
    divisions: DIVISIONS,
    users: USERS,
    tournament: TOURNAMENT,
    players,
    pairings,
    rounds: allRounds,
    submissions: buildSubmissions(players),
    disputes: buildDisputes(players),
    announcements: buildAnnouncements(),
    campaigns: buildCampaigns(),
    audit: buildAudit(),
    activity: buildActivity(),
  };
}

/** The demo score mismatch on board 22: 498–472 vs 498–462. */
function buildSubmissions(players: Player[]): ResultSubmission[] {
  const m1 = players[21];
  const m2 = players[22];
  return [
    {
      id: "sub-1",
      pairingId: "pr-5-22",
      submittedBy: m1?.fullName ?? "Player A",
      submittedByRole: "player",
      scoreA: 498,
      scoreB: 472,
      at: T(12, 18),
      device: "Android · Player App",
      confirmedByA: true,
      confirmedByB: false,
    },
    {
      id: "sub-2",
      pairingId: "pr-5-22",
      submittedBy: m2?.fullName ?? "Player B",
      submittedByRole: "player",
      scoreA: 498,
      scoreB: 462,
      at: T(12, 19),
      device: "iOS · Player App",
      confirmedByA: false,
      confirmedByB: true,
    },
  ];
}

function buildDisputes(players: Player[]): Dispute[] {
  const p = (i: number) => players[i]?.id ?? "p-1";
  return [
    {
      id: "d-1",
      caseNumber: "ARB-2026-014",
      tournamentId: TOURNAMENT.id,
      round: 5,
      board: 22,
      category: "score",
      playerIds: [p(21), p(22)],
      submittedBy: "Sana Malik (Scorekeeper)",
      description:
        "Both players submitted a result for board 22. The winning score agrees at 498 but the losing score differs by 10 points (472 vs 462).",
      evidence: ["Result slip photograph", "Both mobile submissions"],
      ruleReference: "Rule 7.3 — Score reconciliation",
      assignedArbiter: "Farah Qureshi",
      priority: "high",
      status: "reviewing",
      appealAllowed: true,
      timeline: [
        { at: T(12, 19), by: "System", entry: "Score mismatch detected automatically." },
        { at: T(12, 21), by: "Sana Malik", entry: "Case raised to the Arbiter Desk." },
        { at: T(12, 24), by: "Farah Qureshi", entry: "Reviewing the result slip photograph." },
      ],
      createdAt: T(12, 19),
    },
    {
      id: "d-2",
      caseNumber: "ARB-2026-013",
      tournamentId: TOURNAMENT.id,
      round: 4,
      board: 9,
      category: "time",
      playerIds: [p(8), p(9)],
      submittedBy: "Floor Arbiter",
      description: "Clock was not started at the beginning of the game; 3 minutes were reconstructed from the floor log.",
      evidence: ["Floor log entry"],
      ruleReference: "Rule 4.1 — Clock management",
      assignedArbiter: "Farah Qureshi",
      priority: "normal",
      status: "closed",
      decision: "Three minutes restored to both clocks. Game continued without penalty.",
      appealAllowed: false,
      timeline: [
        { at: T(10, 12), by: "Floor Arbiter", entry: "Issue reported." },
        { at: T(10, 20), by: "Farah Qureshi", entry: "Decision issued and both players notified." },
      ],
      createdAt: T(10, 12),
    },
    {
      id: "d-3",
      caseNumber: "ARB-2026-015",
      tournamentId: TOURNAMENT.id,
      round: 5,
      board: 14,
      category: "late-arrival",
      playerIds: [p(40)],
      submittedBy: "Bilal Ahmed (Check-in)",
      description: "Player arrived 12 minutes after the round start. Director decision required on inclusion in round 6.",
      evidence: ["Check-in timestamp"],
      ruleReference: "Rule 2.6 — Late arrival",
      assignedArbiter: "Sir Hani",
      priority: "normal",
      status: "open",
      appealAllowed: true,
      timeline: [{ at: T(11, 27), by: "Bilal Ahmed", entry: "Late arrival logged." }],
      createdAt: T(11, 27),
    },
  ];
}

function buildAnnouncements(): Announcement[] {
  return [
    {
      id: "a-1",
      tournamentId: TOURNAMENT.id,
      title: "Round 5 is under way",
      body: "All boards in Halls A and B are now live. Round 6 pairings will be published once round 5 results are verified.",
      audience: "All players",
      channels: ["in-app", "public-screen"],
      publishedAt: T(11, 15),
      author: "Sir Hani",
      pinned: true,
    },
    {
      id: "a-2",
      tournamentId: TOURNAMENT.id,
      title: "Lunch break timing",
      body: "The break runs from 13:30 to 14:15. Please return to your boards five minutes early.",
      audience: "All players",
      channels: ["in-app", "whatsapp"],
      publishedAt: T(10, 40),
      author: "Sir Hani",
      pinned: false,
    },
    {
      id: "a-3",
      tournamentId: TOURNAMENT.id,
      title: "Beginner prize ceremony",
      body: "The Beginner ceremony will take place in Hall B at 17:00 on the final day.",
      audience: "Beginner",
      channels: ["in-app", "email"],
      publishedAt: T(9, 5),
      author: "Sana Malik",
      pinned: false,
    },
  ];
}

function buildCampaigns(): MessageCampaign[] {
  return [
    { id: "c-1", template: "Pairings published", channel: "whatsapp", audience: "All players", recipients: 128, sent: 128, delivered: 126, failed: 1, pending: 1, sentAt: T(11, 2), status: "sent" },
    { id: "c-2", template: "Check-in reminder", channel: "sms", audience: "All players", recipients: 128, sent: 128, delivered: 124, failed: 2, pending: 2, sentAt: T(8, 0), status: "sent" },
    { id: "c-3", template: "Board changed", channel: "push", audience: "Selected players", recipients: 2, sent: 2, delivered: 2, failed: 0, pending: 0, sentAt: T(11, 20), status: "sent" },
    { id: "c-4", template: "Round starting", channel: "in-app", audience: "All players", recipients: 128, sent: 128, delivered: 128, failed: 0, pending: 0, sentAt: T(11, 10), status: "sent" },
    { id: "c-5", template: "Prize ceremony announcement", channel: "email", audience: "All players", recipients: 128, sent: 0, delivered: 0, failed: 0, pending: 128, sentAt: T(16, 0), status: "scheduled" },
  ];
}

function buildAudit(): AuditEntry[] {
  return [
    { id: "au-1", tournamentId: TOURNAMENT.id, at: T(11, 0), user: "Sir Hani", role: "director", action: "Round published", target: "Round 5", newValue: "65 pairings", device: "Desktop · Chrome", reason: "Scheduled round start" },
    { id: "au-2", tournamentId: TOURNAMENT.id, at: T(11, 20), user: "Sir Hani", role: "director", action: "Board reassigned", target: "Board 27", previousValue: "Board 27", newValue: "Board 63", reason: "Table damaged during setup", device: "Desktop · Chrome" },
    { id: "au-3", tournamentId: TOURNAMENT.id, at: T(12, 6), user: "Sana Malik", role: "scorekeeper", action: "Result verified", target: "Board 7", newValue: "441 – 398", device: "Tablet · Safari" },
    { id: "au-4", tournamentId: TOURNAMENT.id, at: T(12, 14), user: "Sir Hani", role: "director", action: "Score corrected", target: "Board 41 (Round 4)", previousValue: "412 – 389", newValue: "412 – 398", reason: "Transcription error on the result slip", device: "Desktop · Chrome" },
    { id: "au-5", tournamentId: TOURNAMENT.id, at: T(9, 42), user: "Bilal Ahmed", role: "checkin", action: "Player checked in", target: "PK-071", newValue: "Checked in via QR", device: "Mobile · Android" },
  ];
}

function buildActivity(): ActivityEntry[] {
  return [
    { id: "ac-1", at: T(12, 6), user: "Sana Malik", message: "Board 3 result verified", kind: "result" },
    { id: "ac-2", at: T(11, 2), user: "Sir Hani", message: "Round 5 pairings published", kind: "pairing" },
    { id: "ac-3", at: T(9, 42), user: "Bilal Ahmed", message: "Player checked in through QR", kind: "checkin" },
    { id: "ac-4", at: T(11, 20), user: "Sir Hani", message: "Board 27 reassigned", kind: "board" },
    { id: "ac-5", at: T(12, 14), user: "Sir Hani", message: "Director corrected a score", kind: "correction" },
    { id: "ac-6", at: T(12, 20), user: "System", message: "Public standings synchronized", kind: "sync" },
  ];
}

export type SeedData = ReturnType<typeof buildSeed>;
