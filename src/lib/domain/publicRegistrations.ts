/**
 * What a public registration list may show, and how it is written out.
 *
 * The database decides which columns exist and which an event has chosen — see
 * `public_registrations` in migration 0089, which cuts every answer down to an allowed list
 * before it leaves Postgres. This file is the other half: the names people read, the order they
 * read them in, and the CSV. It never sees a column the database did not hand over, so a mistake
 * here can mis-label something but cannot reveal something.
 */

import { csvField } from "@/lib/reports/checkInReport";

export interface PublicColumn {
  key: string;
  label: string;
  /**
   * Personal contact details. Never part of the default set, and the admin screen makes
   * turning one on a deliberate, confirmed act: a public link is read by anybody who is given
   * it, and then by anybody they give it to.
   */
  private: boolean;
}

/** Every column that can be made public. The same list the database enforces. */
export const PUBLIC_COLUMNS: PublicColumn[] = [
  { key: "registrationNumber", label: "Registration #", private: false },
  { key: "name", label: "Name", private: false },
  { key: "age", label: "Age", private: false },
  { key: "category", label: "Category", private: false },
  { key: "checkInStatus", label: "Check-In Status", private: false },
  { key: "paymentStatus", label: "Payment Status", private: false },
  { key: "registeredAt", label: "Registered At", private: false },
  { key: "activity", label: "Activity", private: false },
  { key: "phone", label: "Phone", private: true },
  { key: "email", label: "Email", private: true },
];

/** What a public list shows until a director chooses otherwise. */
export const DEFAULT_PUBLIC_COLUMNS = [
  "registrationNumber",
  "name",
  "age",
  "category",
  "checkInStatus",
  "paymentStatus",
  "registeredAt",
];

export function columnLabel(key: string): string {
  return PUBLIC_COLUMNS.find((c) => c.key === key)?.label ?? key;
}

export type PublicRow = Record<string, string>;

export interface PublicRegistrations {
  eventId: string;
  eventName: string;
  /** In display order. Object keys carry no order, so this does. */
  columns: string[];
  rows: PublicRow[];
  total: number;
  updatedAt: string;
}

/** The feed as the database returns it, or null when there is no public feed. */
export function registrationsFrom(payload: unknown): PublicRegistrations | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const r = payload[0] as Record<string, unknown>;

  const known = new Set(PUBLIC_COLUMNS.map((c) => c.key));
  const columns = (Array.isArray(r.out_columns) ? r.out_columns : [])
    .map(String)
    .filter((c) => known.has(c));

  const rows = (Array.isArray(r.out_rows) ? r.out_rows : []).map((raw) => {
    const row: PublicRow = {};
    const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    /* Only the columns named above are copied across, whatever else arrived with them. */
    for (const key of columns) row[key] = String(source[key] ?? "");
    return row;
  });

  return {
    eventId: String(r.out_event_id ?? ""),
    eventName: String(r.out_event_name ?? ""),
    columns,
    rows,
    total: Number(r.out_total ?? rows.length),
    updatedAt: String(r.out_updated_at ?? ""),
  };
}

/** "advanced" → "Advanced", using the event's own category names where it has them. */
export function categoryName(
  id: string,
  categories: { id: string; name: string }[],
): string {
  if (id === "painting") return "Painting";
  if (id === "") return "";
  return categories.find((c) => c.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** The feed with category ids turned into the names people know them by. */
export function withCategoryNames(
  feed: PublicRegistrations,
  categories: { id: string; name: string }[],
): PublicRegistrations {
  if (!feed.columns.includes("category")) return feed;
  return {
    ...feed,
    rows: feed.rows.map((row) => ({ ...row, category: categoryName(row.category ?? "", categories) })),
  };
}

/**
 * The list as a CSV.
 *
 * Every cell goes through `csvField`, which defuses a leading `=`, `+`, `-` or `@`. These
 * names were typed by strangers into a public form and are about to be opened in Excel by
 * somebody else; a name that is a formula must arrive as a name.
 *
 * One header row and nothing above it, so an import never has to be told to skip a preamble.
 * CRLF, which is what spreadsheets expect.
 */
export function registrationsCsv(feed: PublicRegistrations): string {
  const lines = [
    feed.columns.map((c) => csvField(columnLabel(c))).join(","),
    ...feed.rows.map((row) => feed.columns.map((c) => csvField(row[c] ?? "")).join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** "blufys-alphabattle-registrations.csv". Stable, so a saved link downloads the same name. */
export function registrationsFileName(eventName: string): string {
  const slug = eventName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "event"}-registrations.csv`;
}

/** Whether any chosen column is personal contact information. */
export function exposesPrivateColumns(columns: string[]): boolean {
  return columns.some((key) => PUBLIC_COLUMNS.find((c) => c.key === key)?.private);
}
