"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  FileText,
  Gavel,
  Grid3x3,
  ListOrdered,
  Search,
  Trophy,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ALL_ROUTES } from "./nav";
import { useRoster } from "@/lib/supabase/useRoster";

export interface SearchResult {
  id: string;
  kind: "Player" | "Pairing" | "Board" | "Round" | "Dispute" | "Report" | "Tournament" | "Page";
  title: string;
  subtitle: string;
  href: string;
  hue?: number;
  initials?: string;
}

const KIND_ICON: Record<SearchResult["kind"], React.ElementType> = {
  Player: Users,
  Pairing: Grid3x3,
  Board: Grid3x3,
  Round: ListOrdered,
  Dispute: Gavel,
  Report: FileText,
  Tournament: Trophy,
  Page: ClipboardList,
};

/** Searches every entity the specification requires the palette to reach. */
function useGlobalSearch(query: string, eventId: string): SearchResult[] {
  /*
   * Players come from the database. This read `useStore((s) => s.players)`, which
   * nothing fills any more, so searching a real entrant's name found nothing.
   */
  const players = useRoster(eventId).players;

  return React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];
    for (const p of players) {
      if (
        p.fullName.toLowerCase().includes(q) ||
        p.playerId.toLowerCase().includes(q) ||
        p.club.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q)
      ) {
        out.push({
          id: `player-${p.id}`,
          kind: "Player",
          title: p.fullName,
          subtitle: `${p.playerId} · ${p.division} · ${p.rating || "Unrated"}`,
          href: `/app/players/${p.playerId}`,
          hue: p.avatarHue,
          initials: p.initials,
        });
      }
      if (out.length > 60) break;
    }

    // "board 14" / "14" → the board in the current round.
    /*
     * Boards, rounds, disputes and tournaments used to be searchable here. Each one
     * enumerated a browser-storage collection and pointed at a screen that has since
     * been removed for reading the same empty store — so every one of those results
     * was a route to a blank page. Players and destinations are what remain, and
     * both are backed by the database.
     */
    const boardNum = Number(q.replace(/[^0-9]/g, ""));
    if (!Number.isNaN(boardNum) && boardNum > 0) {
      out.push({
        id: "board-search",
        kind: "Board",
        title: `Board ${boardNum}`,
        subtitle: "Open score entry for this round",
        href: "/app/score-entry",
      });
    }


    for (const report of [
      "Final standings", "Round pairings", "Cross tables", "Attendance report",
      "Audit log", "Prize list", "Certificates", "Tournament summary",
    ]) {
      if (report.toLowerCase().includes(q)) {
        out.push({
          id: `report-${report}`,
          kind: "Report",
          title: report,
          subtitle: "Report centre",
          href: "/app/reports",
        });
      }
    }

    for (const item of ALL_ROUTES) {
      if (item.label.toLowerCase().includes(q)) {
        out.push({
          id: `page-${item.href}`,
          kind: "Page",
          title: item.label,
          subtitle: "Go to section",
          href: item.href,
        });
      }
    }

    return out.slice(0, 24);
  }, [query, players]);
}

export function CommandPalette({
  open,
  eventId,
  onClose,
}: {
  open: boolean;
  eventId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const results = useGlobalSearch(query, eventId);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset the palette when it opens, without an effect-driven cascade.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }

  const [lastQuery, setLastQuery] = React.useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActive(0);
  }

  React.useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const go = React.useCallback(
    (r: SearchResult) => {
      router.push(r.href);
      onClose();
    },
    [router, onClose],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(results.length - 1, a + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      }
      if (e.key === "Enter" && results[active]) {
        e.preventDefault();
        go(results[active]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, onClose, go]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-[rgb(17_22_43/0.3)] backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="relative w-full max-w-xl overflow-hidden rounded-card border border-[rgb(var(--glass-border))] bg-[#fcfcff]/97 shadow-[0_30px_80px_rgba(44,55,96,0.24)] backdrop-blur-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players, boards, rounds, disputes, reports…"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="hidden shrink-0 rounded-md border border-line-strong bg-white px-1.5 py-0.5 text-[11px] text-muted sm:block">
            Esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2 scroll-slim">
          {!query ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[13px] text-muted">
                Search across players, pairings, boards, rounds, disputes, reports and
                tournaments.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[13.5px] font-medium text-ink">No matches</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Try a player name, a player ID such as PK-003, or a board number.
              </p>
            </div>
          ) : (
            <ul>
              {results.map((r, i) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <li key={r.id}>
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors",
                        i === active ? "bg-primary-050" : "hover:bg-[rgb(var(--c-surface-soft))]",
                      )}
                    >
                      {r.initials !== undefined && r.hue !== undefined ? (
                        <Avatar initials={r.initials} hue={r.hue} size={30} />
                      ) : (
                        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-white text-muted shadow-sm">
                          <Icon className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">
                          {r.title}
                        </span>
                        <span className="block truncate text-[12px] text-muted">{r.subtitle}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-muted">
                        {r.kind}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
