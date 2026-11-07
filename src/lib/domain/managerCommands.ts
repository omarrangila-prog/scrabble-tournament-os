/**
 * Reading what a director types into the tournament manager.
 *
 * Three jobs, all pure so they can be tested without a browser:
 *  - `parseDuration`: "25", "25 min", "1h", "1h 30m", "1:30" and "half an hour" all become minutes.
 *  - `parseRoster`: a pasted list or a CSV becomes students, with their section and category read
 *    from headings ("Section A:") or columns.
 *  - `parseCommand`: a plain sentence ("add Rania to Section A", "round 2 is 25 minutes",
 *    "pair round 3") becomes one command the page can run.
 *
 * Nothing here guesses at what it does not recognise: an unfamiliar sentence is `unknown`, and the
 * page says so rather than doing something the director did not ask for.
 */

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

/** Minutes from whatever the director wrote, or null when it is not a time. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (/^half an? hour$/.test(t)) return 30;
  if (/^(an|one) hour$/.test(t)) return 60;

  const clock = t.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return within(Number(clock[1]) * 60 + Number(clock[2]));

  const parts = t.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)?)?$/);
  if (!parts || (!parts[1] && !parts[2])) return null;
  const hours = parts[1] ? Number(parts[1]) : 0;
  const minutes = parts[2] ? Number(parts[2]) : 0;
  return within(Math.round(hours * 60 + minutes));
}

function within(n: number): number | null {
  return Number.isFinite(n) && n >= 1 && n <= 240 ? n : null;
}

/* -------------------------------------------------------------------------- */
/* Lists of students                                                           */
/* -------------------------------------------------------------------------- */

export interface RosterRow {
  name: string;
  section: string;
  /** A category id, when the list named one. */
  category?: string;
}

const CATEGORY_WORDS: Record<string, string> = {
  beginner: "beginner",
  beginners: "beginner",
  masters: "masters",
  master: "masters",
};

