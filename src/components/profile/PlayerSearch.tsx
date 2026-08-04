"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CornerDownLeft,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { computeStandings } from "@/lib/engine/standings";
import { flagOf, isVerified, onlineStatus, PLAYER_COUNTRY } from "@/lib/domain/profile";
import { Player } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

interface Hit {
  player: Player;
  rank?: number;
  wins: number;
  losses: number;
  spread: number;
  /** Which field produced the match, shown as a reason chip. */
  matchedOn: string;
}

/**
 * Premium player lookup. Type a name, player ID, club or city and the matching
 * players appear with their identity and live record, ready to open.
 */
export function PlayerSearch({
  onSelect,
  autoFocus = false,
  placeholder = "Search a player by name, ID, club or city…",
}: {
  onSelect?: (player: Player) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const store = useStore();
  const { players, pairings, tournament, divisions } = store;

  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Ranks for every division, computed once per data change.
  const rankMap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const d of divisions) {
      computeStandings(players, pairings, tournament, { division: d.id }).forEach((r) =>
        map.set(r.playerId, r.rank),
      );
    }
    return map;
  }, [players, pairings, tournament, divisions]);

  const recordMap = React.useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; spread: number }>();
    for (const d of divisions) {
      computeStandings(players, pairings, tournament, { division: d.id }).forEach((r) =>
        map.set(r.playerId, { wins: r.wins, losses: r.losses, spread: r.spread }),
      );
    }
    return map;
  }, [players, pairings, tournament, divisions]);

  const hits: Hit[] = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const scored: { hit: Hit; score: number }[] = [];
    for (const p of players) {
      const name = p.fullName.toLowerCase();
      const id = p.playerId.toLowerCase();
      let score = -1;
      let matchedOn = "";

      if (id === q) {
        score = 0;
        matchedOn = "Player ID";
      } else if (name.startsWith(q)) {
        score = 1;
        matchedOn = "Name";
      } else if (name.split(" ").some((part) => part.startsWith(q))) {
        score = 2;
        matchedOn = "Name";
      } else if (id.includes(q)) {
        score = 3;
        matchedOn = "Player ID";
      } else if (name.includes(q)) {
        score = 4;
        matchedOn = "Name";
      } else if (p.club.toLowerCase().includes(q)) {
        score = 5;
        matchedOn = "Club";
      } else if (p.city.toLowerCase().includes(q)) {
        score = 6;
        matchedOn = "City";
      }

      if (score >= 0) {
        const rec = recordMap.get(p.id);
        scored.push({
          score,
          hit: {
            player: p,
            rank: rankMap.get(p.id),
            wins: rec?.wins ?? 0,
            losses: rec?.losses ?? 0,
            spread: rec?.spread ?? 0,
            matchedOn,
          },
        });
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || (a.hit.rank ?? 99) - (b.hit.rank ?? 99))
      .slice(0, 8)
      .map((s) => s.hit);
  }, [query, players, rankMap, recordMap]);

  const [lastQuery, setLastQuery] = React.useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActive(0);
  }

  const open = focused && query.trim().length > 0;

  const choose = React.useCallback(
    (player: Player) => {
      setQuery("");
      setFocused(false);
      inputRef.current?.blur();
      if (onSelect) onSelect(player);
      else router.push(`/app/players/${player.playerId}`);
    },
    [onSelect, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    }
    if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      choose(hits[active].player);
    }
    if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  };

  /** Highlights the matched substring so the user sees why a row matched. */
  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="rounded-[3px] bg-primary/15 px-0.5 text-primary-600">
          {text.slice(i, i + q.length)}
        </mark>
        {text.slice(i + q.length)}
      </>
    );
  };

  return (
    <div className="relative">
      {/* Input */}
      <div
        className={cn(
          "relative flex items-center gap-3 rounded-compact border bg-[rgb(var(--c-surface))] px-4 transition-all",
          "backdrop-blur-xl",
          focused
            ? "border-primary/40 shadow-[0_10px_34px_rgba(109,93,251,0.16)]"
            : "border-[rgb(var(--glass-border))] shadow-[0_6px_18px_rgba(44,55,96,0.06)]",
        )}
      >
        <Search className={cn("size-4.5 shrink-0 transition-colors", focused ? "text-primary" : "text-faint")} />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search players"
          aria-expanded={open}
          role="combobox"
          aria-controls="player-search-results"
          className="h-13 flex-1 bg-transparent py-3.5 text-[14.5px] text-ink outline-none placeholder:text-faint"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="rounded-full p-1.5 text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-line-strong bg-white px-1.5 py-0.5 text-[11px] text-muted sm:block">
            ↵
          </kbd>
        )}
      </div>

      {/* Results */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-card border border-[rgb(var(--glass-border))] bg-[#fcfcff]/98 shadow-[0_24px_60px_rgba(44,55,96,0.2)] backdrop-blur-2xl"
          >
            {hits.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[13.5px] font-medium text-ink">No player matches “{query}”</p>
                <p className="mt-1 text-[12.5px] text-muted">
                  Try a first name, a player ID such as PK-003, or a club name.
                </p>
              </div>
            ) : (
              <>
                <p className="border-b border-line px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                  {hits.length} player{hits.length === 1 ? "" : "s"} found
                </p>
                <ul id="player-search-results" ref={listRef} role="listbox" className="max-h-[400px] overflow-y-auto p-1.5 scroll-slim">
                  {hits.map((h, i) => {
                    const status = onlineStatus(h.player);
                    const verified = isVerified(h.player);
                    return (
                      <li key={h.player.id} role="option" aria-selected={i === active}>
                        <button
                          onMouseEnter={() => setActive(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => choose(h.player)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-compact px-3 py-2.5 text-left transition-colors",
                            i === active ? "bg-primary-050" : "hover:bg-[rgb(var(--c-surface-soft))]",
                          )}
                        >
                          <span className="relative shrink-0">
                            <Avatar initials={h.player.initials} hue={h.player.avatarHue} size={40} />
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white",
                                status.online ? "bg-success" : "bg-faint",
                              )}
                              aria-hidden
                            />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[14px] font-semibold text-ink">
                                {highlight(h.player.fullName)}
                              </span>
                              {verified ? (
                                <BadgeCheck className="size-3.5 shrink-0 text-secondary" aria-label="Verified" />
                              ) : null}
                              <span className="shrink-0 text-[13px]" aria-hidden>
                                {flagOf(PLAYER_COUNTRY.code)}
                              </span>
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
                              <span className="font-medium text-primary num">
                                {highlight(h.player.playerId)}
                              </span>
                              <span aria-hidden>·</span>
                              <span className="capitalize">{h.player.division.replace(/-/g, " ")}</span>
                              <span aria-hidden>·</span>
                              <span className="truncate">{h.player.club}</span>
                            </span>
                          </span>

                          <span className="hidden shrink-0 items-center gap-3 sm:flex">
                            <span className="text-right">
                              <span className="block text-[13px] font-semibold text-ink num">
                                {h.player.rating || "—"}
                              </span>
                              <span className="block text-[10.5px] text-muted">Rating</span>
                            </span>
                            <span className="text-right">
                              <span className="block text-[13px] font-semibold text-ink num">
                                {h.wins}–{h.losses}
                              </span>
                              <span className="block text-[10.5px] text-muted">Record</span>
                            </span>
                            {h.rank ? (
                              <Badge tone={h.rank <= 3 ? "success" : "neutral"}>#{h.rank}</Badge>
                            ) : null}
                          </span>

                          <ArrowRight
                            className={cn(
                              "size-4 shrink-0 transition-opacity",
                              i === active ? "text-primary opacity-100" : "text-faint opacity-0",
                            )}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[11.5px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <CornerDownLeft className="size-3" />
                    Enter to open profile
                  </span>
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="size-3" />
                    Live record and rank
                  </span>
                </div>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Suggestions when empty */}
      {focused && !query.trim() ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-card border border-[rgb(var(--glass-border))] bg-[#fcfcff]/98 p-4 shadow-[0_24px_60px_rgba(44,55,96,0.2)] backdrop-blur-2xl"
        >
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">
            <Sparkles className="size-3" />
            Try searching for
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["PK-001", "Karachi", "Masters", "Beginner"].map((s) => (
              <button
                key={s}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(s);
                  inputRef.current?.focus();
                }}
                className="rounded-full border border-line-strong bg-[rgb(var(--c-surface))] px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:border-primary/30 hover:bg-primary-050 hover:text-primary-600"
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
