"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";

import { LiveBadge } from "@/components/public/LiveBadge";
import {
  boardsOf,
  isBye,
  isFinished,
  latestRound,
  outcomeOf,
  pointsLabel,
  recordLabel,
  roundStatus,
  roundsOf,
  signedSpread,
  standingsThrough,
  type PublicGame,
  type StandingRow,
} from "@/lib/domain/publicResults";
import { categoryName } from "@/lib/domain/publicRegistrations";
import { readEventCategories } from "@/lib/supabase/useEventCategories";
import { readPublicEvent } from "@/lib/supabase/events";
import { readCheckedInPlayers, readPublicGames, type CheckedInPlayer } from "@/lib/supabase/publicLive";
import { useLiveData } from "@/lib/supabase/useLiveData";
import { useStoredPublicEvent } from "@/lib/supabase/useStoredPublicEvent";
import { cn } from "@/lib/utils";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const BROWN = "#3E2F23";
const GOLD = "#C89B3C";

type Tab = "standings" | "pairings" | "results" | "players";

const TABS: { id: Tab; label: string }[] = [
  { id: "standings", label: "Standings" },
  { id: "pairings", label: "Pairings" },
  { id: "results", label: "Results" },
  { id: "players", label: "Players" },
];

/** States in which the tournament is over, and a FINAL view makes sense. */
const FINISHED_STATES = ["awards", "completed", "archived"];

interface Snapshot {
  games: PublicGame[];
  players: CheckedInPlayer[];
  state: string;
}

/**
 * Live results, for a phone.
 *
 * No sign-in, and nothing private: it reads three database functions that return names, tables
 * and scores and nothing else. Standings, pairings, results and the player list are all worked
 * out from the same list of games, so they cannot disagree with each other, and a corrected score
 * changes every one of them at once.
 *
 * The round selector reads history rather than replacing it. Round 1 stays available when round
 * 2 is published, and standings "through round 1" are computed from round 1's games alone — so
 * somebody can see how the table stood at any point, not only how it stands now.
 */