function matchSection(raw: string, known: string[]): string {
  const clean = raw.trim().replace(/\s+/g, " ");
  const found = known.find((k) => k.toLowerCase() === clean.toLowerCase());
  if (found) return found;
  const letter = clean.match(/^(?:section|class|group)?\s*([a-z0-9]{1,3})$/i);
  if (letter) {
    const byLetter = known.find((k) => k.toLowerCase().replace(/^(section|class|group)\s*/, "") === letter[1].toLowerCase());
    if (byLetter) return byLetter;
    return `Section ${letter[1].toUpperCase()}`;
  }
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

const tidyName = (s: string) =>
  s
    .replace(/^[\s\-*•·\d.)(]+/, "")
    .replace(/[\s,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Students from pasted text or a CSV.
 *
 * A line that names a section ("Section A:", "Class 3B", "B:") sets the section for the names under
 * it. Columns, when there are any, are name, section, category in that order, with an optional
 * header row. A name is never a number and never empty.
 */
export function parseRoster(text: string, knownSections: string[] = [], defaultSection = ""): RosterRow[] {
  const rows: RosterRow[] = [];
  let section = defaultSection;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    /* A heading: ends in a colon with nothing after it, or is just "Section X". */
    const heading =
      line.match(/^((?:section|class|group)\s*[\w -]{1,12}?)\s*:?$/i) ?? line.match(/^([\w ]{1,14}?)\s*:\s*$/);
    if (heading && !/[,\t]/.test(line)) {
      section = matchSection(heading[1], knownSections);
      continue;
    }

    const cells = line.split(/\t|,(?![^()]*\))/).map((c) => c.trim());
    if (cells.length > 1) {
      if (/^(name|student|student name|full name)$/i.test(cells[0])) continue;
      const name = tidyName(cells[0]);
      if (!name || /^\d+$/.test(name)) continue;
      let rowSection = section;
      let category: string | undefined;
      for (const c of cells.slice(1)) {
        if (!c) continue;
        if (CATEGORY_WORDS[c.toLowerCase()]) category = CATEGORY_WORDS[c.toLowerCase()];
        else rowSection = matchSection(c, knownSections);
      }
      rows.push({ name, section: rowSection, ...(category ? { category } : {}) });
      continue;
    }

    /* "Rania - Section A" or "Rania (Section A)" */
    const inline = line.match(/^(.+?)\s*[-–(]\s*((?:section|class|group)\s*[\w]+)\)?$/i);
    if (inline) {
      const name = tidyName(inline[1]);
      if (name) rows.push({ name, section: matchSection(inline[2], knownSections) });
      continue;
    }

    const name = tidyName(line);
    if (name && !/^\d+$/.test(name)) rows.push({ name, section });
  }

  /* The same name twice in one section is one student typed twice. */
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.section.toLowerCase()}|${r.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

export type CategoryMode = "beginner" | "masters" | "both";

export type Command =
  | { kind: "add"; names: string[]; section?: string; category?: string }
  | { kind: "rename"; from: string; to: string }
  | { kind: "move"; name: string; fromSection?: string; section?: string; category?: string }
  | { kind: "delete"; name: string; section?: string }
  | { kind: "pair"; mode: "auto" | "hand" }
  | { kind: "publish" }
  | { kind: "clock"; action: "start" | "pause" | "resume" | "end" }
  | { kind: "extend"; minutes: number }
  | { kind: "round-times"; items: { round: number | "all"; minutes: number }[] }
  | { kind: "rounds"; count: number }
  | { kind: "sections"; names: string[] }
  | { kind: "mode"; mode: CategoryMode }
  | { kind: "score"; a: string; scoreA: number; b: string; scoreB: number }
  | { kind: "finish" }
  | { kind: "status" }
  | { kind: "help" }
  | { kind: "unknown" };

const sectionLabel = (raw: string) => matchSection(raw, []);

function splitNames(raw: string): string[] {
  return raw
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map(tidyName)
    .filter(Boolean);
}

/** Pulls "section X" and a category word off the end of a phrase. */
function tails(raw: string): { rest: string; section?: string; category?: string } {
  let rest = raw.trim();
  let section: string | undefined;
  let category: string | undefined;

  const cat = rest.match(/\s+(?:as\s+(?:a\s+)?|in\s+)?(beginners?|masters?)\s*$/i);
  if (cat) {
    category = CATEGORY_WORDS[cat[1].toLowerCase()];
    rest = rest.slice(0, cat.index).trim();
  }
  const sec = rest.match(/\s+(?:to|in|into|for)?\s*((?:section|class|group)\s+[\w-]+)\s*$/i);
  if (sec) {
    section = sectionLabel(sec[1]);
    rest = rest.slice(0, sec.index).trim().replace(/\s+(to|in|into|for)$/i, "");
  }
  return { rest, section, category };
}

export function parseCommand(input: string): Command {
  const text = input.trim().replace(/\s+/g, " ");
  const t = text.toLowerCase();
  if (!t) return { kind: "unknown" };

  if (/^(help|\?|what can (i|you)|commands)/.test(t)) return { kind: "help" };
  if (/^(status|where are we|progress|what next|what now)/.test(t)) return { kind: "status" };

  /* Round times: "round 1 20 min, round 2 25 min", "round 2 is 25 minutes", "each round 30 minutes". */
  const perRound = [...t.matchAll(/round\s*(\d+)\s*(?:is|=|:|to|will be|should be|-)?\s*([\d.:]+\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)?(?:\s*\d+\s*(?:m|min|mins|minutes?))?)/g)];
  const timed = perRound
    .map((m) => ({ round: Number(m[1]), minutes: parseDuration(m[2].trim()) }))
    .filter((x): x is { round: number; minutes: number } => x.minutes !== null && x.round >= 1);
  if (timed.length > 0 && !/^(pair|publish|score)/.test(t)) {
    return { kind: "round-times", items: timed };
  }
  const allRounds = t.match(/^(?:set |make |change )?(?:the )?(?:all |every |each )?(?:rounds?|round time|round length|time|game time)(?: time| length)?(?: for (?:all|every|each) rounds?)?\s*(?:is|to|=|at|:)?\s*(.+)$/);
  if (allRounds && /\b(round|time)\b/.test(t) && !/\d+\s*rounds?$/.test(t)) {
    const minutes = parseDuration(allRounds[1].replace(/\b(for )?(all|every|each) rounds?\b/g, "").trim());
    if (minutes !== null) return { kind: "round-times", items: [{ round: "all", minutes }] };
  }
  const eachRound = t.match(/^(?:every|each|all) rounds? (?:is|are|=|:|to|at)?\s*(.+)$/);
  if (eachRound) {
    const minutes = parseDuration(eachRound[1]);
    if (minutes !== null) return { kind: "round-times", items: [{ round: "all", minutes }] };
  }

  const extend = t.match(/^(?:add|give|extend(?: by)?)\s+(\d+)\s*(?:more\s*)?(?:min|mins|minutes?)(?:\s+more|\s+extra)?$/);
  if (extend) return { kind: "extend", minutes: Number(extend[1]) };

  const rounds = t.match(/^(?:set |make |change )?(?:the )?(?:number of )?rounds?\s*(?:to|=|is|:)?\s*(\d{1,2})$/) ?? t.match(/^(?:set |make |have )?(\d{1,2})\s+rounds?$/);
  if (rounds) return { kind: "rounds", count: Number(rounds[1]) };

  if (/^(finish|end|close|complete)\s+(the\s+)?(tournament|event)/.test(t)) return { kind: "finish" };

  if (/^(start|begin)\s+(the\s+)?(round|clock|timer)/.test(t) || t === "start") return { kind: "clock", action: "start" };
  if (/^pause(\s+(the\s+)?(round|clock|timer))?$/.test(t)) return { kind: "clock", action: "pause" };
  if (/^(resume|continue)(\s+(the\s+)?(round|clock|timer))?$/.test(t)) return { kind: "clock", action: "resume" };
  if (/^(end|stop)\s+(the\s+)?(round|clock|timer)/.test(t)) return { kind: "clock", action: "end" };

  if (/^publish/.test(t)) return { kind: "publish" };
  if (/^(pair|draw|make the pairings?)/.test(t) || /^auto(matic(ally)?)?[ -]?pair/.test(t)) {
    return { kind: "pair", mode: /\b(hand|manual|manually|myself)\b/.test(t) ? "hand" : "auto" };
  }

  if (/^(beginners?|masters?)\s+only$/.test(t) || /^only\s+(beginners?|masters?)$/.test(t)) {
    return { kind: "mode", mode: /beginner/.test(t) ? "beginner" : "masters" };
  }
  if (/^(both|beginners? and masters?|masters? and beginners?)(\s+(categories|only))?$/.test(t)) return { kind: "mode", mode: "both" };

  const sections = text.match(/^(?:set |make |create |use |change )?(?:the )?sections?\s*(?:to|are|=|:)?\s*(.+)$/i);
  if (sections) {
    const names = sections[1]
      .split(/\s*(?:,|&|\band\b)\s*|\s+(?=(?:section\s)?[a-z]\b)/i)
      .map((n) => n.trim())
      .filter(Boolean)
      .map(sectionLabel);
    if (names.length > 0) return { kind: "sections", names };
  }

  const del = text.match(/^(?:delete|remove)\s+(.+)$/i);
  if (del) {
    const { rest, section } = tails(del[1].replace(/\s*\(([^)]*)\)\s*$/, " $1"));
    return { kind: "delete", name: tidyName(rest), ...(section ? { section } : {}) };
  }

  const rename = text.match(/^(?:rename|change)\s+(.+?)\s+to\s+(.+)$/i);
  if (rename) return { kind: "rename", from: tidyName(rename[1]), to: tidyName(rename[2]) };

  const move = text.match(/^(?:move|put|switch|shift)\s+(.+?)\s+(?:to|into|in)\s+(.+)$/i);
  if (move) {
    const from = tails(move[1].replace(/\s*\(([^)]*)\)\s*$/, " $1"));
    const target = move[2].trim();
    const cat = CATEGORY_WORDS[target.toLowerCase()];
    if (cat) return { kind: "move", name: tidyName(from.rest), ...(from.section ? { fromSection: from.section } : {}), category: cat };
    return { kind: "move", name: tidyName(from.rest), ...(from.section ? { fromSection: from.section } : {}), section: sectionLabel(target) };
  }

  const add = text.match(/^(?:add|register|enrol|enroll|new student|new)\s+(?:students?\s+|kids?\s+)?(.+)$/i);
  if (add) {
    const { rest, section, category } = tails(add[1]);
    const names = splitNames(rest);
    if (names.length > 0) return { kind: "add", names, ...(section ? { section } : {}), ...(category ? { category } : {}) };
  }

  const beat = text.match(/^([a-z][a-z .'-]*?)\s+(?:beat|beats|won against|defeated)\s+([a-z][a-z .'-]*?)\s+(\d{1,4})\s*(?:-|to|:|–)\s*(\d{1,4})$/i);
  if (beat) return { kind: "score", a: tidyName(beat[1]), scoreA: Number(beat[3]), b: tidyName(beat[2]), scoreB: Number(beat[4]) };
  /* "Rania 320 Prachi 280", "Rania 320 - Prachi 280", "Rania beat Prachi 320 to 280" */
  const score = text.match(/^(?:score\s+|result\s+)?([a-z][a-z .'-]*?)\s+(\d{1,4})\s*(?:-|vs\.?|v|,|and|:|–)?\s*([a-z][a-z .'-]*?)\s+(\d{1,4})$/i);
  if (score) return { kind: "score", a: tidyName(score[1]), scoreA: Number(score[2]), b: tidyName(score[3]), scoreB: Number(score[4]) };

  return { kind: "unknown" };
}

/** The plain-language list of what can be typed, shown when somebody asks for help. */
export const COMMAND_EXAMPLES = [
  "add Rania to Section A",
  "pair round 2",
  "round 1 is 20 minutes, round 2 is 25 minutes",
  "set every round to 30 minutes",
  "Rania 320 Prachi 280",
  "move Zoya (Section B) to Section C",
  "start the round",
  "add 5 minutes",
  "set rounds to 4",
  "finish the tournament",
];
