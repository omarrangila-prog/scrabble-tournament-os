/**
 * Tournament Copilot — answer engine.
 *
 * Answers are computed from live tournament state, not generated text. Each
 * answer returns the sentences to display plus the actions the director can
 * take, so the panel is operational rather than decorative.
 */

import { Dispute, Pairing, Player, Tournament } from "../domain/types";
import { computeStandings } from "../engine/standings";
import { AuditEntry } from "../domain/types";

export interface CopilotAction {
  label: string;
  href?: string;
  kind: "open-boards" | "view-player" | "review-pairings" | "generate-report" | "mark-resolved";
}

export interface CopilotAnswer {
  headline: string;
  body: string[];
  actions: CopilotAction[];
  /** Boards or players the answer refers to, shown as chips. */
  references?: string[];
}

export interface CopilotContext {
  tournament: Tournament;
  players: Player[];
  pairings: Pairing[];
  disputes: Dispute[];
  audit: AuditEntry[];
}

export const SUGGESTED_QUESTIONS = [
  "Can Round 6 be generated safely?",
  "Which boards have missing results?",
  "Are there any repeat opponents?",
  "Who has already received a bye?",
  "Which players moved the most in the standings?",
  "Show all score corrections from today.",
  "Which division is running behind schedule?",
  "Why was this pairing created?",
  "Explain the current ranking of Player 042.",
  "Create a director briefing for the next round.",
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

export function answerQuestion(question: string, ctx: CopilotContext): CopilotAnswer {
  const q = norm(question);
  const { tournament, players, pairings, disputes, audit } = ctx;
  const round = tournament.currentRound;
  const roundPairings = pairings.filter((p) => p.round === round);
  const pending = roundPairings.filter((p) => p.status === "awaiting-verification");
  const live = roundPairings.filter((p) => p.status === "live");
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "Unknown" : "Bye";

  /* ---- Can the next round be generated? ------------------------------- */
  if (
    (q.includes("round") && (q.includes("generate") || q.includes("safely") || q.includes("next"))) ||
    q.includes("can round")
  ) {
    const blocking = pending.length + live.length;
    if (blocking === 0) {
      return {
        headline: `Round ${round + 1} can be generated now.`,
        body: [
          `All ${roundPairings.filter((p) => p.playerBId).length} boards in round ${round} are verified.`,
          "No duplicate players or repeat-opponent conflicts are currently detected.",
        ],
        actions: [
          { label: "Review pairings", kind: "review-pairings", href: "/app/pairings?tab=preview" },
          { label: "Generate report", kind: "generate-report", href: "/app/reports" },
        ],
      };
    }
    const boards = [...pending, ...live].map((p) => p.board).sort((a, b) => a - b);
    return {
      headline: `Round ${round + 1} can be generated after ${blocking} round ${round} result${
        blocking === 1 ? "" : "s"
      } ${blocking === 1 ? "is" : "are"} verified.`,
      body: [
        `Boards ${boards.slice(0, 12).join(", ")}${boards.length > 12 ? "…" : ""} are incomplete.`,
        "No duplicate players or repeat-opponent conflicts are currently detected.",
      ],
      references: boards.slice(0, 12).map((b) => `Board ${b}`),
      actions: [
        { label: "Open affected boards", kind: "open-boards", href: "/app/score-entry" },
        { label: "Review pairings", kind: "review-pairings", href: "/app/pairings?tab=preview" },
      ],
    };
  }

  /* ---- Missing results ------------------------------------------------- */
  if (q.includes("missing") || (q.includes("boards") && q.includes("result"))) {
    const boards = [...pending, ...live].map((p) => p.board).sort((a, b) => a - b);
    return {
      headline:
        boards.length === 0
          ? "Every board in this round has reported a result."
          : `${boards.length} board${boards.length === 1 ? "" : "s"} ha${
              boards.length === 1 ? "s" : "ve"
            } no verified result.`,
      body:
        boards.length === 0
          ? ["Round " + round + " is fully verified."]
          : [
              `Pending verification: ${pending.map((p) => p.board).join(", ") || "none"}.`,
              `Still playing: ${live.length} board${live.length === 1 ? "" : "s"}.`,
            ],
      references: boards.slice(0, 12).map((b) => `Board ${b}`),
      actions: [{ label: "Open affected boards", kind: "open-boards", href: "/app/score-entry" }],
    };
  }

  /* ---- Repeat opponents ------------------------------------------------ */
  if (q.includes("repeat") || q.includes("rematch") || q.includes("played each other")) {
    const met = new Map<string, Set<string>>();
    const repeats: string[] = [];
    for (const p of pairings.filter((x) => x.playerBId !== null).sort((a, b) => a.round - b.round)) {
      const a = p.playerAId;
      const b = p.playerBId!;
      if (!met.has(a)) met.set(a, new Set());
      if (!met.has(b)) met.set(b, new Set());
      if (met.get(a)!.has(b)) {
        repeats.push(`Round ${p.round}, board ${p.board}: ${nameOf(a)} vs ${nameOf(b)}`);
      }
      met.get(a)!.add(b);
      met.get(b)!.add(a);
    }
    return {
      headline:
        repeats.length === 0
          ? "No repeat opponents have occurred in this tournament."
          : `${repeats.length} repeat pairing${repeats.length === 1 ? "" : "s"} detected.`,
      body:
        repeats.length === 0
          ? [
              "Every pairing so far is between players who had not previously met.",
              "The repeat-opponent constraint is active in the pairing settings.",
            ]
          : repeats.slice(0, 6),
      actions: [{ label: "Review pairings", kind: "review-pairings", href: "/app/pairings?tab=history" }],
    };
  }

  /* ---- Byes ------------------------------------------------------------ */
  if (q.includes("bye")) {
    const byes = pairings.filter((p) => p.playerBId === null);
    return {
      headline:
        byes.length === 0
          ? "No byes have been allocated in this tournament."
          : `${byes.length} bye${byes.length === 1 ? " has" : "s have"} been allocated.`,
      body:
        byes.length === 0
          ? ["Every division has had an even number of eligible players in each round."]
          : byes.slice(0, 8).map((p) => `Round ${p.round}: ${nameOf(p.playerAId)} (${p.division})`),
      actions: [{ label: "Generate report", kind: "generate-report", href: "/app/reports" }],
    };
  }

  /* ---- Rank movement --------------------------------------------------- */
  if (q.includes("moved") || q.includes("movement") || q.includes("climb")) {
    const table = computeStandings(players, pairings, tournament);
    const movers = table
      .map((r) => ({ ...r, delta: r.previousRank - r.rank }))
      .filter((r) => r.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);
    return {
      headline:
        movers.length === 0
          ? "No rank changes have been recorded since the last verified result."
          : `${movers.length} players changed rank most recently.`,
      body: movers.map(
        (m) =>
          `${players.find((p) => p.id === m.playerId)?.fullName}: ${m.previousRank} → ${m.rank} (${
            m.delta > 0 ? "+" : ""
          }${m.delta})`,
      ),
      actions: [{ label: "Review standings", kind: "review-pairings", href: "/app/standings" }],
    };
  }

  /* ---- Score corrections ----------------------------------------------- */
  if (q.includes("correction") || q.includes("corrected")) {
    const corrections = audit.filter((a) => a.action.toLowerCase().includes("correct"));
    return {
      headline:
        corrections.length === 0
          ? "No score corrections have been recorded."
          : `${corrections.length} score correction${corrections.length === 1 ? "" : "s"} recorded.`,
      body: corrections
        .slice(0, 6)
        .map((c) => `${c.target}: ${c.previousValue} → ${c.newValue} (${c.user}) — ${c.reason ?? "no reason recorded"}`),
      actions: [{ label: "Generate report", kind: "generate-report", href: "/app/reports" }],
    };
  }

  /* ---- Division pace --------------------------------------------------- */
  if (q.includes("behind") || q.includes("schedule") || q.includes("slow") || q.includes("delay")) {
    const byDivision = tournament.divisions.map((d) => {
      const inDiv = roundPairings.filter((p) => p.division === d && p.playerBId !== null);
      const done = inDiv.filter((p) => p.status === "verified").length;
      return { division: d, done, total: inDiv.length, pct: inDiv.length ? done / inDiv.length : 1 };
    });
    const slowest = [...byDivision].sort((a, b) => a.pct - b.pct)[0];
    return {
      headline: slowest
        ? `${slowest.division} is the furthest behind in round ${round}.`
        : "All divisions are progressing evenly.",
      body: byDivision.map(
        (d) => `${d.division}: ${d.done} of ${d.total} boards verified (${Math.round(d.pct * 100)}%).`,
      ),
      actions: [{ label: "Open affected boards", kind: "open-boards", href: "/app/score-entry" }],
    };
  }

  /* ---- Explain a specific player's ranking ------------------------------ */
  const playerMatch = question.match(/\b(?:player\s*)?(\d{2,3})\b/i);
  if ((q.includes("ranking") || q.includes("explain") || q.includes("standing")) && playerMatch) {
    const idNum = playerMatch[1].padStart(3, "0");
    const player =
      players.find((p) => p.playerId === `PK-${idNum}`) ??
      players.find((p) => p.playerId.endsWith(idNum));
    if (player) {
      const table = computeStandings(players, pairings, tournament, { division: player.division });
      const row = table.find((r) => r.playerId === player.id);
      const opponents = pairings
        .filter(
          (p) =>
            p.status === "verified" &&
            (p.playerAId === player.id || p.playerBId === player.id),
        )
        .map((p) => {
          const isA = p.playerAId === player.id;
          const mine = isA ? p.scoreA! : p.scoreB!;
          const theirs = isA ? p.scoreB! : p.scoreA!;
          const opp = nameOf(isA ? p.playerBId : p.playerAId);
          return `Round ${p.round}: ${mine > theirs ? "won" : mine === theirs ? "drew" : "lost"} ${mine}–${theirs} against ${opp}`;
        });
      return {
        headline: `${player.fullName} is ranked ${row?.rank ?? "—"} in ${player.division}.`,
        body: [
          `Record ${row?.wins ?? 0}–${row?.losses ?? 0}${row?.draws ? `–${row.draws}` : ""} with a spread of ${row?.spread ?? 0}.`,
          `Ranking is decided by ${tournament.rankingRules.join(", then ")}.`,
          ...opponents.slice(0, 5),
        ],
        actions: [{ label: "View player", kind: "view-player", href: `/app/players/${player.playerId}` }],
      };
    }
  }

  /* ---- Why was this pairing created? ------------------------------------ */
  if (q.includes("why") && q.includes("pairing")) {
    const sample = roundPairings.find((p) => p.playerBId !== null);
    return {
      headline: "Pairings are explained board by board.",
      body: [
        sample
          ? `Board ${sample.board}: ${sample.reason}`
          : "Open the pairings screen to see the reason recorded for each board.",
        "Every pairing records the rule set that produced it, and any manual change stores the director's reason in the audit log.",
      ],
      actions: [{ label: "Review pairings", kind: "review-pairings", href: "/app/pairings" }],
    };
  }

  /* ---- Director briefing ------------------------------------------------ */
  if (q.includes("briefing") || q.includes("summary") || q.includes("brief")) {
    const checkedIn = players.filter((p) => p.checkIn === "checked-in").length;
    const openCases = disputes.filter((d) => d.status !== "closed").length;
    return {
      headline: `Director briefing — round ${round} of ${tournament.totalRounds}`,
      body: [
        `${checkedIn} of ${players.length} players are checked in.`,
        `${live.length} boards are still playing and ${pending.length} results await verification.`,
        `${openCases} arbiter case${openCases === 1 ? "" : "s"} remain open.`,
        pending.length + live.length === 0
          ? `Round ${round + 1} is ready to generate.`
          : `Round ${round + 1} can be generated once the outstanding boards are verified.`,
      ],
      actions: [
        { label: "Generate report", kind: "generate-report", href: "/app/reports" },
        { label: "Open affected boards", kind: "open-boards", href: "/app/score-entry" },
      ],
    };
  }

  /* ---- Fallback --------------------------------------------------------- */
  return {
    headline: "Here is the current state of the tournament.",
    body: [
      `Round ${round} of ${tournament.totalRounds}. ${live.length} boards live, ${pending.length} results pending verification.`,
      `${players.filter((p) => p.checkIn === "checked-in").length} of ${players.length} players are checked in.`,
      "Ask about pending results, repeat opponents, byes, rank movement, score corrections or whether the next round can be generated.",
    ],
    actions: [
      { label: "Review pairings", kind: "review-pairings", href: "/app/pairings" },
      { label: "Open affected boards", kind: "open-boards", href: "/app/score-entry" },
    ],
  };
}
