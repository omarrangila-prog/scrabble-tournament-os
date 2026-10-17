/**
 * Deciding which registration an outside player is.
 *
 * Three outcomes, and only one of them is automatic:
 *
 *   exact   — a saved confirmation, or a registration number plus the same name, or exactly one
 *             registration whose name is identical once capitals, accents and punctuation are
 *             set aside. Safe to use without asking.
 *   likely  — resembles one or more registrations: the same words in another order, a missing
 *             surname, a one-letter slip, a number that fits but a name that does not. Never used
 *             until a person confirms it, because putting a score on the wrong player is the one
 *             mistake here that cannot be noticed afterwards.
 *   none    — nothing close. A person picks the registration, or leaves the board out.
 *
 * Once a person confirms a match it is saved against the outside identity, so round 2 does not
 * ask the same question again.
 */

import type { ExternalPlayerRef } from "./parse";
import { editDistance, isTokenSubset, nameKey, nameTokens } from "./names";

/** One registration that could be on a board. */
export interface RosterPlayer {
  id: string;
  name: string;
  /** The registration number printed on their badge, as text. */
  number: string;
  /** The category id Blufy's has them in, which is the one that counts. */
  division: string;
  checkedIn: boolean;
}

export type MatchStatus = "exact" | "likely" | "none";

export interface Candidate {
  id: string;
  name: string;
  reason: string;
}

export interface PlayerMatch {
  ref: ExternalPlayerRef;
  status: MatchStatus;
  /** Set only for an exact match. A likely one has none until it is confirmed. */
  recordId: string | null;
  via: "saved" | "number" | "name" | null;
  candidates: Candidate[];
}

const MAX_CANDIDATES = 3;

function likelyCandidates(ref: ExternalPlayerRef, roster: RosterPlayer[]): Candidate[] {
  const key = nameKey(ref.name);
  const tokens = nameTokens(ref.name);
  const scored: (Candidate & { score: number })[] = [];

  for (const p of roster) {
    const theirKey = nameKey(p.name);
    const theirTokens = nameTokens(p.name);
    if (theirKey === "") continue;

    let score = 0;
    let reason = "";

    if (ref.number && p.number && ref.number === p.number) {
      score = 0.95;
      reason = "Same registration number, but the name differs";
    } else if (
      tokens.length > 1 &&
      tokens.length === theirTokens.length &&
      [...tokens].sort().join(" ") === [...theirTokens].sort().join(" ")
    ) {
      score = 0.9;
      reason = "Same words in a different order";
    } else if (editDistance(key, theirKey, key.length >= 8 ? 2 : 1) <= (key.length >= 8 ? 2 : 1) && key.length >= 4) {
      score = 0.8;
      reason = "Spelled slightly differently";
    } else if (isTokenSubset(tokens, theirTokens) && tokens.length !== theirTokens.length) {
      score = 0.6;
      reason = tokens.length < theirTokens.length ? "Part of the registered name" : "The registered name is part of this one";
    }

    if (score > 0) scored.push({ id: p.id, name: p.name, reason, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "en"))
    .slice(0, MAX_CANDIDATES)
    .map(({ id, name, reason }) => ({ id, name, reason }));
}

/**
 * Matches every distinct outside player against the roster.
 *
 * `saved` maps an outside identity (`ref.key`) to a registration id confirmed on an earlier
 * import. A saved match pointing at a registration no longer on the roster is ignored rather than
 * trusted: that person was removed, and the board needs a human decision again.
 */
export function matchPlayers(
  refs: ExternalPlayerRef[],
  roster: RosterPlayer[],
  saved: Map<string, string> = new Map(),
): PlayerMatch[] {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: PlayerMatch[] = [];

  for (const ref of refs) {
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);

    const confirmed = saved.get(ref.key);
    if (confirmed && byId.has(confirmed)) {
      out.push({ ref, status: "exact", recordId: confirmed, via: "saved", candidates: [] });
      continue;
    }

    const key = nameKey(ref.name);
    const named = roster.filter((p) => nameKey(p.name) === key);

    if (ref.number) {
      const numbered = roster.filter((p) => p.number !== "" && p.number === ref.number);
      if (numbered.length === 1) {
        const [only] = numbered;
        if (nameKey(only.name) === key) {
          out.push({ ref, status: "exact", recordId: only.id, via: "number", candidates: [] });
          continue;
        }
        /* A number alone is not an identity: it is a claim to check against the name. */
        out.push({
          ref,
          status: "likely",
          recordId: null,
          via: null,
          candidates: likelyCandidates(ref, roster),
        });
        continue;
      }
    }

    if (named.length === 1) {
      out.push({ ref, status: "exact", recordId: named[0].id, via: "name", candidates: [] });
      continue;
    }

    if (named.length > 1) {
      /* Two registrations with one name: not for software to pick between. */
      out.push({
        ref,
        status: "likely",
        recordId: null,
        via: null,
        candidates: named.slice(0, MAX_CANDIDATES).map((p) => ({
          id: p.id,
          name: p.name,
          reason: `Two registrations share this name (#${p.number || "—"})`,
        })),
      });
      continue;
    }

    const candidates = likelyCandidates(ref, roster);
    out.push({
      ref,
      status: candidates.length ? "likely" : "none",
      recordId: null,
      via: null,
      candidates,
    });
  }

  return out;
}

/**
 * The registration each outside player resolves to, once a person has had their say.
 *
 * `choices` holds what staff decided: a registration id, or null for "leave this player out".
 * A decision beats the automatic match in both directions. It confirms a likely one, and it also
 * corrects an exact one — a name can be identical and still be the other person with that name,
 * and the people at the results table know things the software cannot.
 */
export function resolution(
  matches: PlayerMatch[],
  choices: Map<string, string | null>,
): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const m of matches) {
    if (choices.has(m.ref.key)) {
      const chosen = choices.get(m.ref.key);
      if (chosen) resolved.set(m.ref.key, chosen);
    } else if (m.status === "exact" && m.recordId) {
      resolved.set(m.ref.key, m.recordId);
    }
  }
  return resolved;
}

/** The outside players staff have chosen to leave out. */
export function skippedKeys(choices: Map<string, string | null>): Set<string> {
  return new Set([...choices].filter(([, v]) => v === null).map(([k]) => k));
}

export interface MatchSummary {
  exact: number;
  likely: number;
  none: number;
}

export function summarise(
  matches: PlayerMatch[],
  choices: Map<string, string | null>,
): MatchSummary & { unresolved: number } {
  const exact = matches.filter((m) => m.status === "exact").length;
  const likely = matches.filter((m) => m.status === "likely").length;
  const none = matches.filter((m) => m.status === "none").length;
  /* Unresolved is what still needs a person: not exact, and nothing chosen — not even "leave out". */
  const unresolved = matches.filter((m) => m.status !== "exact" && !choices.has(m.ref.key)).length;
  return { exact, likely, none, unresolved };
}
