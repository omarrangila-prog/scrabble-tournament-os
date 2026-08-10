"use client";

import * as React from "react";
import Link from "next/link";
import {
  Calendar,
  Grid3x3,
  LayoutGrid,
  Info,
  Link2,
  MapPin,
  Megaphone,
  Monitor,
  Trophy,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  SearchInput,
  Select,
  Tabs,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { useRoster } from "@/lib/supabase/useRoster";
import { useGames } from "@/lib/supabase/useGames";
import { computeStandings } from "@/lib/engine/standings";
import { cn, formatDate, formatTime, signed } from "@/lib/utils";

const NAV = [
  { id: "home", label: "Home" },
  { id: "pairings", label: "Live Pairings" },
  { id: "results", label: "Live Results" },
  { id: "standings", label: "Standings" },
  { id: "players", label: "Players" },
  { id: "schedule", label: "Schedule" },
  { id: "info", label: "Tournament Information" },
  { id: "sponsors", label: "Sponsors" },
  { id: "announcements", label: "Announcements" },
];

export default function PublicSitePage() {
  const store = useStore();
  const { tournament, divisions, venue, announcements } = store;

  /*
   * The venue screen reads the database.
   *
   * This is the display on the wall, and it was reading browser storage — so it
   * showed an empty board list and empty standings beside a room full of people
   * playing. Standings are computed here from verified games rather than stored,
   * the same as everywhere else.
   */
  const roster = useRoster(ACTIVE_EVENT_ID);
  const players = roster.players;
  const games = useGames(ACTIVE_EVENT_ID, tournament.id);
  const pairings = games.pairings;

  const [tab, setTab] = React.useState("home");
  const [query, setQuery] = React.useState("");
  const [division, setDivision] = React.useState("all");
  const [round, setRound] = React.useState("0");

  /*
   * Follow the published rounds until somebody picks one. Tracking the previous
   * value keeps this a render-time decision rather than state written from an
   * effect, which the compiler forbids.
   */
  const [seenRound, setSeenRound] = React.useState(0);
  if (games.round !== seenRound) {
    setSeenRound(games.round);
    setRound(String(games.round));
  }

  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";
  const playerOf = (id: string | null) => (id ? players.find((p) => p.id === id) : undefined);

  const roundPairings = pairings
    .filter((p) => p.round === Number(round))
    .sort((a, b) => a.board - b.board);

  const filteredPairings = roundPairings.filter((p) => {
    if (division !== "all" && p.division !== division) return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      String(p.board) === q ||
      nameOf(p.playerAId).toLowerCase().includes(q) ||
      nameOf(p.playerBId).toLowerCase().includes(q)
    );
  });

  // Boards still being played: paired, no score yet.
  const liveCount = games.games.filter(
    (g) => g.round === games.round && g.scoreA === null,
  ).length;

  /*
   * Most recently recorded first, using the time the score was entered. The old
   * version sorted on `completedAt`, which nothing sets, so the order was whatever
   * the array happened to be in.
   */
  const latestResults = games.games
    .filter((g) => g.scoreA !== null)
    .sort((a, b) => (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? ""))
    .slice(0, 8)
    .map((g) => pairings.find((p) => p.id === g.id)!)
    .filter(Boolean);

  /*
   * Leaders from the event's own top division, not a hardcoded "masters".
   * AlphaBattle runs beginner, recreational and advanced — asking for Masters
   * returned nothing and labelled the empty card "Masters division".
   */
  const topDivision = divisions[divisions.length - 1]?.id ?? tournament.divisions[0];
  const leaders = computeStandings(players, pairings, tournament, {
    division: topDivision,
  }).slice(0, 5);

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    store.toast({
      title: "Public link copied",
      description: "Share this link with players and spectators.",
      tone: "success",
    });
  };

  return (
    <div className="min-h-dvh">
      {/* Public header --------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary text-white">
            <LayoutGrid className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
              {tournament.name.replace(" — Demo", "")}
            </p>
            <p className="truncate text-[11.5px] text-muted">
              {venue.name}, {tournament.city}
            </p>
          </div>
          {/* Public page: never claim a round is under way before one is. */}
          {games.round > 0 && liveCount > 0 ? (
            <Badge tone="success" dot pulse className="hidden sm:inline-flex">
              Live · Round {games.round}
            </Badge>
          ) : (
            <Badge tone="neutral" className="hidden sm:inline-flex">
              Not started
            </Badge>
          )}
          <Button size="sm" variant="secondary" icon={<Link2 className="size-3.5" />} onClick={copyLink} className="hidden sm:inline-flex">
            Copy Public Link
          </Button>
          <Link href="/live/tv" target="_blank">
            <Button size="sm" variant="secondary" icon={<Monitor className="size-3.5" />}>
              <span className="hidden sm:inline">TV display</span>
            </Button>
          </Link>
        </div>

        <div className="mx-auto max-w-[1400px] px-4 pb-2 sm:px-6">
          <Tabs tabs={NAV} value={tab} onChange={setTab} />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* HOME ---------------------------------------------------------- */}
        {tab === "home" ? (
          <div className="space-y-4">
            <Card className="board-motif overflow-hidden">
              <div className="p-6 sm:p-8">
                {tournament.status === "live" ? (
                  <Badge tone="success" dot pulse>
                    Live now
                  </Badge>
                ) : (
                  <Badge tone="neutral">Not started</Badge>
                )}
                <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[34px]">
                  {tournament.name.replace(" — Demo", "")}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" />
                    {venue.name}, {tournament.city}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-4" />
                    {formatDate(tournament.startDate)} – {formatDate(tournament.endDate)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" />
                    {players.length} players
                  </span>
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {[
                    ["Current round", `${games.round} of ${tournament.totalRounds}`],
                    ["Boards live", String(liveCount)],
                    ["Divisions", String(divisions.length)],

                  ].map(([l, v]) => (
                    <div key={l} className="rounded-compact bg-[rgb(var(--c-surface))] px-3.5 py-3">
                      <p className="text-[19px] font-semibold text-ink num">{v}</p>
                      <p className="text-[11.5px] text-muted">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader
                  title="Featured leaders"
                  subtitle={divisions.find((d) => d.id === topDivision)?.name ?? "Top division"}
                  icon={<Trophy className="size-4.5" />}
                />
                <div className="space-y-1.5 px-4 pb-4">
                  {leaders.map((r) => {
                    const p = playerOf(r.playerId);
                    if (!p) return null;
                    return (
                      <div key={r.playerId} className="flex items-center gap-2.5 rounded-control bg-[rgb(var(--c-surface))] px-3 py-2">
                        <span className="w-5 text-center text-[13px] font-semibold text-ink num">{r.rank}</span>
                        <Avatar initials={p.initials} hue={p.avatarHue} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{p.fullName}</span>
                          <span className="block text-[11.5px] text-muted num">
                            {r.wins}–{r.losses} · {signed(r.spread)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader title="Latest results" subtitle="Verified and included in standings" />
                <div className="space-y-1.5 px-4 pb-4">
                  {latestResults.length === 0 ? (
                    <EmptyState title="No results yet" description="Results appear here as soon as they are verified." />
                  ) : (
                    latestResults.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3 py-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-primary-050 text-[12px] font-semibold text-primary num">
                          {p.board}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {nameOf(p.playerAId)} vs {nameOf(p.playerBId)}
                        </span>
                        <span className="shrink-0 text-[12.5px] font-semibold text-ink num">
                          {p.scoreA} – {p.scoreB}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {announcements.length > 0 ? (
              <Card>
                <CardHeader title="Announcements" icon={<Megaphone className="size-4.5" />} />
                <div className="space-y-2 px-5 pb-5">
                  {announcements.slice(0, 3).map((a) => (
                    <div key={a.id} className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-semibold text-ink">{a.title}</p>
                        {a.pinned ? <Badge tone="primary">Pinned</Badge> : null}
                      </div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{a.body}</p>
                      <p className="mt-1 text-[11.5px] text-faint">{formatTime(a.publishedAt)}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <SponsorStrip sponsors={tournament.sponsors} />
          </div>
        ) : null}

        {/* PAIRINGS ------------------------------------------------------ */}
        {tab === "pairings" ? (
          <Card>
            <CardHeader
              title={`Round ${round} pairings`}
              subtitle={`${filteredPairings.length} boards`}
              icon={<Grid3x3 className="size-4.5" />}
            />
            <div className="px-5 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <SearchInput value={query} onChange={setQuery} placeholder="Board or player name" className="sm:max-w-xs" />
                <div className="grid grid-cols-2 gap-2 sm:w-80">
                  <Select value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
                    <option value="all">All divisions</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </Select>
                  <Select value={round} onChange={(e) => setRound(e.target.value)} aria-label="Round">
                    {Array.from({ length: games.round }, (_, i) => i + 1).map((r) => (
                      <option key={r} value={r}>Round {r}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
            <div className="px-3 pb-4">
              <TableWrap>
                <thead>
                  <tr>
                    <Th className="w-20">Board</Th>
                    <Th>Player</Th>
                    <Th className="w-20">Rating</Th>
                    <Th>Opponent</Th>
                    <Th className="w-20">Rating</Th>
                    <Th className="w-32">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPairings.map((p) => (
                    <tr key={p.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                      <Td className="num font-semibold">{p.playerBId ? p.board : "Bye"}</Td>
                      <Td>{nameOf(p.playerAId)}</Td>
                      <Td className="num text-muted">{playerOf(p.playerAId)?.rating || "—"}</Td>
                      <Td>{nameOf(p.playerBId)}</Td>
                      <Td className="num text-muted">{playerOf(p.playerBId)?.rating || "—"}</Td>
                      <Td>
                        <Badge
                          tone={p.status === "verified" ? "success" : p.status === "live" ? "info" : "neutral"}
                          dot
                          pulse={p.status === "live"}
                        >
                          {p.status === "verified" ? "Final" : p.status === "live" ? "Playing" : p.status.replace(/-/g, " ")}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>
        ) : null}

        {/* RESULTS ------------------------------------------------------- */}
        {tab === "results" ? (
          <Card>
            <CardHeader title={`Round ${round} results`} subtitle="Verified results only" />
            <div className="px-5 pb-3">
              <Select value={round} onChange={(e) => setRound(e.target.value)} aria-label="Round" className="sm:max-w-[200px]">
                {Array.from({ length: games.round }, (_, i) => i + 1).map((r) => (
                  <option key={r} value={r}>Round {r}</option>
                ))}
              </Select>
            </div>
            <div className="px-3 pb-4">
              <TableWrap>
                <thead>
                  <tr>
                    <Th className="w-20">Board</Th>
                    <Th>Player A</Th>
                    <Th className="w-20">Score</Th>
                    <Th>Player B</Th>
                    <Th className="w-20">Score</Th>
                    <Th className="w-24">Spread</Th>
                  </tr>
                </thead>
                <tbody>
                  {roundPairings.filter((p) => p.scoreA !== undefined).map((p) => (
                    <tr key={p.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                      <Td className="num font-semibold">{p.board}</Td>
                      <Td className={cn(p.scoreA! > p.scoreB! && "font-semibold")}>{nameOf(p.playerAId)}</Td>
                      <Td className="num">{p.scoreA}</Td>
                      <Td className={cn(p.scoreB! > p.scoreA! && "font-semibold")}>{nameOf(p.playerBId)}</Td>
                      <Td className="num">{p.scoreB}</Td>
                      <Td className="num">{Math.abs(p.scoreA! - p.scoreB!)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>
        ) : null}

        {/* STANDINGS ----------------------------------------------------- */}
        {tab === "standings" ? <PublicStandings /> : null}

        {/* PLAYERS ------------------------------------------------------- */}
        {tab === "players" ? (
          <Card>
            <CardHeader title="Players" subtitle={`${players.length} registered`} />
            <div className="px-5 pb-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search by name or club" className="sm:max-w-sm" />
            </div>
            <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              {players
                .filter((p) => {
                  const q = query.trim().toLowerCase();
                  return !q || p.fullName.toLowerCase().includes(q) || p.club.toLowerCase().includes(q);
                })
                .slice(0, 48)
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 rounded-control bg-[rgb(var(--c-surface))] px-3 py-2.5">
                    <Avatar initials={p.initials} hue={p.avatarHue} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{p.fullName}</p>
                      <p className="truncate text-[11.5px] text-muted">
                        {p.city} · {p.rating || "Unrated"}
                      </p>
                    </div>
                    <Badge tone="neutral" className="shrink-0 capitalize">
                      {p.division.replace(/-/g, " ")}
                    </Badge>
                  </div>
                ))}
            </div>
          </Card>
        ) : null}

        {/* SCHEDULE ------------------------------------------------------ */}
        {tab === "schedule" ? (
          <Card>
            <CardHeader title="Schedule" subtitle={`${tournament.totalRounds} rounds`} icon={<Calendar className="size-4.5" />} />
            <div className="space-y-1.5 px-5 pb-5">
              {Array.from({ length: tournament.totalRounds }, (_, i) => i + 1).map((r) => {
                const done = r < games.round;
                const current = r === games.round;
                const start = 9 + Math.floor((r - 1) * 1.25);
                return (
                  <div
                    key={r}
                    className={cn(
                      "flex items-center gap-3 rounded-control px-3.5 py-3",
                      current ? "bg-primary-050" : "bg-[rgb(var(--c-surface))]",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white text-[13px] font-semibold text-ink num">
                      {r}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink">Round {r}</p>
                      <p className="text-[12px] text-muted">
                        {String(start).padStart(2, "0")}:15 · {tournament.gameMinutes} minutes per game
                      </p>
                    </div>
                    <Badge tone={done ? "success" : current ? "info" : "neutral"} dot pulse={current}>
                      {done ? "Complete" : current ? "In progress" : "Scheduled"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {/* INFORMATION --------------------------------------------------- */}
        {tab === "info" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Tournament information" icon={<Info className="size-4.5" />} />
              <dl className="space-y-1.5 px-5 pb-5 text-[13px]">
                {[
                  ["Organizer", tournament.organizer],
                  ["Venue", venue.name],
                  ["City", tournament.city],
                  ["Dates", `${formatDate(tournament.startDate)} – ${formatDate(tournament.endDate)}`],
                  ["Format", "Swiss System"],
                  ["Rounds", String(tournament.totalRounds)],
                  ["Game time", `${tournament.gameMinutes} minutes per player`],
                  ["Divisions", divisions.map((d) => d.name).join(", ")],
                  ["Ranking", tournament.rankingRules.join(", then ")],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right capitalize text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <CardHeader title="Venue" subtitle={venue.name} icon={<MapPin className="size-4.5" />} />
              <div className="px-5 pb-5">
                <div className="board-motif grid h-40 place-items-center rounded-compact border border-line bg-[rgb(var(--c-surface-soft))]">
                  <p className="text-[12.5px] text-muted">Venue floor plan</p>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {venue.halls.map((h) => (
                    <li key={h} className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2 text-[12.5px] text-ink">
                      {h}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-muted">
                  Boards 1 to 20 are on the ground floor and are step-free.
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        {/* SPONSORS ------------------------------------------------------ */}
        {tab === "sponsors" ? (
          <Card>
            <CardHeader title="Sponsors" subtitle="Supporting this championship" />
            <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-4">
              {tournament.sponsors.map((s) => (
                <div key={s} className="board-motif grid h-24 place-items-center rounded-compact border border-line bg-[rgb(var(--c-surface))]">
                  <p className="px-2 text-center text-[13px] font-semibold text-ink">{s}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* ANNOUNCEMENTS ------------------------------------------------- */}
        {tab === "announcements" ? (
          <div className="space-y-2">
            {announcements.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold text-ink">{a.title}</p>
                  {a.pinned ? <Badge tone="primary" dot>Pinned</Badge> : null}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{a.body}</p>
                <p className="mt-1.5 text-[11.5px] text-muted">
                  {a.author} · {formatTime(a.publishedAt)} · {a.audience}
                </p>
              </Card>
            ))}
          </div>
        ) : null}
      </main>

      <footer className="border-t border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-2 text-center">
          <p className="text-[12.5px] text-muted">
            {tournament.organizer} · Powered by Blufy&rsquo;s AlphaBattle
          </p>
          <Link href="/organizer" className="text-[12px] text-primary underline underline-offset-2">
            Organizer sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}

function PublicStandings() {
  const store = useStore();
  const { tournament, divisions } = store;

  const roster = useRoster(ACTIVE_EVENT_ID);
  const players = roster.players;
  const games = useGames(ACTIVE_EVENT_ID, tournament.id);
  const pairings = games.pairings;

  /*
   * Opens on a division this event has. It opened on "masters", which was removed,
   * so the public standings table was empty and its heading said "undefined
   * standings".
   */
  const [division, setDivision] = React.useState<string>(divisions[0]?.id ?? "recreational");
  const [round, setRound] = React.useState("0");
  const [query, setQuery] = React.useState("");

  const [seenRound, setSeenRound] = React.useState(0);
  if (games.round !== seenRound) {
    setSeenRound(games.round);
    setRound(String(games.round));
  }

  const rows = computeStandings(players, pairings, tournament, {
    division,
    upToRound: Number(round),
  }).filter((r) => {
    const p = players.find((x) => x.id === r.playerId);
    const q = query.trim().toLowerCase();
    return !q || p?.fullName.toLowerCase().includes(q);
  });

  return (
    <Card>
      <CardHeader
        title={`${divisions.find((d) => d.id === division)?.name} standings`}
        subtitle={`After round ${round}`}
        icon={<Trophy className="size-4.5" />}
      />
      <div className="px-5 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput value={query} onChange={setQuery} placeholder="Search player" className="sm:max-w-xs" />
          <div className="grid grid-cols-2 gap-2 sm:w-80">
            <Select value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
            <Select value={round} onChange={(e) => setRound(e.target.value)} aria-label="Round">
              {Array.from({ length: games.round }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>After round {r}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <div className="px-3 pb-4">
        <TableWrap>
          <thead>
            <tr>
              <Th className="w-16">Rank</Th>
              <Th className="w-14">Move</Th>
              <Th>Player</Th>
              <Th className="w-16">W</Th>
              <Th className="w-16">L</Th>
              <Th className="w-24">Spread</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = players.find((x) => x.id === r.playerId);
              if (!p) return null;
              const move = r.previousRank - r.rank;
              return (
                <tr key={r.playerId} className="hover:bg-[rgb(var(--c-surface-soft))]">
                  <Td className="num font-semibold">{r.rank}</Td>
                  <Td>
                    {move > 0 ? (
                      <span className="text-[12px] font-semibold text-success num">▲ {move}</span>
                    ) : move < 0 ? (
                      <span className="text-[12px] font-semibold text-critical num">▼ {Math.abs(move)}</span>
                    ) : (
                      <span className="text-[12px] text-faint">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar initials={p.initials} hue={p.avatarHue} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-ink">{p.fullName}</span>
                        <span className="block truncate text-[11px] text-muted">{p.club}</span>
                      </span>
                    </span>
                  </Td>
                  <Td className="num font-medium">{r.wins}</Td>
                  <Td className="num">{r.losses}</Td>
                  <Td className="num">{signed(r.spread)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </div>
    </Card>
  );
}

function SponsorStrip({ sponsors }: { sponsors: string[] }) {
  if (sponsors.length === 0) return null;
  return (
    <Card className="p-5">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
        Official sponsors
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        {sponsors.map((s) => (
          <span key={s} className="rounded-control bg-[rgb(var(--c-surface))] px-4 py-2 text-[13px] font-semibold text-ink">
            {s}
          </span>
        ))}
      </div>
    </Card>
  );
}
