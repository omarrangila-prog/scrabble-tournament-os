"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  History,
  Info,
  Layers,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Tabs,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useIdentityStore } from "@/lib/store/useIdentityStore";
import { buildEvidence, evaluatePlayer } from "@/lib/engine/category";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CategoryRecommendation,
  PlayerCategory,
  ageOn,
  categoryEligibility,
} from "@/lib/domain/identity";
import { cn, formatDateTime } from "@/lib/utils";

const CATEGORY_COLOR: Record<PlayerCategory, string> = {
  novice: "#F5A94A",
  recreational: "#32C997",
  advanced: "#4BA8FF",
  masters: "#6D5DFB",
};

export default function CategoriesPage() {
  const store = useStore();
  const identity = useIdentityStore();
  const { players, pairings } = store;

  const [tab, setTab] = React.useState("recommendations");
  const [query, setQuery] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [moveTarget, setMoveTarget] = React.useState<string | null>(null);

  const open = identity.recommendations.filter((r) => r.status === "open");
  const decided = identity.recommendations.filter((r) => r.status !== "open");

  /* ---- Distribution --------------------------------------------------- */
  const distribution = CATEGORY_ORDER.map((c) => ({
    name: CATEGORY_LABEL[c],
    category: c,
    value: identity.identities.filter((i) => i.category === c).length,
    fill: CATEGORY_COLOR[c],
  }));

  /* ---- Run the review ------------------------------------------------- */
  const runReview = () => {
    setRunning(true);
    window.setTimeout(() => {
      const recs: CategoryRecommendation[] = [];

      for (const id of identity.identities) {
        const player = players.find((p) => p.playerId === id.playerId);
        if (!player) continue;

        // Inactivity is modelled from the gap since the player's last event.
        const eventsInactive =
          player.checkIn === "withdrawn" || player.checkIn === "absent"
            ? 16 + (player.seed % 8)
            : 0;

        const evidence = buildEvidence(
          player,
          pairings,
          players,
          id.category,
          id.dateOfBirth,
          eventsInactive,
        );
        const result = evaluatePlayer(evidence);
        if (!result) continue;

        recs.push({
          ...result,
          id: `rec-${id.playerId}-${result.proposed}`,
          status: "open",
          createdAt: new Date().toISOString(),
        });
      }

      identity.setRecommendations(recs);
      setRunning(false);
      store.toast({
        title: "Category review complete",
        description:
          recs.length === 0
            ? "No category changes are recommended at this time."
            : `${recs.length} recommendation${recs.length === 1 ? "" : "s"} generated for your review.`,
        tone: recs.length === 0 ? "success" : "info",
      });
    }, 700);
  };

  const decide = (
    rec: CategoryRecommendation,
    decision: "approved" | "rejected" | "postponed",
    note?: string,
  ) => {
    if (!store.requireCapability("players.edit")) return;
    const by = store.currentUser?.name ?? "Demo user";

    if (decision === "approved") {
      const result = identity.changeCategory(rec.playerId, rec.proposed, rec.rationale, by, {
        kind: rec.kind,
        recommendationId: rec.id,
      });
      if (!result.ok) {
        store.toast({ title: "Change not applied", description: result.message, tone: "warning" });
        return;
      }
      store.logAudit({
        user: by,
        role: store.role,
        action: rec.kind === "promotion" ? "Category promotion approved" : "Category demotion approved",
        target: rec.playerId,
        previousValue: CATEGORY_LABEL[rec.current],
        newValue: CATEGORY_LABEL[rec.proposed],
        reason: rec.rationale,
        device: "Desktop · Chrome",
      });
    }

    identity.decideRecommendation(rec.id, decision, by, note);
    store.toast({
      title:
        decision === "approved"
          ? `${rec.playerName} moved to ${CATEGORY_LABEL[rec.proposed]}`
          : decision === "rejected"
            ? "Recommendation rejected"
            : "Recommendation postponed",
      description:
        decision === "approved"
          ? "The change was recorded in the player's permanent category ledger."
          : "The recommendation was kept on record with your decision.",
      tone: decision === "approved" ? "success" : "info",
    });
  };

  const ledger = identity.ledger
    .filter((l) => {
      const q = query.trim().toLowerCase();
      return !q || l.playerId.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q);
    })
    .slice(0, 60);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Category Management"
        badge={<Badge tone={open.length ? "warning" : "success"} dot>{open.length} open recommendation{open.length === 1 ? "" : "s"}</Badge>}
        subtitle="The system reviews results and inactivity, then recommends. Category changes are always confirmed by a person."
        actions={
          <Button variant="primary" icon={<RefreshCw className="size-4" />} loading={running} onClick={runReview}>
            Run category review
          </Button>
        }
      />

      {/* Distribution */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader title="Category distribution" subtitle={`${identity.identities.length} registered identities`} icon={<Layers className="size-4.5" />} />
          <div className="h-48 px-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribution} dataKey="value" innerRadius={42} outerRadius={70} paddingAngle={3} stroke="none">
                  {distribution.map((d) => (
                    <Cell key={d.category} fill={d.fill} />
                  ))}
                </Pie>
                <RTooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.9)", background: "rgba(255,255,255,0.97)", fontSize: 12 }}
                  formatter={(v, n) => [`${v} players`, String(n)] as [string, string]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-5 pb-5">
            {distribution.map((d) => (
              <div key={d.category} className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[12px] text-ink">
                  <span className="size-2 rounded-full" style={{ background: d.fill }} />
                  {d.name}
                </span>
                <span className="text-[12.5px] font-semibold text-ink num">{d.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader title="How categories are managed" subtitle="The rules applied during a review" icon={<Info className="size-4.5" />} />
          <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
            <RuleCard
              icon={<TrendingUp className="size-4" />}
              tone="success"
              title="Promotion"
              body="Recommended after at least 3 events with a 65%+ win rate and a positive average spread, weighed against opponent strength."
            />
            <RuleCard
              icon={<TrendingDown className="size-4" />}
              tone="warning"
              title="Demotion on results"
              body="Recommended after 4+ events with a win rate at or below 30% and a consistently large negative spread."
            />
            <RuleCard
              icon={<Clock className="size-4" />}
              tone="info"
              title="Inactivity"
              body="A Masters player inactive for 15 events, or an Advanced player for 20, is recommended for the category below."
            />
            <RuleCard
              icon={<ShieldAlert className="size-4" />}
              tone="critical"
              title="Novice protection"
              body="Novice is for beginners aged 6–18. A player is never moved into it for poor results or inactivity alone."
            />
          </div>
        </Card>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs
          tabs={[
            { id: "recommendations", label: "Recommendations", count: open.length },
            { id: "decided", label: "Decisions", count: decided.length },
            { id: "ledger", label: "Category ledger", count: identity.ledger.length },
            { id: "players", label: "All players", count: identity.identities.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "ledger" || tab === "players" ? (
          <SearchInput value={query} onChange={setQuery} placeholder="Player ID or reason" className="sm:ml-auto sm:max-w-xs" />
        ) : null}
      </div>

      {/* Recommendations */}
      {tab === "recommendations" ? (
        open.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CheckCircle2 className="size-5" />}
              title="No open recommendations"
              description="Run a category review to analyse every player's results, spread and activity against the current rules."
              action={
                <Button variant="primary" loading={running} onClick={runReview}>
                  Run category review
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {open.map((rec, i) => (
              <RecommendationCard key={rec.id} rec={rec} index={i} onDecide={decide} />
            ))}
          </div>
        )
      ) : null}

      {/* Decisions */}
      {tab === "decided" ? (
        decided.length === 0 ? (
          <Card>
            <EmptyState title="No decisions recorded yet" description="Approved, rejected and postponed recommendations appear here." />
          </Card>
        ) : (
          <Card>
            <div className="px-3 py-3">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Player</Th>
                    <Th className="w-32">Change</Th>
                    <Th className="w-28">Decision</Th>
                    <Th className="w-36">Decided by</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {decided.map((r) => (
                    <tr key={r.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                      <Td className="font-medium">{r.playerName}</Td>
                      <Td className="capitalize">{CATEGORY_LABEL[r.current]} → {CATEGORY_LABEL[r.proposed]}</Td>
                      <Td>
                        <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "critical" : "warning"} dot>
                          {r.status}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{r.decidedBy ?? "—"}</Td>
                      <Td className="text-muted">{r.decisionNote ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>
        )
      ) : null}

      {/* Ledger */}
      {tab === "ledger" ? (
        <Card>
          <CardHeader title="Category ledger" subtitle="Every category decision ever recorded. Entries are never edited or deleted." icon={<History className="size-4.5" />} />
          <div className="px-3 pb-4">
            <TableWrap className="max-h-[62vh]">
              <thead>
                <tr>
                  <Th className="w-40">Date and time</Th>
                  <Th className="w-24">Player ID</Th>
                  <Th className="w-32">Change</Th>
                  <Th className="w-28">Type</Th>
                  <Th className="w-36">Decided by</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                    <Td className="whitespace-nowrap">{formatDateTime(l.at)}</Td>
                    <Td className="num font-medium">{l.playerId}</Td>
                    <Td className="capitalize">
                      {l.from ? `${CATEGORY_LABEL[l.from]} → ` : ""}
                      {CATEGORY_LABEL[l.to]}
                    </Td>
                    <Td>
                      <Badge tone={l.kind === "promotion" ? "success" : l.kind === "demotion" ? "warning" : "neutral"}>
                        {l.kind}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{l.decidedBy}</Td>
                    <Td className="text-muted">{l.reason}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </Card>
      ) : null}

      {/* All players */}
      {tab === "players" ? (
        <Card>
          <CardHeader title="Player categories" subtitle="Current category for every registered identity" />
          <div className="px-3 pb-4">
            <TableWrap className="max-h-[62vh]">
              <thead>
                <tr>
                  <Th>Player</Th>
                  <Th className="w-24">Player ID</Th>
                  <Th className="w-28">Category</Th>
                  <Th className="w-20">Age</Th>
                  <Th className="w-28">Verified</Th>
                  <Th className="w-32">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {identity.identities
                  .filter((i) => {
                    const q = query.trim().toLowerCase();
                    return !q || i.playerId.toLowerCase().includes(q) || `${i.firstName} ${i.lastName}`.toLowerCase().includes(q);
                  })
                  .slice(0, 80)
                  .map((i) => {
                    const p = players.find((x) => x.playerId === i.playerId);
                    return (
                      <tr key={i.playerId} className="hover:bg-[rgb(var(--c-surface-soft))]">
                        <Td>
                          <span className="flex items-center gap-2.5">
                            <Avatar initials={p?.initials ?? i.firstName[0]} hue={p?.avatarHue ?? 220} size={28} />
                            <span className="truncate text-[13px] font-medium text-ink">
                              {i.firstName} {i.lastName}
                            </span>
                          </span>
                        </Td>
                        <Td className="num text-muted">{i.playerId}</Td>
                        <Td>
                          <Badge tone="neutral">{CATEGORY_LABEL[i.category]}</Badge>
                        </Td>
                        <Td className="num">{ageOn(i.dateOfBirth)}</Td>
                        <Td>
                          {i.verified ? (
                            <span className="inline-flex items-center gap-1 text-[12px] text-success">
                              <BadgeCheck className="size-3.5" />
                              Verified
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted">Pending</span>
                          )}
                        </Td>
                        <Td>
                          <Button size="sm" variant="ghost" onClick={() => setMoveTarget(i.playerId)}>
                            Change category
                          </Button>
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </TableWrap>
          </div>
        </Card>
      ) : null}

      <ManualChangeModal playerId={moveTarget} onClose={() => setMoveTarget(null)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RecommendationCard({
  rec,
  index,
  onDecide,
}: {
  rec: CategoryRecommendation;
  index: number;
  onDecide: (r: CategoryRecommendation, d: "approved" | "rejected" | "postponed", note?: string) => void;
}) {
  const blocked = !!rec.blockedBy;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className={cn("p-5", blocked && "border-warning/30")}>
        <div className="flex flex-wrap items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-control",
              blocked
                ? "bg-warning-050 text-[#b4741f]"
                : rec.kind === "promotion"
                  ? "bg-success-050 text-[#1b8f68]"
                  : "bg-warning-050 text-[#b4741f]",
            )}
          >
            {blocked ? <Ban className="size-5" /> : rec.kind === "promotion" ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold text-ink">{rec.playerName}</p>
              <Badge tone="neutral" className="num">{rec.playerId}</Badge>
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
                {CATEGORY_LABEL[rec.current]}
                <ArrowRight className="size-3.5" />
                <span className={cn(rec.kind === "promotion" ? "text-success" : "text-warning")}>
                  {CATEGORY_LABEL[rec.proposed]}
                </span>
              </span>
              {blocked ? <Badge tone="warning" dot>Blocked by rule</Badge> : null}
            </div>

            <p className="mt-2 text-[13px] leading-relaxed text-ink">{rec.rationale}</p>

            {blocked ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-control bg-warning-050/70 px-3 py-2.5 text-[12px] leading-relaxed text-[#b4741f]">
                <ShieldAlert className="mt-px size-3.5 shrink-0" />
                {rec.blockedBy}
              </p>
            ) : null}

            {/* Factors */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rec.factors.map((f) => (
                <span
                  key={f.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px]",
                    f.supports ? "bg-success-050 text-[#1b8f68]" : "bg-[rgb(var(--c-line))] text-muted",
                  )}
                >
                  {f.label}: <span className="font-semibold num">{f.value}</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-050 px-2.5 py-1 text-[11.5px] text-primary-600">
                Confidence <span className="font-semibold num">{Math.round(rec.confidence)}%</span>
              </span>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="primary"
                disabled={blocked}
                onClick={() => onDecide(rec, "approved")}
                icon={<CheckCircle2 className="size-3.5" />}
              >
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onDecide(rec, "rejected", "Rejected by the Tournament Director.")}>
                Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDecide(rec, "postponed", "Deferred to the next review.")}>
                Postpone
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[11.5px] leading-relaxed text-faint">
          <Info className="mt-px size-3 shrink-0" />
          Recommendation only. No category changes until the Tournament Director approves, and
          every decision is written to the player&apos;s permanent ledger.
        </p>
      </Card>
    </motion.div>
  );
}

function RuleCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: React.ReactNode;
  tone: "success" | "warning" | "info" | "critical";
  title: string;
  body: string;
}) {
  return (
    <div
      className={cn(
        "rounded-compact p-3.5",
        tone === "success" && "bg-success-050/55",
        tone === "warning" && "bg-warning-050/55",
        tone === "info" && "bg-secondary-050/55",
        tone === "critical" && "bg-critical-050/45",
      )}
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span
          className={cn(
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "info" && "text-secondary",
            tone === "critical" && "text-critical",
          )}
        >
          {icon}
        </span>
        {title}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function ManualChangeModal({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const store = useStore();
  const identity = useIdentityStore();
  const [to, setTo] = React.useState<PlayerCategory>("recreational");
  const [reason, setReason] = React.useState("");
  const [override, setOverride] = React.useState(false);

  const record = playerId ? identity.identities.find((i) => i.playerId === playerId) : undefined;

  const [last, setLast] = React.useState(playerId);
  if (last !== playerId) {
    setLast(playerId);
    setReason("");
    setOverride(false);
    if (record) setTo(record.category);
  }

  if (!playerId || !record) return null;

  const check = categoryEligibility(to, record.dateOfBirth);
  const blocked = !check.eligible && !override;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Change category — ${record.firstName} ${record.lastName}`}
      subtitle={`${record.playerId} · currently ${CATEGORY_LABEL[record.category]}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={blocked || !reason.trim() || to === record.category}
            onClick={() => {
              const by = store.currentUser?.name ?? "Demo user";
              const result = identity.changeCategory(record.playerId, to, reason, by, {
                kind: "correction",
                override,
              });
              store.toast({
                title: result.ok ? "Category updated" : "Change not applied",
                description: result.message,
                tone: result.ok ? "success" : "warning",
              });
              if (result.ok) {
                store.logAudit({
                  user: by,
                  role: store.role,
                  action: "Category changed manually",
                  target: record.playerId,
                  previousValue: CATEGORY_LABEL[record.category],
                  newValue: CATEGORY_LABEL[to],
                  reason,
                  device: "Desktop · Chrome",
                });
                onClose();
              }
            }}
          >
            Apply change
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="New category" required>
          <Select value={to} onChange={(e) => setTo(e.target.value as PlayerCategory)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </Select>
        </Field>

        {!check.eligible ? (
          <div className="rounded-control bg-warning-050/70 px-3.5 py-3">
            <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-[#b4741f]">
              <ShieldAlert className="mt-px size-3.5 shrink-0" />
              {check.reason}
            </p>
            {check.overridable ? (
              <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  className="size-4 accent-[#6D5DFB]"
                />
                Record an administrator exception and apply anyway
              </label>
            ) : null}
          </div>
        ) : null}

        <Field label="Reason" required hint="Written to the permanent category ledger and the audit log.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Player requested a move after returning from a three-year break." />
        </Field>
      </div>
    </Modal>
  );
}
