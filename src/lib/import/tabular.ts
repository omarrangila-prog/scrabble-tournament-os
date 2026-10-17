/**
 * Turning whatever somebody pasted or fetched into a grid of text.
 *
 * The outside system is not known in advance and may change, so nothing downstream is allowed to
 * depend on its shape. This file is the only place that knows about delimiters, HTML tables and
 * JSON; everything after it sees rows of strings. If the source's page is redesigned, this is the
 * file that changes.
 */

export type Grid = string[][];

export type SourceKind = "html" | "json" | "delimited";

/** What a body of text looks like, judged from the text and not from what it was called. */
export function sniff(text: string): SourceKind {
  const head = text.trimStart().slice(0, 4000).toLowerCase();
  if (/<table[\s>]/.test(text.toLowerCase())) return "html";
  if (head.startsWith("[") || head.startsWith("{")) return "json";
  return "delimited";
}

/* -------------------------------------------------------------------------- */
/* Delimited text                                                              */
/* -------------------------------------------------------------------------- */

const DELIMITERS = [",", "\t", ";", "|"] as const;

/**
 * The delimiter a block of text is written with.
 *
 * Counted over the first few lines, outside quotes, taking the one that appears the same number
 * of times on the most lines. A comma inside "Khan, Ahmed" must not make a tab-separated paste
 * look comma-separated.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 8);
  let best = ",";
  let bestScore = 0;

  for (const d of DELIMITERS) {
    const counts = lines.map((line) => {
      let n = 0;
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === d && !quoted) n += 1;
      }
      return n;
    });
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** RFC 4180 parsing: quotes, doubled quotes, and newlines inside a quoted cell. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  /* A byte-order mark at the start of an exported file is not part of the first header. */
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }

    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                        */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function cellText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " "),
  ).trim();
}

/**
 * Every table in an HTML page, as grids.
 *
 * A tolerant scan rather than a parser: scripts and styles are removed first, then rows and
 * cells are found by tag. That is enough for the table-shaped pages results software publishes,
 * and it cannot execute or fetch anything the page contains. Nested tables are flattened into
 * the cell that holds them, which is the right outcome for layout tables and harmless for data.
 */
export function parseHtmlTables(html: string): Grid[] {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const tables: Grid[] = [];
  const tablePattern = /<table[\s\S]*?<\/table>/gi;

  for (const match of clean.matchAll(tablePattern)) {
    const grid: Grid = [];
    for (const rowMatch of match[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cellText(c[1]));
      if (cells.some((c) => c !== "")) grid.push(cells);
    }
    if (grid.length > 1) tables.push(grid);
  }

  return tables;
}

/* -------------------------------------------------------------------------- */
/* JSON                                                                        */
/* -------------------------------------------------------------------------- */

/** An array of objects (or an object holding one) as a grid with a header row. */
export function parseJsonGrid(text: string): Grid {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }

  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? (Object.values(value as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? []
      : [];

  const objects = list.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
  if (objects.length === 0) return [];

  const headers = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  return [
    headers,
    ...objects.map((o) => headers.map((h) => (o[h] === null || o[h] === undefined ? "" : String(o[h])))),
  ];
}

/* -------------------------------------------------------------------------- */

/**
 * The most promising grid in a body of text.
 *
 * An HTML page can hold several tables — navigation, a legend, the standings and the pairings —
 * so the choice is the one with the most rows that carries a header this importer understands,
 * which the caller decides. Here every candidate is returned, best-first by size.
 */
export function gridsFrom(text: string): Grid[] {
  switch (sniff(text)) {
    case "html":
      return parseHtmlTables(text).sort((a, b) => b.length - a.length);
    case "json": {
      const g = parseJsonGrid(text);
      return g.length ? [g] : [];
    }
    default: {
      const g = parseDelimited(text);
      return g.length ? [g] : [];
    }
  }
}
