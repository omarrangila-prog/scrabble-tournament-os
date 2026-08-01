"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileText,
  Gavel,
  Info,
  Plus,
  Shield,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { Dispute, DisputeCategory, DisputeStatus } from "@/lib/domain/types";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

const CATEGORY_LABEL: Record<DisputeCategory, string> = {
  score: "Score dispute",
  challenge: "Challenge dispute",
  time: "Time issue",
  conduct: "Player conduct",
  equipment: "Equipment issue",
  pairing: "Incorrect pairing",
  "late-arrival": "Late arrival",
  correction: "Result correction",
  appeal: "Appeal",
  other: "Other",
};

const WORKFLOW: DisputeStatus[] = ["open", "reviewing", "decision", "notified", "appeal", "closed"];

const WORKFLOW_LABEL: Record<DisputeStatus, string> = {
  open: "Open",
  reviewing: "Reviewing Evidence",
  decision: "Director Decision",
  notified: "Player Notification",
  appeal: "Appeal",
  closed: "Closed",
};

/** Searchable rulebook. Guidance only — never an automatic penalty. */
const RULEBOOK = [
  { ref: "Rule 2.6", title: "Late arrival", body: "A player who arrives after the round has begun plays with the time already elapsed. After 15 minutes the game may be forfeited at the Tournament Director's discretion." },
  { ref: "Rule 4.1", title: "Clock management", body: "If a clock is not started correctly, the Director reconstructs the elapsed time from the floor log and restores it equally to both players." },
  { ref: "Rule 5.2", title: "Challenges", body: "A challenged play that is found invalid is removed and the challenger's opponent loses their turn, subject to the challenge rule in force for the event." },
  { ref: "Rule 7.3", title: "Score reconciliation", body: "Where two submissions disagree, the signed paper result slip is the primary record. The Director may override both submissions and must record a reason." },
  { ref: "Rule 7.5", title: "Result corrections", body: "A verified result may be corrected only by the Director or an Arbiter, and only with a recorded reason. Standings are recalculated immediately." },
  { ref: "Rule 8.1", title: "Player conduct", body: "Persistent disruptive behaviour may result in a warning, a time penalty, or in serious cases removal from the tournament by the Director." },
  { ref: "Rule 9.4", title: "Appeals", body: "A player may appeal a ruling within 30 minutes of notification. The appeal is heard by the Director together with one arbiter not involved in the original decision." },
  { ref: "Rule 3.2", title: "Equipment", body: "Damaged or incomplete equipment must be replaced before play continues. Time lost is restored to both clocks." },
];

export default function ArbiterPage() {
  return (
    <React.Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-[rgb(var(--c-surface-soft))]" />}>
      <ArbiterView />
    </React.Suspense>
  );
}

