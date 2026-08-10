"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Info,
  Layers,
  Lightbulb,
  Lock,
  LockOpen,
  RotateCcw,
  Undo2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { DivisionId, Player } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { SeedListPanel } from "@/components/seeding/SeedListPanel";
import { Tabs } from "@/components/ui";

const ACCENT: Record<string, string> = {
  masters: "#6D5DFB",
  open: "#4BA8FF",
  "recreational": "#32C997",
  "beginner": "#F5A94A",
};

export default function SeedingPage() {
  const store = useStore();
  const { players, divisions } = store;

  const [query, setQuery] = React.useState("");
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState<Set<string>>(new Set());
  const [history, setHistory] = React.useState<{ label: string; undo: () => void }[]>([]);
  const [moveTarget, setMoveTarget] = React.useState<Player | null>(null);
  const [recommendations, setRecommendations] = React.useState<Recommendation[] | null>(null);
  const [view, setView] = React.useState("seedlist");

  const byDivision = (id: DivisionId) =>
    players
      .filter((p) => p.division === id)
      .sort((a, b) => a.seed - b.seed)
      .filter((p) => {
        const q = query.trim().toLowerCase();
        return !q || p.fullName.toLowerCase().includes(q) || p.playerId.toLowerCase().includes(q);
      });

  const stats = divisions.map((d) => {
    const pool = players.filter((p) => p.division === d.id);
    const rated = pool.filter((p) => p.rating > 0);
    const ratings = rated.map((p) => p.rating);
    return {
      id: d.id,
      name: d.name,
      short: d.shortName,
      count: pool.length,
      average: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0,
      highest: ratings.length ? Math.max(...ratings) : 0,
      lowest: ratings.length ? Math.min(...ratings) : 0,
      unrated: pool.length - rated.length,
      // Spread of ratings inside the division — a proxy for balance.
      balance: ratings.length ? Math.max(...ratings) - Math.min(...ratings) : 0,
    };
  });

  const move = (player: Player, target: DivisionId) => {
    if (locked.has(player.id)) {
      store.toast({
        title: "Seed is locked",
        description: `${player.fullName}'s seeding position is locked. Unlock it before moving the player.`,
        tone: "warning",
      });
      return;
    }
    if (!store.requireCapability("seeding.edit")) return;

    const from = player.division;
    const division = divisions.find((d) => d.id === target);

    // Age/category validation — youth divisions have an upper age band only.
    if (division?.maxAge && (from === "masters" || from === "advanced")) {
      store.toast({
        title: "Category check",
        description: `${player.fullName} is registered in an adult division. Confirm eligibility before moving them to ${division.name}.`,
        tone: "warning",
      });
    }
    // Rating-range warning.
    if (division && player.rating > 0 && (player.rating < division.ratingFloor || player.rating > division.ratingCeiling)) {
      store.toast({
        title: "Rating outside the division band",
        description: `${player.fullName} (${player.rating}) sits outside the ${division.name} band of ${division.ratingFloor}–${division.ratingCeiling}. The move was still applied.`,
        tone: "warning",
      });
    }

    store.movePlayerDivision(player.id, target);
    setHistory((h) => [
      { label: `${player.fullName}: ${from} → ${target}`, undo: () => store.movePlayerDivision(player.id, from) },
      ...h,
    ]);
    store.toast({
      title: "Division changed",
      description: `${player.fullName} moved to ${division?.name}. The change is recorded in the audit log.`,
      tone: "success",
    });
  };

  const autoSeed = () => {
    if (!store.requireCapability("seeding.edit")) return;
    const before = players.map((p) => ({ id: p.id, seed: p.seed }));
    for (const d of divisions) {
      players
        .filter((p) => p.division === d.id)
        .sort((a, b) => (b.rating || -1) - (a.rating || -1))
        .forEach((p, i) => {
          if (!locked.has(p.id)) store.setSeed(p.id, i + 1);
        });
    }
    setHistory((h) => [
      {
        label: "Automatic seeding by rating",
        undo: () => before.forEach((b) => store.setSeed(b.id, b.seed)),
      },
      ...h,
    ]);
    store.toast({
      title: "Seeding recalculated",
      description: "Players were re-seeded by rating. Locked positions were preserved.",
      tone: "success",
    });
  };

  const optimize = () => {
    setRecommendations(buildRecommendations(players, stats));
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Divisions & Seeding"
        badge={<Badge tone="primary">{divisions.length} divisions</Badge>}
        subtitle="Drag a player onto another division, or adjust seeds directly. Every change is reversible before the tournament starts."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Undo2 className="size-4" />}
              disabled={history.length === 0}
              onClick={() => {
                const last = history[0];
                if (!last) return;
                last.undo();
                setHistory((h) => h.slice(1));
                store.toast({ title: "Change undone", description: last.label, tone: "info" });
              }}
            >
              Undo
            </Button>
            <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={autoSeed}>
              Auto-seed by rating
            </Button>
            <Button variant="primary" icon={<Lightbulb className="size-4" />} onClick={optimize}>
              Optimize Seeding
            </Button>
          </>
        }
      />

      {/* Distribution ---------------------------------------------------- */}
      <Tabs
        tabs={[
          { id: "seedlist", label: "Seed List" },
          { id: "board", label: "Division Board" },
        ]}
        value={view}
        onChange={setView}
        className="mb-4"
      />

      {view === "seedlist" ? <SeedListPanel /> : null}

      {view === "board" ? (
        <>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Division distribution"
            subtitle="Player count and rating band per division"
            icon={<Layers className="size-4.5" />}
          />
          <div className="h-56 px-4 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,22,43,0.07)" vertical={false} />
                <XAxis dataKey="short" tick={{ fontSize: 12, fill: "#667085" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                <RTooltip
                  cursor={{ fill: "rgba(109,93,251,0.06)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.9)",
                    background: "rgba(255,255,255,0.97)",
                    fontSize: 12,
                  }}
                  formatter={(v) => [`${v} players`, "Registered"] as [string, string]}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {stats.map((s) => (
                    <Cell key={s.id} fill={ACCENT[s.id] ?? "#6D5DFB"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Rating balance" subtitle="Average, highest and lowest per division" />
          <div className="space-y-2 px-5 pb-5">
            {stats.map((s) => (
              <div key={s.id} className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <span className="size-2 rounded-full" style={{ background: ACCENT[s.id] }} />
                    {s.name}
                  </span>
                  <span className="text-[12px] text-muted num">{s.count} players</span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[13px] font-semibold text-ink num">{s.average || "—"}</p>
                    <p className="text-[10.5px] text-muted">Average</p>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-ink num">{s.highest || "—"}</p>
                    <p className="text-[10.5px] text-muted">Highest</p>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-ink num">{s.lowest || "—"}</p>
                    <p className="text-[10.5px] text-muted">Lowest</p>
                  </div>
                </div>
                {s.unrated > 0 ? (
                  <p className="mt-1.5 text-[11.5px] text-[#b4741f]">
                    {s.unrated} unrated player{s.unrated === 1 ? "" : "s"} seeded at the foot of the division.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Find a player across all divisions"
          className="max-w-sm"
        />
      </div>

      {/* Division columns ------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {divisions.map((d) => {
          const pool = byDivision(d.id);
          return (
            <Card
              key={d.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragging) return;
                const player = players.find((p) => p.id === dragging);
                if (player && player.division !== d.id) move(player, d.id);
                setDragging(null);
              }}
              className={cn(
                "transition-colors",
                dragging ? "ring-2 ring-primary/40" : "",
              )}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: ACCENT[d.id] }} />
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink">{d.name}</p>
                    <p className="text-[11.5px] text-muted num">
                      {pool.length} players · {d.ratingFloor}–{d.ratingCeiling}
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-h-[520px] space-y-1 overflow-y-auto p-2.5 scroll-slim">
                {pool.length === 0 ? (
                  <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-6 text-center text-[12.5px] text-muted">
                    No players in this division.
                  </p>
                ) : (
                  pool.map((p) => (
                    <div
                      key={p.id}
                      draggable={!locked.has(p.id)}
                      onDragStart={() => setDragging(p.id)}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "group flex items-center gap-2 rounded-control border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] px-2.5 py-1.5",
                        locked.has(p.id) ? "cursor-not-allowed opacity-80" : "cursor-grab active:cursor-grabbing hover:bg-[rgb(var(--c-surface-strong))]",
                        dragging === p.id && "opacity-40",
                      )}
                    >
                      <span className="w-6 shrink-0 text-center text-[12px] font-semibold text-muted num">
                        {p.seed}
                      </span>
                      <Avatar initials={p.initials} hue={p.avatarHue} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">
                          {p.fullName}
                        </span>
                        <span className="block truncate text-[11px] text-muted num">
                          {p.rating || "Unrated"}
                        </span>
                      </span>
                      <button
                        onClick={() =>
                          setLocked((s) => {
                            const next = new Set(s);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          })
                        }
                        aria-label={locked.has(p.id) ? "Unlock seed" : "Lock seed"}
                        className="shrink-0 rounded-md p-1 text-faint hover:bg-[rgb(var(--c-line))] hover:text-ink"
                      >
                        {locked.has(p.id) ? (
                          <Lock className="size-3.5 text-primary" />
                        ) : (
                          <LockOpen className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </button>
                      <button
                        onClick={() => setMoveTarget(p)}
                        aria-label="Move player"
                        className="shrink-0 rounded-md p-1 text-faint opacity-0 transition-opacity hover:bg-[rgb(var(--c-line))] hover:text-ink group-hover:opacity-100"
                      >
                        <ArrowRightLeft className="size-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Seeding history -------------------------------------------------- */}
      {history.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Seeding history" subtitle="Most recent changes in this session" />
          <ul className="space-y-1 px-5 pb-5">
            {history.slice(0, 6).map((h, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2 text-[12.5px]"
              >
                <span className="capitalize text-ink">{h.label.replace(/-/g, " ")}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    h.undo();
                    setHistory((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                >
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

        </>
      ) : null}

      <MovePlayerModal player={moveTarget} onClose={() => setMoveTarget(null)} onMove={move} />
      <RecommendationsModal
        recommendations={recommendations}
        onClose={() => setRecommendations(null)}
        onAccept={(r) => {
          const player = players.find((p) => p.id === r.playerId);
          if (player) move(player, r.toDivision);
          setRecommendations(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface Recommendation {
  playerId: string;
  playerName: string;
  fromDivision: DivisionId;
  toDivision: DivisionId;
  rationale: string;
}

/** Suggests moves that improve rating balance. Nothing is applied automatically. */
function buildRecommendations(
  players: Player[],
  stats: { id: DivisionId; name: string; average: number; balance: number }[],
): Recommendation[] {
  const out: Recommendation[] = [];
  const byId = new Map(stats.map((s) => [s.id, s]));

  // A player rated well above their division average is a candidate to move up.
  const order: DivisionId[] = ["beginner", "recreational", "advanced", "masters"];
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i];
    const to = order[i + 1];
    const fromStats = byId.get(from);
    const toStats = byId.get(to);
    if (!fromStats || !toStats) continue;

    const candidate = players
      .filter((p) => p.division === from && p.rating > 0)
      .sort((a, b) => b.rating - a.rating)[0];

    if (candidate && candidate.rating > fromStats.average + 220) {
      out.push({
        playerId: candidate.id,
        playerName: candidate.fullName,
        fromDivision: from,
        toDivision: to,
        rationale: `${candidate.fullName} is rated ${candidate.rating}, which is ${
          candidate.rating - fromStats.average
        } points above the ${fromStats.name} average. Moving them to ${toStats.name} would improve rating balance in both divisions.`,
      });
    }
  }

  return out;
}

function RecommendationsModal({
  recommendations,
  onClose,
  onAccept,
}: {
  recommendations: Recommendation[] | null;
  onClose: () => void;
  onAccept: (r: Recommendation) => void;
}) {
  if (!recommendations) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Seeding recommendations"
      subtitle="Suggestions only — nothing has been changed."
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-control bg-secondary-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#2b7fd4]">
          <Info className="mt-px size-4 shrink-0" />
          These are recommendations for review. The final decision remains with the Tournament
          Director.
        </p>

        {recommendations.length === 0 ? (
          <div className="rounded-compact bg-success-050/60 p-5 text-center">
            <p className="text-[14px] font-medium text-ink">Divisions are already well balanced</p>
            <p className="mt-1 text-[12.5px] text-muted">
              No player is significantly outside their division&apos;s rating band.
            </p>
          </div>
        ) : (
          recommendations.map((r) => (
            <div key={r.playerId} className="rounded-compact border border-warning/30 bg-warning-050/40 p-3.5">
              <p className="text-[13.5px] font-semibold text-ink">
                Move {r.playerName} from {r.fromDivision.replace(/-/g, " ")} to{" "}
                {r.toDivision.replace(/-/g, " ")}?
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{r.rationale}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" onClick={() => onAccept(r)}>
                  Accept recommendation
                </Button>
                <Button size="sm" variant="secondary" onClick={onClose}>
                  Ignore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    window.location.href = `/app/players?player=${r.playerId}`;
                  }}
                >
                  Review player
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function MovePlayerModal({
  player,
  onClose,
  onMove,
}: {
  player: Player | null;
  onClose: () => void;
  onMove: (p: Player, target: DivisionId) => void;
}) {
  const divisions = useStore((s) => s.divisions);
  const [target, setTarget] = React.useState<DivisionId>("advanced");
  const [reason, setReason] = React.useState("");

  const [lastPlayer, setLastPlayer] = React.useState(player);
  if (lastPlayer !== player) {
    setLastPlayer(player);
    if (player) setTarget(player.division);
    setReason("");
  }

  if (!player) return null;

  return (
    <Modal
      open={!!player}
      onClose={onClose}
      title={`Move ${player.fullName}`}
      subtitle={`Currently seeded ${player.seed} in ${player.division.replace(/-/g, " ")}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={target === player.division}
            onClick={() => {
              onMove(player, target);
              onClose();
            }}
          >
            Move player
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Destination division" required>
          <Select value={target} onChange={(e) => setTarget(e.target.value as DivisionId)}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.ratingFloor}–{d.ratingCeiling})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" hint="Recorded in the audit log.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
