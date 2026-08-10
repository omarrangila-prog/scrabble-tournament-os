"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  FileDown,
  Minus,
  Monitor,
  Printer,
  TrendingUp,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useGames } from "@/lib/supabase/useGames";
import { useRoster } from "@/lib/supabase/useRoster";
import { RosterGate } from "@/components/organizer/RosterGate";
import { computeStandings } from "@/lib/engine/standings";
import { cn, downloadFile, signed, toCsv } from "@/lib/utils";
import { Player } from "@/lib/domain/types";
import { PlayerDrawer } from "@/components/players/PlayerDrawer";


export default function StandingsPage() {
  const router = useRouter();
  const store = useStore();
  const { tournament, divisions, recentlyMoved } = store;

  /*
   * Players and games both come from the database. Standings themselves are not
   * stored anywhere and never will be: they are computed from verified games, and a
   * saved copy is a second version of the truth that drifts from the first.
   */
  const roster = useRoster(ACTIVE_EVENT_ID);
  const players = roster.players;
  const { pairings, round: latest, loaded: gamesLoaded } = useGames(ACTIVE_EVENT_ID, tournament.id);

  /*
   * Defaults to a division this event actually has. It was hardcoded to "masters",
   * which the user removed — so the table opened empty even with a full field.
   */
  const [division, setDivision] = React.useState<string>(divisions[0]?.id ?? "recreational");
  const [round, setRound] = React.useState<string>("0");

  /*
   * Follow the rounds that exist until the director picks one. Tracking the
   * previous value rather than writing state from an effect keeps this a render-time
   * decision, which the compiler requires.
   */
  const [seenLatest, setSeenLatest] = React.useState(0);
  if (latest !== seenLatest) {
    setSeenLatest(latest);
    setRound(String(latest));
  }
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Player | null>(null);

  const rows = React.useMemo(
    () =>
      computeStandings(players, pairings, tournament, {
        division,
        upToRound: Number(round),
      }),
    [players, pairings, tournament, division, round],
  );

  const filtered = rows.filter((r) => {
    if (!query.trim()) return true;
    const p = players.find((x) => x.id === r.playerId);
    const q = query.toLowerCase();
    return (
      p?.fullName.toLowerCase().includes(q) ||
      p?.playerId.toLowerCase().includes(q) ||
      p?.city.toLowerCase().includes(q)
    );
  });

  const exportCsv = () => {
    const data: (string | number)[][] = [
      ["Rank", "Player", "ID", "Rating", "Played", "W", "D", "L", "Spread", "Performance"],
      ...filtered.map((r) => {
        const p = players.find((x) => x.id === r.playerId);
        return [
          r.rank,
          p?.fullName ?? "",
          p?.playerId ?? "",
          p?.rating ?? "",
          r.played,
          r.wins,
          r.draws,
          r.losses,
          r.spread,
          r.performance,
        ];
      }),
    ];
    downloadFile(`standings-${division}-round-${round}.csv`, toCsv(data), "text/csv");
    store.toast({
      title: "Standings exported",
      description: `${filtered.length} rows downloaded as CSV.`,
      tone: "success",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Live Standings"
        badge={
          /*
           * Pulses only once results are actually arriving. A pulsing "Updating live"
           * over a tournament that has not started is the fifth version of the same
           * false claim found in this app.
           */
          latest > 0 ? (
            <Badge tone="success" dot pulse>
              Updating live
            </Badge>
          ) : (
            <Badge tone="neutral">No results yet</Badge>
          )
        }
        subtitle="Standings recalculate automatically whenever a result is verified."
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            <Button
              variant="secondary"
              icon={<Monitor className="size-4" />}
              onClick={() => window.open("/live/tv", "_blank")}
            >
              Public display
            </Button>
          </>
        }
      />

      <RosterGate access={roster.access} loaded={roster.loaded && gamesLoaded}>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search player, ID or club"
          className="sm:max-w-xs"
        />
        <div className="grid grid-cols-2 gap-2 sm:w-96">
          <Select value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          {/*
            * Lists the rounds that have actually been played. It used to count off
            * `tournament.currentRound`, a browser-storage counter that could disagree
            * with the games in the database.
            */}
          <Select value={round} onChange={(e) => setRound(e.target.value)} aria-label="Round">
            {latest === 0 ? (
              <option value="0">No rounds played</option>
            ) : (
              Array.from({ length: latest }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  After round {r}
                </option>
              ))
            )}
          </Select>
        </div>
      </div>

      <Card data-tour="standings-table">
        <CardHeader
          title={`${divisions.find((d) => d.id === division)?.name} standings`}
          subtitle={`${filtered.length} players · ranked by ${tournament.rankingRules.join(", then ")}`}
          icon={<TrendingUp className="size-4.5" />}
        />
        <div className="px-3 pb-4">
          {latest === 0 ? (
            <EmptyState
              title="No rounds played yet"
              description="Standings are computed from verified results. Publish a round and enter scores to see them."
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="No players match this search" description="Try a different name or clear the filter." />
          ) : (
            <TableWrap className="max-h-[68vh]">
              <thead>
                <tr>
                  <Th className="w-14">Rank</Th>
                  <Th className="w-14">Move</Th>
                  <Th>Player</Th>
                  <Th className="w-20">Rating</Th>
                  <Th className="w-16">Played</Th>
                  <Th className="w-14">W</Th>
                  <Th className="w-14">D</Th>
                  <Th className="w-14">L</Th>
                  <Th className="w-20">Spread</Th>
                  <Th className="w-24">Performance</Th>
                  <Th className="w-20">Board</Th>
                  <Th className="w-28">Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const p = players.find((x) => x.id === r.playerId);
                  if (!p) return null;
                  const move = r.previousRank - r.rank;
                  const flash = recentlyMoved.includes(r.playerId);
                  return (
                    <tr
                      key={r.playerId}
                      onClick={() => router.push(`/app/players/${p.playerId}`)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[rgb(var(--c-surface-soft))]",
                        flash && "row-flash",
                      )}
                    >
                      <Td className="num font-semibold">{r.rank}</Td>
                      <Td>
                        {move > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-success num">
                            <ArrowUp className="size-3" />
                            {move}
                          </span>
                        ) : move < 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-critical num">
                            <ArrowDown className="size-3" />
                            {Math.abs(move)}
                          </span>
                        ) : (
                          <Minus className="size-3 text-faint" />
                        )}
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <Avatar initials={p.initials} hue={p.avatarHue} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-ink">
                              {p.fullName}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted">
                              {p.playerId} · {p.club}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td className="num">{p.rating || "—"}</Td>
                      <Td className="num">{r.played}</Td>
                      <Td className="num font-medium">{r.wins}</Td>
                      <Td className="num">{r.draws}</Td>
                      <Td className="num">{r.losses}</Td>
                      <Td className={cn("num font-medium", r.spread > 0 ? "text-success" : r.spread < 0 ? "text-critical" : "")}>
                        {signed(r.spread)}
                      </Td>
                      <Td className="num">{r.performance || "—"}</Td>
                      <Td className="num">{r.currentBoard ?? "—"}</Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      </Card>

      </RosterGate>

      <PlayerDrawer player={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "checked-in") return <Badge tone="success" dot>Playing</Badge>;
  if (status === "late") return <Badge tone="warning" dot>Late</Badge>;
  if (status === "absent") return <Badge tone="critical" dot>Absent</Badge>;
  if (status === "withdrawn") return <Badge tone="critical" dot>Withdrawn</Badge>;
  return <Badge tone="neutral" dot>Not arrived</Badge>;
}