function ArbiterView() {
  const params = useSearchParams();
  const store = useStore();
  const { disputes, players } = store;

  const [tab, setTab] = React.useState("open");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Dispute | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);

  // Deep link from search / Command Centre.
  const caseId = params.get("case");
  const [lastCase, setLastCase] = React.useState<string | null>(null);
  if (caseId && lastCase !== caseId) {
    setLastCase(caseId);
    const d = disputes.find((x) => x.id === caseId);
    if (d) setSelected(d);
  }

  const open = disputes.filter((d) => d.status !== "closed");
  const closed = disputes.filter((d) => d.status === "closed");
  const list = (tab === "open" ? open : tab === "closed" ? closed : disputes).filter((d) => {
    const q = query.trim().toLowerCase();
    return (
      !q ||
      d.caseNumber.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      CATEGORY_LABEL[d.category].toLowerCase().includes(q)
    );
  });

  const nameOf = (id: string) => players.find((p) => p.id === id)?.fullName ?? id;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Arbiter Desk"
        badge={<Badge tone={open.length ? "warning" : "success"} dot>{open.length} open</Badge>}
        subtitle="Dispute cases, evidence and rulings. Every decision is recorded against the arbiter who made it."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setNewOpen(true)}>
            Raise a case
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Tabs
              tabs={[
                { id: "open", label: "Open", count: open.length },
                { id: "closed", label: "Closed", count: closed.length },
                { id: "all", label: "All cases", count: disputes.length },
              ]}
              value={tab}
              onChange={setTab}
            />
            <SearchInput value={query} onChange={setQuery} placeholder="Case number or keyword" className="sm:ml-auto sm:max-w-xs" />
          </div>

          {list.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Gavel className="size-5" />}
                title="No cases in this view"
                description="Cases raised by scorekeepers, arbiters or players appear here."
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {list.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "glass block w-full rounded-compact p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(44,55,96,0.13)]",
                    d.priority === "high" && d.status !== "closed" && "border-critical/25",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-ink num">{d.caseNumber}</span>
                        <Badge tone="neutral">{CATEGORY_LABEL[d.category]}</Badge>
                        {d.priority === "high" ? <Badge tone="critical" dot>High priority</Badge> : null}
                      </div>
                      <p className="mt-1 text-[12.5px] text-muted">
                        Round {d.round} · Board {d.board} · {d.playerIds.map(nameOf).join(" and ")}
                      </p>
                    </div>
                    <Badge tone={d.status === "closed" ? "success" : d.status === "open" ? "warning" : "info"} dot>
                      {WORKFLOW_LABEL[d.status]}
                    </Badge>
                  </div>

                  <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink">{d.description}</p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
                    <span>Submitted by {d.submittedBy}</span>
                    <span>Arbiter: {d.assignedArbiter}</span>
                    <span>{formatTime(d.createdAt)}</span>
                    {d.ruleReference ? <span className="text-primary">{d.ruleReference}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="xl:col-span-1">
          <RulebookPanel />
        </div>
      </div>

      <CaseDrawer dispute={selected} onClose={() => setSelected(null)} />
      <NewCaseModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RulebookPanel() {
  const [query, setQuery] = React.useState("");
  const results = RULEBOOK.filter((r) => {
    const q = query.trim().toLowerCase();
    return !q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q) || r.ref.toLowerCase().includes(q);
  });

  return (
    <Card className="sticky top-20">
      <CardHeader
        title="Rulebook assistant"
        subtitle="Search the tournament rules"
        icon={<BookOpen className="size-4.5" />}
      />
      <div className="px-5 pb-5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search rules, e.g. late arrival" />

        <div className="mt-3 max-h-[440px] space-y-2 overflow-y-auto scroll-slim">
          {results.length === 0 ? (
            <p className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-4 text-center text-[12.5px] text-muted">
              No rule matches that search.
            </p>
          ) : (
            results.map((r) => (
              <div key={r.ref} className="rounded-control bg-[rgb(var(--c-surface))] p-3">
                <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                  <span className="rounded-full bg-primary-050 px-2 py-0.5 text-[11px] text-primary-600">
                    {r.ref}
                  </span>
                  {r.title}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{r.body}</p>
              </div>
            ))
          )}
        </div>

        <p className="mt-3 flex items-start gap-1.5 rounded-control bg-warning-050/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-[#b4741f]">
          <Shield className="mt-px size-3.5 shrink-0" />
          Guidance only. The Tournament Director makes the final ruling. Penalties are never issued
          automatically.
        </p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function CaseDrawer({ dispute, onClose }: { dispute: Dispute | null; onClose: () => void }) {
  const store = useStore();
  const { players } = store;
  const [decision, setDecision] = React.useState("");
  const [penalty, setPenalty] = React.useState("");

  const [lastDispute, setLastDispute] = React.useState(dispute);
  if (lastDispute !== dispute) {
    setLastDispute(dispute);
    setDecision(dispute?.decision ?? "");
    setPenalty(dispute?.penalty ?? "");
  }

  if (!dispute) return null;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.fullName ?? id;
  const stageIndex = WORKFLOW.indexOf(dispute.status);

  const advance = (to: DisputeStatus, entry: string) => {
    if (!store.requireCapability("disputes.manage")) return;
    store.updateDispute(dispute.id, { status: to }, entry);
    store.toast({ title: "Case updated", description: entry, tone: "success" });
  };

  return (
    <Drawer
      open={!!dispute}
      onClose={onClose}
      title={dispute.caseNumber}
      subtitle={`${CATEGORY_LABEL[dispute.category]} · Round ${dispute.round} · Board ${dispute.board}`}
      width="lg"
      footer={
        dispute.status !== "closed" ? (
          <div className="flex flex-wrap gap-2">
            {dispute.status === "open" ? (
              <Button variant="secondary" onClick={() => advance("reviewing", "Evidence review started.")}>
                Review evidence
              </Button>
            ) : null}
            {dispute.status === "reviewing" ? (
              <Button
                variant="primary"
                disabled={!decision.trim()}
                onClick={() => {
                  if (!store.requireCapability("disputes.rule")) return;
                  store.updateDispute(
                    dispute.id,
                    { status: "decision", decision, penalty: penalty || undefined },
                    `Decision issued: ${decision}`,
                  );
                  store.logAudit({
                    user: store.currentUser?.name ?? "Demo user",
                    role: store.role,
                    action: "Dispute ruling issued",
                    target: dispute.caseNumber,
                    newValue: decision,
                    reason: penalty || undefined,
                    device: "Desktop · Chrome",
                  });
                  store.toast({
                    title: "Ruling recorded",
                    description: "Both players will be notified of the decision.",
                    tone: "success",
                  });
                }}
              >
                Issue ruling
              </Button>
            ) : null}
            {dispute.status === "decision" ? (
              <Button variant="secondary" onClick={() => advance("notified", "Players notified of the decision.")}>
                Notify players
              </Button>
            ) : null}
            {dispute.status === "notified" ? (
              <>
                <Button variant="secondary" onClick={() => advance("appeal", "Player lodged an appeal.")}>
                  Record appeal
                </Button>
                <Button variant="success" onClick={() => advance("closed", "Case closed.")}>
                  Close case
                </Button>
              </>
            ) : null}
            {dispute.status === "appeal" ? (
              <Button variant="success" onClick={() => advance("closed", "Appeal heard and case closed.")}>
                Close case
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">This case is closed. The record is retained in the audit log.</p>
        )
      }
    >
      <div className="space-y-4">
        {/* Workflow */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Case workflow</p>
          <ol className="mt-2.5 space-y-1.5">
            {WORKFLOW.map((stage, i) => (
              <li key={stage} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold num",
                    i < stageIndex ? "bg-success text-white"
                      : i === stageIndex ? "bg-primary text-white"
                      : "bg-[rgb(var(--c-line))] text-muted",
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn("text-[12.5px]", i <= stageIndex ? "text-ink" : "text-faint")}>
                  {WORKFLOW_LABEL[stage]}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Details */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Case details</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <Row label="Players involved" value={dispute.playerIds.map(nameOf).join(", ")} />
            <Row label="Submitted by" value={dispute.submittedBy} />
            <Row label="Assigned arbiter" value={dispute.assignedArbiter} />
            <Row label="Priority" value={dispute.priority} />
            <Row label="Rule reference" value={dispute.ruleReference ?? "—"} />
            <Row label="Appeal allowed" value={dispute.appealAllowed ? "Yes" : "No"} />
          </dl>
          <p className="mt-3 rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
            {dispute.description}
          </p>
        </div>

        {/* Evidence */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Evidence</p>
          <ul className="mt-2 space-y-1.5">
            {dispute.evidence.map((e) => (
              <li key={e} className="flex items-center gap-2 rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2 text-[12.5px] text-ink">
                <FileText className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{e}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    store.toast({
                      title: "Evidence opened",
                      description: `${e} was opened for review.`,
                      tone: "info",
                    })
                  }
                >
                  View
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {/* Decision */}
        {dispute.status !== "closed" ? (
          <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
            <p className="text-[13px] font-semibold text-ink">Ruling</p>
            <div className="mt-2 space-y-3">
              <Field label="Decision" hint="Recorded against your name and role.">
                <Textarea rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Describe the ruling and the reasoning behind it." />
              </Field>
              <Field label="Penalty or correction" hint="Leave blank if no penalty applies.">
                <Input value={penalty} onChange={(e) => setPenalty(e.target.value)} placeholder="e.g. Score corrected to 498–472" />
              </Field>
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 rounded-control bg-secondary-050 px-3 py-2.5 text-[11.5px] leading-relaxed text-[#2b7fd4]">
              <Info className="mt-px size-3.5 shrink-0" />
              Guidance only. The Tournament Director makes the final ruling.
            </p>
          </div>
        ) : dispute.decision ? (
          <div className="rounded-compact bg-success-050/60 p-4">
            <p className="text-[13px] font-semibold text-ink">Final ruling</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink">{dispute.decision}</p>
            {dispute.penalty ? (
              <p className="mt-1.5 text-[12.5px] text-muted">Penalty or correction: {dispute.penalty}</p>
            ) : null}
          </div>
        ) : null}

        {/* Timeline */}
        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Timestamp history</p>
          <ul className="mt-2 space-y-2">
            {dispute.timeline.map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-ink">{t.entry}</span>
                  <span className="block text-[11.5px] text-muted">
                    {t.by} · {formatDateTime(t.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 capitalize text-ink">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function NewCaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { tournament, disputes } = store;
  const [category, setCategory] = React.useState<DisputeCategory>("score");
  const [board, setBoard] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<"low" | "normal" | "high">("normal");

  const submit = () => {
    if (!store.requireCapability("disputes.manage")) return;
    const num = disputes.length + 14;
    const pairing = store.pairings.find(
      (p) => p.round === tournament.currentRound && String(p.board) === board.trim(),
    );
    store.createDispute({
      id: `d-${Math.random().toString(36).slice(2, 8)}`,
      caseNumber: `ARB-2026-${String(num).padStart(3, "0")}`,
      tournamentId: tournament.id,
      round: tournament.currentRound,
      board: Number(board) || 0,
      category,
      playerIds: pairing ? [pairing.playerAId, pairing.playerBId].filter(Boolean) as string[] : [],
      submittedBy: store.currentUser?.name ?? "Demo user",
      description,
      evidence: [],
      assignedArbiter: "Farah Qureshi",
      priority,
      status: "open",
      appealAllowed: true,
      timeline: [
        { at: new Date().toISOString(), by: store.currentUser?.name ?? "Demo user", entry: "Case raised." },
      ],
      createdAt: new Date().toISOString(),
    });
    store.toast({
      title: "Case raised",
      description: "The case was added to the Arbiter Desk and assigned for review.",
      tone: "success",
    });
    setBoard("");
    setDescription("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a dispute case"
      subtitle="Cases are assigned to an arbiter for review."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!description.trim()} onClick={submit}>Raise case</Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as DisputeCategory)}>
            {(Object.keys(CATEGORY_LABEL) as DisputeCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Board number">
          <Input value={board} onChange={(e) => setBoard(e.target.value)} inputMode="numeric" placeholder="e.g. 22" />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as "low" | "normal" | "high")}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="Description" required>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened, including who was involved and when." />
        </Field>
      </div>
    </Modal>
  );
}
