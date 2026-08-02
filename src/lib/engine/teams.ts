/**
 * Team scoring: schools, clubs or A-vs-B sides played over the same rounds.
 *
 * Team results are *derived*, never entered. Every figure here is computed
 * from the same verified individual games that produce the individual
 * standings, so the two can never disagree. A team cannot be given points; it
 * accumulates them because its players won games.
 *
 * Only verified games count. An unconfirmed or disputed board contributes
 * nothing until it is settled — a team lead that evaporates when a dispute is
 * resolved is worse than no lead at all.
 */

export interface Team {
  id: string;
  eventId: string;
  name: string;
  /** Short label for boards and the venue display, e.g. "LGS". */
  shortName: string;
  /** Registration ids of the players on this team. */
  memberIds: string[];
  colour?: string;
}

/** A verified individual game, as it appears in the official record. */
export interface TeamGame {
  round: number;
  board: number;
  playerId: string;
  opponentId: string;
  playerScore: number;
  opponentScore: number;
  /** Only verified games are counted. */
  verified: boolean;
}

/* -------------------------------------------------------------------------- */
/* Scoring rules                                                               */
/* -------------------------------------------------------------------------- */

export interface TeamScoringRules {
  /** Match points for a win by one of the team's players. */
  winPoints: number;
  /** Match points for a draw. */
  drawPoints: number;
  /** Whether cumulative spread breaks ties before head-to-head. */
  spreadBeforeHeadToHead: boolean;
  /**
   * Caps how much a single blowout contributes to team spread. Zero disables
   * the cap. Without it, one lopsided game can decide a whole team event.
   */
  spreadCapPerGame: number;
}

export const DEFAULT_TEAM_RULES: TeamScoringRules = {
  winPoints: 1,
  drawPoints: 0.5,
  spreadBeforeHeadToHead: false,
  spreadCapPerGame: 0,
};

/* -------------------------------------------------------------------------- */
/* Standings                                                                   */
/* -------------------------------------------------------------------------- */

export interface TeamStanding {
  teamId: string;
  name: string;
  shortName: string;
  /** Games played by members, counting each game once per team. */
  played: number;
  wins: number;
  losses: number;
  draws: number;
  /** Match points under the configured rules. */
  points: number;
  /** Cumulative margin, after any per-game cap. */
  spread: number;
  /** Total points scored by members, for a secondary tie-break. */
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
  /** Games excluded because they were not verified. */
  unverifiedGames: number;
}

/** Which team a player belongs to, or undefined if unassigned. */
function teamOf(teams: Team[], playerId: string): Team | undefined {
  return teams.find((t) => t.memberIds.includes(playerId));
}

/**
 * Computes team standings from verified games.
 *
 * Intra-team games — two members of the same team paired against each other —
 * are excluded entirely. Counting them would award the team a win and a loss
 * and inflate its played count without saying anything about its strength.
 */
export function teamStandings(
  teams: Team[],
  games: TeamGame[],
  rules: TeamScoringRules = DEFAULT_TEAM_RULES,
): TeamStanding[] {
  const rows = new Map<string, TeamStanding>();
  for (const t of teams) {
    rows.set(t.id, {
      teamId: t.id,
      name: t.name,
      shortName: t.shortName,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      spread: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      rank: 0,
      unverifiedGames: 0,
    });
  }

  // Head-to-head match points, for the tie-break.
  const h2h = new Map<string, number>();
  const h2hKey = (a: string, b: string) => `${a}>${b}`;

  for (const g of games) {
    const team = teamOf(teams, g.playerId);
    if (!team) continue;
    const row = rows.get(team.id)!;

    if (!g.verified) {
      row.unverifiedGames += 1;
      continue;
    }

    const opponentTeam = teamOf(teams, g.opponentId);
    // A game between two members of the same team tells us nothing about it.
    if (opponentTeam && opponentTeam.id === team.id) continue;

    const margin = g.playerScore - g.opponentScore;
    const capped =
      rules.spreadCapPerGame > 0
        ? Math.max(-rules.spreadCapPerGame, Math.min(rules.spreadCapPerGame, margin))
        : margin;

    row.played += 1;
    row.pointsFor += g.playerScore;
    row.pointsAgainst += g.opponentScore;
    row.spread += capped;

    if (margin > 0) {
      row.wins += 1;
      row.points += rules.winPoints;
      if (opponentTeam)
        h2h.set(h2hKey(team.id, opponentTeam.id), (h2h.get(h2hKey(team.id, opponentTeam.id)) ?? 0) + rules.winPoints);
    } else if (margin < 0) {
      row.losses += 1;
    } else {
      row.draws += 1;
      row.points += rules.drawPoints;
      if (opponentTeam)
        h2h.set(h2hKey(team.id, opponentTeam.id), (h2h.get(h2hKey(team.id, opponentTeam.id)) ?? 0) + rules.drawPoints);
    }
  }

  const standings = [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    if (rules.spreadBeforeHeadToHead) {
      if (b.spread !== a.spread) return b.spread - a.spread;
    }

    const ab = h2h.get(h2hKey(a.teamId, b.teamId)) ?? 0;
    const ba = h2h.get(h2hKey(b.teamId, a.teamId)) ?? 0;
    if (ab !== ba) return ba - ab;

    if (!rules.spreadBeforeHeadToHead && b.spread !== a.spread) return b.spread - a.spread;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.name.localeCompare(b.name);
  });

  // Equal records share a rank, and the next rank skips accordingly.
  let lastKey = "";
  let lastRank = 0;
  standings.forEach((row, i) => {
    const key = `${row.points}|${row.spread}|${row.pointsFor}`;
    if (key === lastKey) row.rank = lastRank;
    else {
      row.rank = i + 1;
      lastRank = row.rank;
      lastKey = key;
    }
  });

  return standings;
}