function LiveResults() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");
  const search = useSearchParams();

  const { event, resolved } = useStoredPublicEvent(slug);
  const eventId = event?.id ?? "";

  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);
  React.useEffect(() => {
    if (!eventId) return;
    let alive = true;
    (async () => {
      const found = await readEventCategories(eventId);
      if (alive) setCategories(found.map((c) => ({ id: c.id, name: c.name })));
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  const load = React.useCallback(async (): Promise<Snapshot> => {
    const [games, players, stored] = await Promise.all([
      readPublicGames(eventId),
      readCheckedInPlayers(eventId),
      readPublicEvent(slug),
    ]);
    return { games, players, state: stored?.state ?? "" };
  }, [eventId, slug]);

  const live = useLiveData<Snapshot>(eventId, eventId || null, load);
  const snapshot = live.data;
  const games = React.useMemo(() => snapshot?.games ?? [], [snapshot]);

  /* ---- What the viewer has chosen, kept in the address so a link opens the same view. ---- */
  const defaultCategory = event?.details.liveDefaultCategory || "all";
  const [category, setCategory] = React.useState(search.get("category") ?? "");
  const [round, setRound] = React.useState(search.get("round") ?? "current");
  const [tab, setTab] = React.useState<Tab>(
    (TABS.find((t) => t.id === search.get("tab"))?.id as Tab | undefined) ?? "standings",
  );

  /* Until somebody chooses, the event's own default. */
  const chosenCategory = category || defaultCategory;

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (category) next.set("category", category);
    if (round !== "current") next.set("round", round);
    if (tab !== "standings") next.set("tab", tab);
    const query = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [category, round, tab]);

  const rounds = React.useMemo(() => roundsOf(games), [games]);
  const latest = latestRound(games);
  const finalAvailable = latest > 0 && FINISHED_STATES.includes(snapshot?.state ?? "");

  /* A round that does not exist yet is never shown, so a stale link falls back to current. */
  const selected = round === "current" || round === "final" ? latest : rounds.includes(Number(round)) ? Number(round) : latest;
  const isFinal = round === "final" && finalAvailable;

  const division = chosenCategory === "all" ? undefined : chosenCategory;
  const divisionOrder = React.useMemo(() => {
    const known = categories.map((c) => c.id);
    const extra = [...new Set(games.map((g) => g.division))].filter((d) => !known.includes(d));
    return [...known, ...extra];
  }, [categories, games]);

  const nameOf = (id: string) => categoryName(id, categories);

  const standings = React.useMemo(
    () => standingsThrough(games, selected, division),
    [games, selected, division],
  );
  const boards = React.useMemo(() => boardsOf(games, selected, division), [games, selected, division]);
  const status = roundStatus(games, selected, division);

  if (!resolved || (event && !live.loaded)) return <Message>Opening live results…</Message>;
  if (!event) return <Message>This event was not found.</Message>;

  return (
    <main className="min-h-dvh pb-16" style={{ background: CREAM, color: BROWN }}>
      <div
        className="px-4 pb-4 pt-5 sm:px-6"
        style={{ background: `linear-gradient(180deg, ${FOREST}1F, transparent)` }}
      >
        <div className="mx-auto w-full max-w-[860px]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: FOREST }}>
            Live results
          </p>
          <h1 className="mt-0.5 text-[26px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] sm:text-[36px]">
            {event.name}
          </h1>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <LiveBadge live={live.live} loaded={live.loaded} secondsAgo={live.secondsAgo} />
          </div>

          <p className="mt-3 text-[15px] font-bold" aria-live="polite">
            {latest === 0 ? (
              "Round 1 has not started"
            ) : isFinal ? (
              "Final standings"
            ) : (
              <>
                Round {selected}
                <span className="font-semibold text-muted">
                  {" · "}
                  {status.boards === 0
                    ? "No boards"
                    : status.complete
                      ? "Complete"
                      : `In progress — ${status.finished} of ${status.boards} results in`}
                </span>
              </>
            )}
          </p>

          {/* ---- Selectors ------------------------------------------- */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-2.5">
            <Select
              label="Category"
              value={chosenCategory}
              onChange={setCategory}
              options={[
                ...divisionOrder.map((id) => ({ value: id, label: nameOf(id) })),
                { value: "all", label: "All" },
              ]}
            />
            <Select
              label="Round"
              value={round === "final" && !finalAvailable ? "current" : round}
              onChange={setRound}
              options={[
                { value: "current", label: latest ? `Now · Round ${latest}` : "Current" },
                ...rounds.map((r) => ({ value: String(r), label: `Round ${r}` })),
                ...(finalAvailable ? [{ value: "final", label: "Final" }] : []),
              ]}
            />
          </div>

          {/* ---- Views ----------------------------------------------- */}
          <div role="tablist" className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-black/[0.06] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-lg px-1 py-2 text-[13px] font-bold transition-colors sm:text-[14px]",
                  tab === t.id ? "bg-white shadow-sm" : "text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-2 w-full max-w-[860px] px-4 sm:px-6">
        {latest === 0 && tab !== "players" ? (
          <Empty>Pairings and results will appear here as soon as round 1 is published.</Empty>
        ) : tab === "standings" ? (
          <StandingsView
            rows={standings}
            divisions={division ? [division] : divisionOrder}
            nameOf={nameOf}
            showHeadings={!division}
            round={selected}
          />
        ) : tab === "pairings" ? (
          <BoardsView games={boards} nameOf={nameOf} showCategory={!division} mode="pairings" round={selected} />
        ) : tab === "results" ? (
          <BoardsView games={boards} nameOf={nameOf} showCategory={!division} mode="results" round={selected} />
        ) : (
          <PlayersView
            players={snapshot?.players ?? []}
            games={games}
            standings={standings}
            round={selected}
            division={division}
            nameOf={nameOf}
          />
        )}
      </div>
    </main>
  );
}

export default function LiveResultsPage() {
  /* `useSearchParams` needs a Suspense boundary to prerender the route. */
  return (
    <React.Suspense fallback={<Message>Opening live results…</Message>}>
      <LiveResults />
    </React.Suspense>
  );
}

/* -------------------------------------------------------------------------- */
/* Standings                                                                   */
/* -------------------------------------------------------------------------- */

function StandingsView({
  rows,
  divisions,
  nameOf,
  showHeadings,
  round,
}: {
  rows: StandingRow[];
  divisions: string[];
  nameOf: (id: string) => string;
  showHeadings: boolean;
  round: number;
}) {
  const present = divisions.filter((d) => rows.some((r) => r.division === d));

  if (present.length === 0)
    return <Empty>Standings appear once the first results are in.</Empty>;

  return (
    <div className="space-y-6">
      {present.map((d) => {
        const list = rows.filter((r) => r.division === d);
        return (
          <section key={d} aria-label={`${nameOf(d)} standings`}>
            {showHeadings ? (
              <h2 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: FOREST }}>
                {nameOf(d)}
              </h2>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-line bg-[rgb(var(--c-surface))]">
              <div className="grid grid-cols-[2rem_1fr_3.4rem_3.6rem] items-center gap-x-2 border-b border-line bg-black/[0.03] px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-muted sm:grid-cols-[2.5rem_1fr_4.5rem_3.5rem_4.5rem_3.5rem]">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">W-L</span>
                <span className="hidden text-right sm:block">Pts</span>
                <span className="text-right">Spread</span>
                <span className="hidden text-right sm:block">Games</span>
              </div>
              <ol>
                {list.map((r) => (
                  <li
                    key={`${r.division}-${r.name}`}
                    className="grid grid-cols-[2rem_1fr_3.4rem_3.6rem] items-center gap-x-2 border-b border-line/60 px-3 py-2.5 last:border-0 sm:grid-cols-[2.5rem_1fr_4.5rem_3.5rem_4.5rem_3.5rem]"
                  >
                    <span
                      className={cn("num text-[15px] font-extrabold", r.rank === 1 && "text-[#9c6f14]")}
                      style={r.rank === 1 ? { color: GOLD } : undefined}
                    >
                      {r.rank}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15.5px] font-bold">{r.name}</span>
                      <span className="num block text-[11.5px] text-muted sm:hidden">
                        {pointsLabel(r.points)} {r.points === 1 ? "pt" : "pts"} · {r.played} played
                      </span>
                    </span>
                    <span className="num text-right text-[15px] font-semibold">{recordLabel(r)}</span>
                    <span className="num hidden text-right text-[15px] font-semibold sm:block">{pointsLabel(r.points)}</span>
                    <span
                      className={cn(
                        "num text-right text-[15px] font-bold",
                        r.spread > 0 ? "text-[#12855c]" : r.spread < 0 ? "text-[#c33450]" : "text-muted",
                      )}
                    >
                      {signedSpread(r.spread)}
                    </span>
                    <span className="num hidden text-right text-[15px] text-muted sm:block">{r.played}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        );
      })}
      <p className="text-center text-[12px] text-muted">Standings after round {round}.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pairings and results                                                        */
/* -------------------------------------------------------------------------- */

function BoardsView({
  games,
  nameOf,
  showCategory,
  mode,
  round,
}: {
  games: PublicGame[];
  nameOf: (id: string) => string;
  showCategory: boolean;
  mode: "pairings" | "results";
  round: number;
}) {
  const shown = mode === "results" ? games.filter((g) => !isBye(g)) : games;

  if (shown.length === 0) return <Empty>Nothing for round {round} in this category yet.</Empty>;

  return (
    <div>
      <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: FOREST }}>
        Round {round} {mode === "pairings" ? "pairings" : "results"}
      </h2>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {shown.map((g) => (
          <li
            key={`${g.round}-${g.board}`}
            className="rounded-2xl border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase tracking-wider text-muted">
              <span>Table {g.board}</span>
              {showCategory ? <span>{nameOf(g.division)}</span> : null}
            </div>
            {mode === "pairings" ? <Pairing game={g} /> : <Result game={g} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pairing({ game }: { game: PublicGame }) {
  if (isBye(game))
    return (
      <p className="mt-2 text-center text-[17px] font-bold">
        {game.playerA} <span className="text-[12px] font-extrabold tracking-widest text-muted">· BYE</span>
      </p>
    );

  return (
    <div className="mt-2 text-center">
      <p className="text-[17px] font-bold leading-tight">{game.playerA}</p>
      <p className="my-0.5 text-[11px] font-extrabold tracking-[0.2em] text-muted">VS</p>
      <p className="text-[17px] font-bold leading-tight">{game.playerB}</p>
    </div>
  );
}

function Result({ game }: { game: PublicGame }) {
  if (!isFinished(game))
    return (
      <>
        <div className="mt-2 text-center">
          <p className="text-[16px] font-semibold leading-tight">{game.playerA}</p>
          <p className="my-0.5 text-[11px] font-extrabold tracking-[0.2em] text-muted">VS</p>
          <p className="text-[16px] font-semibold leading-tight">{game.playerB}</p>
        </div>
        <p className="mt-2 text-center text-[12px] font-extrabold uppercase tracking-wider text-[#a76d16]">
          Result pending
        </p>
      </>
    );

  const o = outcomeOf(game);
  const side = (name: string, score: number | null, won: boolean) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn("min-w-0 truncate text-[16.5px]", won ? "font-extrabold" : "font-medium text-muted")}>{name}</span>
      <span className={cn("num shrink-0 text-[18px]", won ? "font-extrabold" : "font-semibold text-muted")}>{score}</span>
    </div>
  );

  return (
    <>
      <div className="mt-2 space-y-0.5">
        {side(game.playerA, game.scoreA, o.winner === "a")}
        {side(game.playerB as string, game.scoreB, o.winner === "b")}
      </div>
      <p className="mt-2 border-t border-line pt-2 text-center text-[12.5px] font-bold text-[#12855c]">
        {o.winner === "draw" ? "Draw" : `${o.winnerName} wins · Spread ${signedSpread(o.spread)}`}
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Players                                                                     */
/* -------------------------------------------------------------------------- */

function PlayersView({
  players,
  games,
  standings,
  round,
  division,
  nameOf,
}: {
  players: CheckedInPlayer[];
  games: PublicGame[];
  standings: StandingRow[];
  round: number;
  division: string | undefined;
  nameOf: (id: string) => string;
}) {
  const list = React.useMemo(() => {
    const byKey = new Map<string, { name: string; division: string; checkedIn: boolean }>();

    for (const p of players) {
      if (division && p.division !== division) continue;
      byKey.set(`${p.division}\u0000${p.name}`, { name: p.name, division: p.division, checkedIn: true });
    }
    /* Somebody on a board is a player, whether or not the arrivals list has them. */
    for (const g of games) {
      if (division && g.division !== division) continue;
      for (const name of [g.playerA, g.playerB]) {
        if (!name) continue;
        const key = `${g.division}\u0000${name}`;
        if (!byKey.has(key)) byKey.set(key, { name, division: g.division, checkedIn: false });
      }
    }

    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [players, games, division]);

  const tableFor = (name: string, div: string) => {
    const g = games.find(
      (x) => x.round === round && x.division === div && (x.playerA === name || x.playerB === name),
    );
    return g ? g.board : null;
  };

  const record = (name: string, div: string) =>
    standings.find((s) => s.name === name && s.division === div);

  if (list.length === 0) return <Empty>No players here yet.</Empty>;

  return (
    <div>
      <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: FOREST }}>
        {list.length} players
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-line bg-[rgb(var(--c-surface))]">
        {list.map((p) => {
          const r = record(p.name, p.division);
          const table = tableFor(p.name, p.division);
          return (
            <li
              key={`${p.division}-${p.name}`}
              className="flex items-center justify-between gap-3 border-b border-line/60 px-3.5 py-2.5 last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15.5px] font-bold">{p.name}</span>
                {!division ? <span className="block text-[11.5px] text-muted">{nameOf(p.division)}</span> : null}
              </span>
              <span className="num shrink-0 text-right text-[13px] font-semibold text-muted">
                {r ? `${recordLabel(r)} · ${signedSpread(r.spread)}` : "—"}
                {table !== null ? <span className="block text-[11.5px]">Table {table}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[16px] font-bold outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-10 text-center text-[14.5px] font-medium text-muted">{children}</p>;
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6" style={{ background: CREAM, color: BROWN }}>
      <p className="text-center text-[16px] font-semibold">{children}</p>
    </main>
  );
}
