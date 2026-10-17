"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";

import { LiveBadge } from "@/components/public/LiveBadge";
import {
  columnLabel,
  withCategoryNames,
  type PublicRegistrations,
  type PublicRow,
} from "@/lib/domain/publicRegistrations";
import { readEventCategories } from "@/lib/supabase/useEventCategories";
import { readPublicRegistrationFeed } from "@/lib/supabase/publicLive";
import { useLiveData } from "@/lib/supabase/useLiveData";
import { useStoredPublicEvent } from "@/lib/supabase/useStoredPublicEvent";
import { cn } from "@/lib/utils";

const CREAM = "#F5F0E4";
const BROWN = "#3E2F23";
const FOREST = "#2F5D3A";

type Sort = { key: string; dir: "asc" | "desc" };

/** Numbers sort as numbers, so 9 comes before 10; everything else as text, ignoring case. */
function compare(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

/**
 * The public registration list, as a table.
 *
 * Shows the same dataset the CSV link serves — the same database function, the same columns, in
 * the same order — so the two can never disagree about who has registered or what is shown.
 * Whatever the organiser has not made public is not here, because it never left the database.
 */
export default function PublicRegistrationsPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const { event, resolved } = useStoredPublicEvent(slug);

  const load = React.useCallback(async (): Promise<PublicRegistrations | null> => {
    const feed = await readPublicRegistrationFeed(slug);
    if (!feed) return null;
    const categories = await readEventCategories(feed.eventId);
    return withCategoryNames(feed, categories);
  }, [slug]);

  const live = useLiveData<PublicRegistrations | null>(event ? slug : "", event?.id ?? null, load);
  const feed = live.data;

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [arrival, setArrival] = React.useState("");
  const [payment, setPayment] = React.useState("");
  const [sort, setSort] = React.useState<Sort | null>(null);

  const columns = feed?.columns ?? [];
  const has = (key: string) => columns.includes(key);

  const categories = React.useMemo(
    () => [...new Set((feed?.rows ?? []).map((r) => r.category).filter(Boolean))].sort(),
    [feed],
  );
  const payments = React.useMemo(
    () => [...new Set((feed?.rows ?? []).map((r) => r.paymentStatus).filter(Boolean))].sort(),
    [feed],
  );

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const kept = (feed?.rows ?? []).filter((r) => {
      if (category && r.category !== category) return false;
      if (arrival && r.checkInStatus !== arrival) return false;
      if (payment && r.paymentStatus !== payment) return false;
      if (needle && !Object.values(r).some((v) => v.toLowerCase().includes(needle))) return false;
      return true;
    });
    if (!sort) return kept;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...kept].sort((a, b) => sign * compare(a[sort.key] ?? "", b[sort.key] ?? ""));
  }, [feed, query, category, arrival, payment, sort]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  if (!resolved || (event && !live.loaded)) {
    return <Message>Opening the list…</Message>;
  }

  /* The same answer for "no such event" and "the list is switched off". */
  if (!event || !feed) {
    return <Message>This registration list is not available.</Message>;
  }

  const csvHref = `/public/events/${encodeURIComponent(slug)}/registrations.csv`;
  const filtered = rows.length !== feed.rows.length;

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-6 sm:py-10" style={{ background: CREAM, color: BROWN }}>
      <div className="mx-auto w-full max-w-[1100px]">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: FOREST }}>
              Registrations
            </p>
            <h1 className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]">
              {feed.eventName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <LiveBadge live={live.live} loaded={live.loaded} secondsAgo={live.secondsAgo} />
              <span className="num text-[13px] font-semibold">
                {filtered ? `${rows.length} of ${feed.total}` : feed.total} registered
              </span>
            </div>
          </div>

          <a
            href={csvHref}
            className="inline-flex items-center gap-2 rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-2.5 text-[13.5px] font-semibold"
          >
            <Download className="size-4" /> CSV
          </a>
        </header>

        {/* ---- Filters ------------------------------------------------- */}
        <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search"
              className="w-full rounded-control border border-line bg-[rgb(var(--c-surface))] py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-primary"
            />
          </label>

          {has("category") ? (
            <Filter label="All categories" value={category} onChange={setCategory} options={categories} />
          ) : null}
          {has("checkInStatus") ? (
            <Filter
              label="Any check-in"
              value={arrival}
              onChange={setArrival}
              options={["Checked in", "Not checked in"]}
            />
          ) : null}
          {has("paymentStatus") ? (
            <Filter label="Any payment" value={payment} onChange={setPayment} options={payments} />
          ) : null}
        </div>

        {/* ---- Desktop: a spreadsheet ----------------------------------- */}
        <div className="mt-4 hidden overflow-hidden rounded-[14px] border border-line bg-[rgb(var(--c-surface))] md:block">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead className="sticky top-0 bg-[rgb(var(--c-surface-soft))]">
                <tr>
                  {columns.map((key) => (
                    <th key={key} scope="col" className="border-b border-line px-3.5 py-2.5 font-bold">
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {columnLabel(key)}
                        {sort?.key === key ? (
                          sort.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                        ) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.registrationNumber ?? ""}-${i}`} className="odd:bg-transparent even:bg-[rgb(var(--c-surface-soft))]/50">
                    {columns.map((key) => (
                      <td key={key} className={cn("border-b border-line/60 px-3.5 py-2", key === "registrationNumber" && "num")}>
                        <Cell column={key} row={row} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Phone: one card each ------------------------------------- */}
        <ul className="mt-4 space-y-2 md:hidden">
          {rows.map((row, i) => (
            <li
              key={`${row.registrationNumber ?? ""}-${i}`}
              className="rounded-[14px] border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words text-[16px] font-bold">{row.name || "—"}</span>
                {has("registrationNumber") ? (
                  <span className="num shrink-0 text-[13px] font-semibold text-muted">#{row.registrationNumber}</span>
                ) : null}
              </div>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                {columns
                  .filter((k) => k !== "name" && k !== "registrationNumber")
                  .map((key) => (
                    <React.Fragment key={key}>
                      <dt className="text-muted">{columnLabel(key)}</dt>
                      <dd className="min-w-0 break-words font-medium">
                        <Cell column={key} row={row} />
                      </dd>
                    </React.Fragment>
                  ))}
              </dl>
            </li>
          ))}
        </ul>

        {rows.length === 0 ? (
          <p className="mt-8 text-center text-[14px] text-muted">
            {feed.total === 0 ? "Nobody has registered yet." : "Nothing matches that."}
          </p>
        ) : null}

        <p className="mt-8 text-center text-[12px] text-muted">
          <Link href={`/events/${encodeURIComponent(slug)}`} className="underline underline-offset-4">
            {feed.eventName}
          </Link>
        </p>
      </div>
    </main>
  );
}

/** A cell, with the two columns that read better as a coloured word than as plain text. */
function Cell({ column, row }: { column: string; row: PublicRow }) {
  const value = row[column] ?? "";
  if (value === "") return <span className="text-muted">—</span>;

  if (column === "checkInStatus")
    return (
      <span className={cn("font-semibold", value === "Checked in" ? "text-[#12855c]" : "text-muted")}>{value}</span>
    );

  if (column === "paymentStatus")
    return (
      <span className={cn("font-semibold", value === "Paid" || value === "Complimentary" ? "text-[#12855c]" : "text-[#a76d16]")}>
        {value}
      </span>
    );

  return <>{value}</>;
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-control border border-line bg-[rgb(var(--c-surface))] px-3 py-2.5 text-[14.5px] outline-none focus:border-primary"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6" style={{ background: CREAM, color: BROWN }}>
      <p className="text-center text-[16px] font-semibold">{children}</p>
    </main>
  );
}