/* -------------------------------------------------------------------------- */
/* Head-to-head match                                                          */
/* -------------------------------------------------------------------------- */

export interface TeamMatch {
  round: number;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homePoints: number;
  awayPoints: number;
  homeSpread: number;
  boards: {
    board: number;
    homePlayerId: string;
    awayPlayerId: string;
    homeScore: number;
    awayScore: number;
    verified: boolean;
  }[];
  /** True once every board on this match is verified. */
  settled: boolean;
  /** "home", "away", "draw", or "pending" while boards are unverified. */
  result: "home" | "away" | "draw" | "pending";
}

/**
 * Builds the A-vs-B view of a round.
 *
 * Deliberately reports `pending` rather than a provisional winner while any
 * board is unverified: announcing a team win that later flips is the failure
 * this whole module exists to avoid.
 */
export function teamMatches(
  teams: Team[],
  games: TeamGame[],
  round: number,
  rules: TeamScoringRules = DEFAULT_TEAM_RULES,
): TeamMatch[] {
  const matches = new Map<string, TeamMatch>();

  for (const g of games) {
    if (g.round !== round) continue;

    const home = teamOf(teams, g.playerId);
    const away = teamOf(teams, g.opponentId);
    if (!home || !away || home.id === away.id) continue;

    // One entry per pair of teams, keyed so both sides land on the same match.
    const [first, second] = [home, away].sort((a, b) => a.id.localeCompare(b.id));
    const key = `${first.id}:${second.id}`;

    let match = matches.get(key);
    if (!match) {
      match = {
        round,
        homeId: first.id,
        awayId: second.id,
        homeName: first.name,
        awayName: second.name,
        homePoints: 0,
        awayPoints: 0,
        homeSpread: 0,
        boards: [],
        settled: true,
        result: "pending",
      };
      matches.set(key, match);
    }

    // Each board appears twice in the games list, once per player. Keep one.
    if (match.boards.some((b) => b.board === g.board)) continue;

    const homeIsFirst = home.id === first.id;
    const homeScore = homeIsFirst ? g.playerScore : g.opponentScore;
    const awayScore = homeIsFirst ? g.opponentScore : g.playerScore;

    match.boards.push({
      board: g.board,
      homePlayerId: homeIsFirst ? g.playerId : g.opponentId,
      awayPlayerId: homeIsFirst ? g.opponentId : g.playerId,
      homeScore,
      awayScore,
      verified: g.verified,
    });

    if (!g.verified) {
      match.settled = false;
      continue;
    }

    const margin = homeScore - awayScore;
    const capped =
      rules.spreadCapPerGame > 0
        ? Math.max(-rules.spreadCapPerGame, Math.min(rules.spreadCapPerGame, margin))
        : margin;
    match.homeSpread += capped;

    if (margin > 0) match.homePoints += rules.winPoints;
    else if (margin < 0) match.awayPoints += rules.winPoints;
    else {
      match.homePoints += rules.drawPoints;
      match.awayPoints += rules.drawPoints;
    }
  }

  for (const m of matches.values()) {
    m.boards.sort((a, b) => a.board - b.board);
    if (!m.settled) m.result = "pending";
    else if (m.homePoints > m.awayPoints) m.result = "home";
    else if (m.awayPoints > m.homePoints) m.result = "away";
    else if (m.homeSpread > 0) m.result = "home";
    else if (m.homeSpread < 0) m.result = "away";
    else m.result = "draw";
  }

  return [...matches.values()].sort((a, b) => a.homeName.localeCompare(b.homeName));
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface TeamIssue {
  severity: "error" | "warning";
  message: string;
  teamId?: string;
}

/**
 * Problems a director should fix before publishing team standings.
 *
 * Uneven squads are a warning rather than an error: a school that brought
 * seven players instead of eight should still be allowed to compete, but the
 * director must see that its totals are not comparable.
 */
export function validateTeams(teams: Team[], allPlayerIds: string[]): TeamIssue[] {
  const issues: TeamIssue[] = [];

  const seen = new Map<string, string[]>();
  for (const t of teams) {
    for (const id of t.memberIds) seen.set(id, [...(seen.get(id) ?? []), t.name]);
  }

  for (const [playerId, teamNames] of seen) {
    if (teamNames.length > 1)
      issues.push({
        severity: "error",
        message: `A player is listed on more than one team: ${teamNames.join(", ")}. Their games would be counted twice.`,
        teamId: undefined,
      });
    if (!allPlayerIds.includes(playerId))
      issues.push({
        severity: "warning",
        message: `A team lists a player who is not registered for this event.`,
      });
  }

  const empty = teams.filter((t) => t.memberIds.length === 0);
  for (const t of empty)
    issues.push({ severity: "error", message: `${t.name} has no players.`, teamId: t.id });

  const sizes = teams.filter((t) => t.memberIds.length > 0).map((t) => t.memberIds.length);
  if (sizes.length > 1) {
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    if (max !== min)
      issues.push({
        severity: "warning",
        message: `Teams have different squad sizes (${min}–${max}). Match points are not directly comparable; consider ranking on points per game.`,
      });
  }

  return issues;
}

/** Points per game played, for comparing squads of different sizes. */
export function pointsPerGame(standing: TeamStanding): number {
  return standing.played > 0 ? Math.round((standing.points / standing.played) * 1000) / 1000 : 0;
}
