"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Plus,
  Shield,
  Swords,
  Trash2,
  TrendingUp,
  UserMinus,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  TableWrap,
  Tabs,
  Td,
  Th,
  Toggle,
} from "@/components/ui";
import { selectRegistrations, useEventStore } from "@/lib/store/useEventStore";
import { useLiveStore } from "@/lib/store/useLiveStore";
import { useTeamStore } from "@/lib/store/useTeamStore";
import { useStore } from "@/lib/store/useStore";
import {
  pointsPerGame,
  TeamGame,
  teamMatches,
  teamStandings,
  validateTeams,
} from "@/lib/engine/teams";
import { CHART_SERIES } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/** Renders a signed spread the way score tables elsewhere do. */
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * Team scoring — schools and clubs ranked from the same verified games that
 * produce the individual standings.
 *
 * Nothing on this page can be entered directly. Every number is derived, so
 * the team table and the individual table can never disagree.
 */
export default function TeamsPage() {
  const events = useEventStore();
  const live = useLiveStore();
  const teamStore = useTeamStore();
  const app = useStore();

  const event = events.events[0];

  const [tab, setTab] = React.useState("standings");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [assigning, setAssigning] = React.useState<string | null>(null);

  if (!event) {
    return (
      <Card>
        <EmptyState title="No event" description="Create an event before setting up teams." />
      </Card>
    );
  }

  const registrations = selectRegistrations(events, event.id);
  const nameOf = (id: string) => registrations.find((r) => r.id === id)?.fullName ?? "Unknown";

  const teams = teamStore.teamsFor(event.id);
  const rules = teamStore.rulesFor(event.id);
  const round = live.currentRound(event.id);

  // Build the game record from verified submissions. Each board yields two
  // mirrored rows, one from each player's perspective.
  const games: TeamGame[] = [];
  for (const p of live.pairings.filter((x) => x.eventId === event.id)) {
    const subs = live.submissions.filter(
      (s) => s.eventId === event.id && s.round === p.round && s.board === p.board,
    );
    const settled = subs.find((s) => s.confirmed && !s.disputed);
    if (!settled) {
      // Still record it as unverified so the standings can report the gap.
      games.push(
        { round: p.round, board: p.board, playerId: p.playerAId, opponentId: p.playerBId, playerScore: 0, opponentScore: 0, verified: false },
        { round: p.round, board: p.board, playerId: p.playerBId, opponentId: p.playerAId, playerScore: 0, opponentScore: 0, verified: false },
      );
      continue;
    }

    const aScore = settled.byId === p.playerAId ? settled.myScore : settled.theirScore;
    const bScore = settled.byId === p.playerAId ? settled.theirScore : settled.myScore;

    games.push(
      { round: p.round, board: p.board, playerId: p.playerAId, opponentId: p.playerBId, playerScore: aScore, opponentScore: bScore, verified: true },
      { round: p.round, board: p.board, playerId: p.playerBId, opponentId: p.playerAId, playerScore: bScore, opponentScore: aScore, verified: true },
    );
  }

  const standings = teamStandings(teams, games, rules);
  const matches = teamMatches(teams, games, round, rules);
  const issues = validateTeams(teams, registrations.map((r) => r.id));
  const errors = issues.filter((i) => i.severity === "error");

  const assigned = new Set(teams.flatMap((t) => t.memberIds));
  const unassigned = registrations.filter(
    (r) => r.status === "approved" && !assigned.has(r.id),
  );

  const totalVerified = standings.reduce((s, t) => s + t.played, 0);
  const totalUnverified = standings.reduce((s, t) => s + t.unverifiedGames, 0);

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle={`${event.name} · ${teams.length} team${teams.length === 1 ? "" : "s"}`}
        badge={
          errors.length ? (
            <Badge tone="critical">{errors.length} to fix</Badge>
          ) : teams.length ? (
            <Badge tone="success">Rosters valid</Badge>
          ) : undefined
        }
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            New team
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Teams" value={teams.length} sub={`${assigned.size} players assigned`} icon={<Shield className="size-5" />} tone="primary" />
        <Stat label="Unassigned" value={unassigned.length} sub="approved, no team" icon={<UserMinus className="size-5" />} tone={unassigned.length ? "warning" : "success"} />
        <Stat label="Counted games" value={totalVerified} sub="verified results only" icon={<Check className="size-5" />} tone="success" />
        <Stat label="Not yet counted" value={totalUnverified} sub={totalUnverified ? "awaiting verification" : "nothing outstanding"} icon={<AlertTriangle className="size-5" />} tone={totalUnverified ? "warning" : "success"} />
      </div>

      {issues.length ? (
        <div className="mt-3 space-y-2">
          {issues.map((issue, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-feature px-4 py-3",
                issue.severity === "error" ? "bg-critical-050" : "bg-warning-050",
              )}
            >
              <AlertTriangle
                className={cn(
                  "mt-0.5 size-4.5 shrink-0",
                  issue.severity === "error" ? "text-critical" : "text-[#a76d16]",
                )}
              />
              <p
                className={cn(
                  "text-[13px] leading-relaxed",
                  issue.severity === "error" ? "text-critical" : "text-[#a76d16]",
                )}
              >
                {issue.message}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "standings", label: "Team table" },
            { id: "matches", label: `Round ${round}`, count: matches.length },
            { id: "rosters", label: "Rosters", count: teams.length },
            { id: "rules", label: "Scoring" },
          ]}
        />
      </div>

      {/* Standings ---------------------------------------------------------- */}
      {tab === "standings" ? (
        <Card className="mt-4">
          <CardHeader
            title="Team table"
            subtitle="Derived from verified games. Unverified boards contribute nothing."
          />
          {standings.length ? (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th className="w-[52px] text-center">#</Th>
                    <Th>Team</Th>
                    <Th className="text-center">P</Th>
                    <Th className="text-center">W</Th>
                    <Th className="text-center">D</Th>
                    <Th className="text-center">L</Th>
                    <Th className="text-right">Points</Th>
                    <Th className="text-right">Per game</Th>
                    <Th className="text-right">Spread</Th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => (
                    <tr key={row.teamId}>
                      <Td className="num text-center font-bold">{row.rank}</Td>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: CHART_SERIES[i % CHART_SERIES.length] }}
                          />
                          <span>
                            <span className="block font-semibold text-ink">{row.name}</span>
                            {row.unverifiedGames ? (
                              <span className="block text-[11px] text-[#a76d16]">
                                {row.unverifiedGames} game
                                {row.unverifiedGames === 1 ? "" : "s"} not yet counted
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </Td>
                      <Td className="num text-center">{row.played}</Td>
                      <Td className="num text-center font-semibold text-success">{row.wins}</Td>
                      <Td className="num text-center">{row.draws}</Td>
                      <Td className="num text-center text-muted">{row.losses}</Td>
                      <Td className="num text-right text-[15px] font-extrabold text-ink">
                        {row.points}
                      </Td>
                      <Td className="num text-right text-muted">{pointsPerGame(row)}</Td>
                      <Td
                        className={cn(
                          "num text-right font-semibold",
                          row.spread > 0 ? "text-success" : row.spread < 0 ? "text-critical" : "text-muted",
                        )}
                      >
                        {signed(row.spread)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <EmptyState
              title="No teams yet"
              description="Create a team and assign players to see the table."
            />
          )}
        </Card>
      ) : null}

      {/* Matches ------------------------------------------------------------- */}
      {tab === "matches" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {matches.length ? (
            matches.map((m) => (
              <Card key={`${m.homeId}:${m.awayId}`}>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-[15px] font-bold",
                          m.result === "home" ? "text-success" : "text-ink",
                        )}
                      >
                        {m.homeName}
                      </p>
                    </div>
                    <div className="shrink-0 text-center">
                      <p className="num text-[22px] font-extrabold leading-none text-ink">
                        {m.homePoints} – {m.awayPoints}
                      </p>
                      <p className="num mt-0.5 text-[11px] text-muted">{signed(m.homeSpread)}</p>
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <p
                        className={cn(
                          "truncate text-[15px] font-bold",
                          m.result === "away" ? "text-success" : "text-ink",
                        )}
                      >
                        {m.awayName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 text-center">
                    <Badge tone={m.result === "pending" ? "warning" : m.result === "draw" ? "neutral" : "success"}>
                      {m.result === "pending"
                        ? "Pending verification"
                        : m.result === "draw"
                          ? "Drawn"
                          : `${m.result === "home" ? m.homeName : m.awayName} win`}
                    </Badge>
                  </div>

                  <ul className="mt-3 space-y-1">
                    {m.boards.map((b) => (
                      <li
                        key={b.board}
                        className={cn(
                          "grid grid-cols-[28px_1fr_auto_1fr] items-center gap-2 rounded-control px-2.5 py-2 text-[12.5px]",
                          b.verified ? "bg-[rgb(var(--c-surface-soft))]" : "bg-warning-050",
                        )}
                      >
                        <span className="num text-faint">{b.board}</span>
                        <span className="truncate text-ink">{nameOf(b.homePlayerId)}</span>
                        <span className="num font-semibold text-ink">
                          {b.verified ? `${b.homeScore}–${b.awayScore}` : "—"}
                        </span>
                        <span className="truncate text-right text-ink">
                          {nameOf(b.awayPlayerId)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))
          ) : (
            <Card className="md:col-span-2">
              <EmptyState
                icon={<Swords className="size-5" />}
                title={`No team matches in round ${round}`}
                description="Team matches appear once players from different teams are paired against each other."
              />
            </Card>
          )}
        </div>
      ) : null}

      {/* Rosters ------------------------------------------------------------- */}
      {tab === "rosters" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-12">
          <div className="space-y-3 xl:col-span-8">
            {teams.length ? (
              teams.map((t, i) => (
                <Card key={t.id}>
                  <CardHeader
                    title={t.name}
                    subtitle={`${t.shortName} · ${t.memberIds.length} player${t.memberIds.length === 1 ? "" : "s"}`}
                    icon={
                      <span
                        className="size-3 rounded-full"
                        style={{ background: CHART_SERIES[i % CHART_SERIES.length] }}
                      />
                    }
                    action={
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setAssigning(t.id)}>
                          Add players
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 className="size-3.5" />}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete "${t.name}"? Its ${t.memberIds.length} player${t.memberIds.length === 1 ? "" : "s"} become unassigned. Individual results are unaffected.`,
                              )
                            ) {
                              teamStore.removeTeam(t.id);
                              app.toast({ title: "Team deleted", description: t.name, tone: "info" });
                            }
                          }}
                        />
                      </div>
                    }
                  />
                  <div className="px-5 pb-5">
                    {t.memberIds.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {t.memberIds.map((id) => (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--c-surface-soft))] py-1 pl-3 pr-1.5 text-[12.5px] font-medium text-ink"
                          >
                            {nameOf(id)}
                            <button
                              onClick={() => teamStore.unassign(id)}
                              aria-label={`Remove ${nameOf(id)} from ${t.name}`}
                              className="grid size-5 place-items-center rounded-full text-faint transition-colors hover:bg-critical-050 hover:text-critical"
                            >
                              <UserMinus className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12.5px] text-muted">
                        No players yet. This team is excluded from the table until it has some.
                      </p>
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <Card>
                <EmptyState title="No teams" description="Create the first team to get started." />
              </Card>
            )}
          </div>

          <Card className="xl:col-span-4">
            <CardHeader
              title="Unassigned"
              subtitle={`${unassigned.length} approved player${unassigned.length === 1 ? "" : "s"}`}
              icon={<Users className="size-4.5" />}
            />
            <div className="max-h-[420px] space-y-1 overflow-y-auto px-4 pb-4 scroll-slim">
              {unassigned.length ? (
                unassigned.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {r.fullName}
                    </span>
                    {teams.length ? (
                      <Select
                        className="w-[130px]"
                        value=""
                        onChange={(e) =>
                          e.target.value && teamStore.assign(event.id, e.target.value, r.id)
                        }
                      >
                        <option value="">Assign…</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.shortName}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="px-1 py-3 text-[12.5px] text-muted">
                  Every approved player is on a team.
                </p>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Rules ---------------------------------------------------------------- */}
      {tab === "rules" ? (
        <Card className="mt-4">
          <CardHeader title="Scoring rules" subtitle="Applied to every team figure on this page" icon={<TrendingUp className="size-4.5" />} />
          <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
            <Field label="Points for a win">
              <Input
                type="number"
                step="0.5"
                className="num"
                value={rules.winPoints}
                onChange={(e) =>
                  teamStore.setRules(event.id, { winPoints: Math.max(0, Number(e.target.value)) })
                }
              />
            </Field>

            <Field label="Points for a draw">
              <Input
                type="number"
                step="0.5"
                className="num"
                value={rules.drawPoints}
                onChange={(e) =>
                  teamStore.setRules(event.id, { drawPoints: Math.max(0, Number(e.target.value)) })
                }
              />
            </Field>

            <Field
              label="Spread cap per game"
              hint="0 leaves spread uncapped. A cap stops one blowout deciding the event."
            >
              <Input
                type="number"
                className="num"
                value={rules.spreadCapPerGame}
                onChange={(e) =>
                  teamStore.setRules(event.id, {
                    spreadCapPerGame: Math.max(0, Number(e.target.value)),
                  })
                }
              />
            </Field>

            <div className="flex items-start">
              <Toggle
                checked={rules.spreadBeforeHeadToHead}
                onChange={(v) => teamStore.setRules(event.id, { spreadBeforeHeadToHead: v })}
                label="Break ties on spread first"
                description="Off means head-to-head decides tied teams before spread."
              />
            </div>

            <p className="md:col-span-2 rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
              Changing these recomputes the table immediately from the same verified games — no
              stored team score is ever edited. Games between two members of the same team are
              excluded, and unverified boards contribute nothing until they are settled.
            </p>
          </div>
        </Card>
      ) : null}

      <CreateTeamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={(name, shortName) => {
          teamStore.createTeam({ eventId: event.id, name, shortName });
          app.toast({ title: "Team created", description: name, tone: "success" });
          setCreateOpen(false);
        }}
      />

      <AssignModal
        team={teams.find((t) => t.id === assigning) ?? null}
        candidates={registrations
          .filter((r) => r.status === "approved")
          .map((r) => ({
            id: r.id,
            name: r.fullName,
            currentTeam: teams.find((t) => t.memberIds.includes(r.id))?.shortName,
          }))}
        onClose={() => setAssigning(null)}
        onAssign={(playerId) => assigning && teamStore.assign(event.id, assigning, playerId)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateTeamModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, shortName: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [shortName, setShortName] = React.useState("");

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setName("");
      setShortName("");
    }
  }

  const valid = name.trim().length > 1 && shortName.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New team"
      subtitle="A school, club or side. Players are assigned afterwards."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onSave(name.trim(), shortName.trim().toUpperCase())}
          >
            Create team
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Name" required>
          <Input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              // Suggest initials until the director types their own.
              if (!shortName)
                setShortName(
                  e.target.value
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 4)
                    .toUpperCase(),
                );
            }}
            placeholder="e.g. Lahore Grammar School"
          />
        </Field>
        <Field label="Short name" required hint="Shown on boards and the venue display.">
          <Input
            value={shortName}
            onChange={(e) => setShortName(e.target.value.toUpperCase())}
            placeholder="LGS"
            className="num uppercase"
            maxLength={5}
          />
        </Field>
      </div>
    </Modal>
  );
}

function AssignModal({
  team,
  candidates,
  onClose,
  onAssign,
}: {
  team: { id: string; name: string; memberIds: string[] } | null;
  candidates: { id: string; name: string; currentTeam?: string }[];
  onClose: () => void;
  onAssign: (playerId: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  const [lastId, setLastId] = React.useState<string | null>(null);
  if (team && team.id !== lastId) {
    setLastId(team.id);
    setQuery("");
  }
  if (!team && lastId !== null) setLastId(null);

  const shown = candidates.filter((c) =>
    query.trim() ? c.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  return (
    <Modal
      open={!!team}
      onClose={onClose}
      title={team ? `Add players to ${team.name}` : "Add players"}
      subtitle="Assigning a player moves them off any other team."
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Search">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Player name" />
        </Field>

        <div className="max-h-[320px] space-y-1 overflow-y-auto scroll-slim">
          {shown.map((c) => {
            const onThisTeam = team?.memberIds.includes(c.id);
            return (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3 py-2",
                  onThisTeam ? "bg-success-050" : "bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{c.name}</span>
                  {c.currentTeam && !onThisTeam ? (
                    <span className="block text-[11px] text-muted">Currently {c.currentTeam}</span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant={onThisTeam ? "ghost" : "secondary"}
                  disabled={onThisTeam}
                  onClick={() => onAssign(c.id)}
                >
                  {onThisTeam ? "On team" : c.currentTeam ? "Move here" : "Add"}
                </Button>
              </div>
            );
          })}
          {!shown.length ? (
            <p className="px-1 py-3 text-[12.5px] text-muted">No players match that search.</p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
