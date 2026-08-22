import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Fixed-locale formatting so server and client markup always agree. */
export function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** "12 minutes ago" — relative to a stable reference to avoid hydration drift. */
export function timeAgo(iso: string, reference = Date.now()): string {
  const diff = Math.floor((reference - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Triggers a client-side file download.
 *
 * CSV gets a byte-order mark. Excel reads a .csv as the machine's local codepage unless one
 * is present, so "sharimkizoja123°" arrives as mojibake and an Urdu name arrives as rubbish —
 * on the organizer's machine, not on ours, which is why it survives being tested here.
 */
export function downloadFile(filename: string, content: string, type = "text/plain") {
  const csv = type.includes("csv") || filename.endsWith(".csv");
  const blob = new Blob(csv ? ["\uFEFF", content] : [content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Rows to CSV that Excel opens correctly.
 *
 * Two things it does beyond quoting:
 *
 * A value that is digits with a leading zero is written as a formula string — `="03222927461"`
 * — because Excel reads 03222927461 as a number and hands back 3222927461. Every mobile in
 * this event starts with a zero, so without it the export loses a digit from all seventy-one
 * and is worse than useless for ringing anybody.
 *
 * Lines end CRLF, which is what the CSV convention says and what Excel on Windows expects.
 */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (raw: string | number) => {
    const s = String(raw ?? "");
    if (/^0\d+$/.test(s)) return `="${s}"`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
