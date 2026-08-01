"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Grid3x3,
  History,
  Printer,
  RefreshCw,
  Send,
  Settings2,
  Shuffle,
  Sparkles,
  Wand2,
  XCircle,
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
  Td,
  Th,
  TableWrap,
  Textarea,
  Toggle,
} from "@/components/ui";
import { PairingCard } from "@/components/pairings/PairingCard";
import { useStore } from "@/lib/store/useStore";
import { validateRound } from "@/lib/engine/pairing";
import { Pairing } from "@/lib/domain/types";
import { cn, downloadFile, toCsv } from "@/lib/utils";

const TABS = [
  { id: "current", label: "Current Round" },
  { id: "preview", label: "Pairing Preview" },
  { id: "history", label: "Pairing History" },
  { id: "constraints", label: "Constraints" },
  { id: "manual", label: "Manual Adjustments" },
];

export default function PairingsPage() {
  // useSearchParams needs a Suspense boundary so the route can prerender.
  return (
    <React.Suspense fallback={<PairingsFallback />}>
      <PairingsView />
    </React.Suspense>
  );
}

function PairingsFallback() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title="Pairing Engine" subtitle="Loading round data…" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-compact bg-[rgb(var(--c-surface-soft))]" />
        ))}
      </div>
    </div>
  );
}

function PairingsView() {
  const params = useSearchParams();
  const store = useStore();
  const {
    tournament,
    players,
    pairings,
    draftRound,
    draftRoundNumber,
    divisions,
  } = store;

  const [tab, setTab] = React.useState(params.get("tab") ?? "current");
  const [query, setQuery] = React.useState("");
  const [division, setDivision] = React.useState("all");
  const [conflictTarget, setConflictTarget] = React.useState<Pairing | null>(null);
  const [swapTarget, setSwapTarget] = React.useState<Pairing | null>(null);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  // Sync from the URL when it changes, without an effect cascade.
  const paramKey = `${params.get("tab") ?? ""}|${params.get("board") ?? ""}`;
  const [lastParams, setLastParams] = React.useState(paramKey);
  if (lastParams !== paramKey) {
    setLastParams(paramKey);
    const t = params.get("tab");
    if (t) setTab(t);
    const b = params.get("board");
    if (b) setQuery(b);
  }

  const playerOf = (id: string | null) =>
    id ? players.find((p) => p.id === id) : undefined;

  const currentRound = tournament.currentRound;
  const nextRound = currentRound + 1;

  /** Opponent history used to show "previous meetings" on each card. */
  const meetings = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pairings.filter((x) => x.playerBId !== null)) {
      const key = [p.playerAId, p.playerBId].sort().join("|");
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [pairings]);

  const meetingsFor = (p: Pairing) =>
    p.playerBId
      ? Math.max(0, (meetings.get([p.playerAId, p.playerBId].sort().join("|")) ?? 0) - 1)
      : 0;

  const filterPairings = (list: Pairing[]) =>
    list.filter((p) => {
      if (division !== "all" && p.division !== division) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const a = playerOf(p.playerAId);
      const b = playerOf(p.playerBId);
      return (
        String(p.board) === q.trim() ||
        a?.fullName.toLowerCase().includes(q) ||
        b?.fullName.toLowerCase().includes(q) ||
        a?.playerId.toLowerCase().includes(q) ||
        b?.playerId.toLowerCase().includes(q)
      );
    });

  const currentPairings = filterPairings(
    pairings.filter((p) => p.round === currentRound).sort((a, b) => a.board - b.board),
  );

  /* ---- Generate preview ------------------------------------------------ */
  const generate = () => {
    if (!store.requireCapability("pairings.generate")) return;
    setGenerating(true);
    window.setTimeout(() => {
      const r = store.generateDraftRound(nextRound);
      setGenerating(false);
      setTab("preview");
      store.toast({
        title: `Round ${nextRound} preview generated`,
        description: `${r.pairingCount} pairings · ${
          r.duplicatePlayers + r.repeatOpponents + r.boardConflicts === 0
            ? "no conflicts detected"
            : "review the flagged boards before publishing"
        }.`,
        tone: r.valid ? "success" : "warning",
      });
    }, 520);
  };

  const draftReport = React.useMemo(
    () => (draftRound ? validateRound(draftRound, players) : null),
    [draftRound, players],
  );

  const publish = () => {
    if (!store.requireCapability("pairings.publish")) return;
    store.publishDraft();
    setPublishOpen(false);
    setTab("current");
    store.toast({
      title: `Round ${draftRoundNumber} published`,
      description:
        "Organizer screens, the public website and the player app have been updated.",
      tone: "success",
    });
  };

  const exportSheet = (list: Pairing[], round: number) => {
    const rows: (string | number)[][] = [
      ["Board", "Player A", "ID", "Rating", "Player B", "ID", "Rating", "Division"],
      ...list.map((p) => {
        const a = playerOf(p.playerAId);
        const b = playerOf(p.playerBId);
        return [
          p.playerBId ? p.board : "Bye",
          a?.fullName ?? "",
          a?.playerId ?? "",
          a?.rating ?? "",
          b?.fullName ?? "Bye",
          b?.playerId ?? "",
          b?.rating ?? "",
          p.division,
        ];
      }),
    ];
    downloadFile(`round-${round}-pairings.csv`, toCsv(rows), "text/csv");
    store.toast({
      title: "Pairing sheet exported",
      description: `Round ${round} pairings downloaded as CSV.`,
      tone: "success",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Pairing Engine"
        badge={<Badge tone="primary">Round {currentRound} published</Badge>}
        subtitle="Generate, review and publish rounds. Every pairing is explained and every change is recorded."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Printer className="size-4" />}
              onClick={() => window.print()}
            >
              Print sheet
            </Button>
            <Button
              variant="primary"
              icon={<Wand2 className="size-4" />}
              loading={generating}
              onClick={generate}
            >
              Generate Round {nextRound}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs tabs={TABS} value={tab} onChange={setTab} className="flex-1" />
      </div>

      {/* ---------------------------------------------------------------- */}
      {tab === "current" ? (
        <>
          <FilterBar
            query={query}
            onQuery={setQuery}
            division={division}
            onDivision={setDivision}
            divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
            right={
              <Button
                variant="secondary"
                size="sm"
                icon={<FileDown className="size-3.5" />}
                onClick={() =>
                  exportSheet(
                    pairings.filter((p) => p.round === currentRound),
                    currentRound,
                  )
                }
              >
                Export
              </Button>
            }
          />

          {currentPairings.length === 0 ? (
            <EmptyState
              icon={<Grid3x3 className="size-5" />}
              title="No pairings match this filter"
              description="Clear the search or choose a different division."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {currentPairings.map((p) => (
                <PairingCard
                  key={p.id}
                  pairing={p}
                  playerA={playerOf(p.playerAId)}
                  playerB={playerOf(p.playerBId)}
                  previousMeetings={meetingsFor(p)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {tab === "preview" ? (
        <div data-tour="pairing-preview">
          {!draftRound ? (
            <Card>
              <EmptyState
                icon={<Wand2 className="size-5" />}
                title={`Round ${nextRound} has not been generated yet`}
                description="Generate a preview to check pairings, conflicts and board assignments before anything is published to players."
                action={
                  <Button variant="primary" loading={generating} onClick={generate}>
                    Generate Round {nextRound} preview
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              {/* Validation summary */}
              <Card className="mb-4">
                <CardHeader
                  title={`Round ${draftRoundNumber} Pairing Validation`}
                  subtitle="Nothing is visible to players until this round is published."
                  icon={<CheckCircle2 className="size-4.5" />}
                  action={
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          store.discardDraft();
                          store.toast({
                            title: "Draft discarded",
                            description: "The unpublished preview was removed.",
                            tone: "info",
                          });
                        }}
                      >
                        Discard
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<RefreshCw className="size-3.5" />}
                        onClick={generate}
                        loading={generating}
                      >
                        Regenerate unlocked
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Send className="size-3.5" />}
                        onClick={() => setPublishOpen(true)}
                      >
                        Publish round
                      </Button>
                    </div>
                  }
                />
                <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-6">
                  <Check label="Pairings" value={draftReport?.pairingCount ?? 0} ok />
                  <Check
                    label="Duplicate players"
                    value={draftReport?.duplicatePlayers ?? 0}
                    ok={(draftReport?.duplicatePlayers ?? 0) === 0}
                  />
                  <Check
                    label="Repeat opponents"
                    value={draftReport?.repeatOpponents ?? 0}
                    ok={(draftReport?.repeatOpponents ?? 0) === 0}
                  />
                  <Check
                    label="Unassigned players"
                    value={draftReport?.unassignedPlayers ?? 0}
                    ok={(draftReport?.unassignedPlayers ?? 0) === 0}
                  />
                  <Check
                    label="Board conflicts"
                    value={draftReport?.boardConflicts ?? 0}
                    ok={(draftReport?.boardConflicts ?? 0) === 0}
                  />
                  <Check
                    label="Approved exceptions"
                    value={draftReport?.approvedExceptions ?? 0}
                    ok
                    neutral
                  />
                </div>
              </Card>

              <FilterBar
                query={query}
                onQuery={setQuery}
                division={division}
                onDivision={setDivision}
                divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filterPairings(draftRound).map((p) => (
                  <PairingCard
                    key={p.id}
                    pairing={p}
                    playerA={playerOf(p.playerAId)}
                    playerB={playerOf(p.playerBId)}
                    previousMeetings={meetingsFor(p)}
                    onLock={() => store.lockPairing(p.id, !p.locked)}
                    onResolve={() => setConflictTarget(p)}
                    onSwap={() => setSwapTarget(p)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {tab === "history" ? <PairingHistory /> : null}
      {tab === "constraints" ? <ConstraintsTab /> : null}
      {tab === "manual" ? <ManualTab onSwap={setSwapTarget} /> : null}

      {/* Conflict resolution drawer ------------------------------------- */}
      <ConflictDrawer
        pairing={conflictTarget}
        onClose={() => setConflictTarget(null)}
        onSwap={(p) => {
          setConflictTarget(null);
          setSwapTarget(p);
        }}
      />

      <SwapModal pairing={swapTarget} onClose={() => setSwapTarget(null)} />

      {/* Publish confirmation ------------------------------------------- */}
      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={`Round ${draftRoundNumber} Pairing Validation`}
        subtitle="Confirm before publishing to players and the public website."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              Back to preview
            </Button>
            <Button
              variant="primary"
              onClick={publish}
              disabled={!draftReport?.valid}
              icon={<Send className="size-4" />}
            >
              Publish Pairings
            </Button>
          </div>
        }
      >
        <ul className="space-y-2">
          {[
            ["Pairings", draftReport?.pairingCount ?? 0, true],
            ["Duplicate players", draftReport?.duplicatePlayers ?? 0, (draftReport?.duplicatePlayers ?? 0) === 0],
            ["Repeat opponents", draftReport?.repeatOpponents ?? 0, (draftReport?.repeatOpponents ?? 0) === 0],
            ["Unassigned players", draftReport?.unassignedPlayers ?? 0, (draftReport?.unassignedPlayers ?? 0) === 0],
            ["Board conflicts", draftReport?.boardConflicts ?? 0, (draftReport?.boardConflicts ?? 0) === 0],
            ["Director-approved exceptions", draftReport?.approvedExceptions ?? 0, true],
          ].map(([label, value, ok]) => (
            <li
              key={String(label)}
              className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5"
            >
              <span className="flex items-center gap-2 text-[13.5px] text-ink">
                {ok ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <XCircle className="size-4 text-critical" />
                )}
                {label as string}
              </span>
              <span className="text-[14px] font-semibold text-ink num">{value as number}</span>
            </li>
          ))}
        </ul>

        {!draftReport?.valid ? (
          <p className="mt-3 rounded-control bg-critical-050 px-3.5 py-2.5 text-[12.5px] text-[#c93a51]">
            Resolve the outstanding conflicts before publishing, or record a director-approved
            exception with a reason.
          </p>
        ) : (
          <p className="mt-3 rounded-control bg-success-050 px-3.5 py-2.5 text-[12.5px] text-[#1b8f68]">
            All checks passed. Publishing updates organizer screens, the public website, the
            player app and creates a printable pairing sheet.
          </p>
        )}

        <div className="mt-4 space-y-1.5">
          <Toggle checked onChange={() => undefined} label="Update the public website" />
          <Toggle checked onChange={() => undefined} label="Notify players in the mobile app" />
          <Toggle checked onChange={() => undefined} label="Create a printable pairing sheet" />
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Check({
  label,
  value,
  ok,
  neutral,
}: {
  label: string;
  value: number;
  ok: boolean;
  neutral?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-control px-3 py-2.5",
        neutral ? "bg-[rgb(var(--c-surface))]" : ok ? "bg-success-050/70" : "bg-critical-050/70",
      )}
    >
      <p className="text-[19px] font-semibold text-ink num">{value}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted">
        {!neutral ? (
          ok ? (
            <CheckCircle2 className="size-3 text-success" />
          ) : (
            <XCircle className="size-3 text-critical" />
          )
        ) : null}
        {label}
      </p>
    </div>
  );
}

function FilterBar({
  query,
  onQuery,
  division,
  onDivision,
  divisions,
  right,
}: {
  query: string;
  onQuery: (v: string) => void;
  division: string;
  onDivision: (v: string) => void;
  divisions: { id: string; name: string }[];
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <SearchInput
        value={query}
        onChange={onQuery}
        placeholder="Search by board number, player name or ID"
        className="sm:max-w-sm"
      />
      <div className="w-full sm:w-52">
        <Select value={division} onChange={(e) => onDivision(e.target.value)} aria-label="Division">
          <option value="all">All divisions</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      {right ? <div className="sm:ml-auto">{right}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ConflictDrawer({
  pairing,
  onClose,
  onSwap,
}: {
  pairing: Pairing | null;
  onClose: () => void;
  onSwap: (p: Pairing) => void;
}) {
  const store = useStore();
  const [reason, setReason] = React.useState("");
  const players = store.players;
  const a = pairing ? players.find((p) => p.id === pairing.playerAId) : undefined;
  const b = pairing?.playerBId ? players.find((p) => p.id === pairing.playerBId) : undefined;

  const [lastPairing, setLastPairing] = React.useState(pairing);
  if (lastPairing !== pairing) {
    setLastPairing(pairing);
    setReason("");
  }
  if (!pairing) return null;

  const unresolved = pairing.conflicts.filter((c) => !c.acknowledgedReason);

  return (
    <Drawer
      open={!!pairing}
      onClose={onClose}
      title={`Board ${pairing.board} — conflict review`}
      subtitle={`${a?.fullName} vs ${b?.fullName ?? "Bye"}`}
      width="lg"
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onSwap(pairing)} icon={<Shuffle className="size-4" />}>
            Swap opponent
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              store.assignBye(pairing.id);
              store.toast({
                title: "Bye assigned",
                description: `Board ${pairing.board} was converted to a bye.`,
                tone: "info",
              });
              onClose();
            }}
          >
            Assign bye
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              window.location.href = "/app/copilot";
            }}
            icon={<Sparkles className="size-4" />}
          >
            Ask Copilot
          </Button>
          <Button
            variant="primary"
            className="sm:ml-auto"
            disabled={!reason.trim() || unresolved.length === 0}
            onClick={() => {
              for (const c of unresolved) store.acknowledgeConflict(pairing.id, c.kind, reason);
              store.toast({
                title: "Exception recorded",
                description: "The conflict was approved with a reason and logged in the audit trail.",
                tone: "success",
              });
              onClose();
            }}
          >
            Ignore with reason
          </Button>
        </div>
      }
    >
      <div data-tour="conflict-drawer" className="space-y-4">
        {unresolved.length === 0 ? (
          <div className="rounded-compact bg-success-050 p-4">
            <p className="text-[13.5px] font-medium text-ink">No unresolved conflicts</p>
            <p className="mt-1 text-[12.5px] text-muted">
              This pairing passes every active constraint.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {unresolved.map((c, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-compact border p-3.5",
                  c.severity === "critical"
                    ? "border-critical/30 bg-critical-050/50"
                    : "border-warning/30 bg-warning-050/50",
                )}
              >
                <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <AlertTriangle
                    className={cn(
                      "size-4",
                      c.severity === "critical" ? "text-critical" : "text-warning",
                    )}
                  />
                  {c.kind.replace(/-/g, " ")}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{c.message}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-compact bg-[rgb(var(--c-surface))] p-4">
          <p className="text-[13px] font-semibold text-ink">Why this pairing was created</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{pairing.reason}</p>
        </div>

        <Field
          label="Reason for overriding or accepting this conflict"
          hint="Recorded in the audit log against your name and role."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. No alternative pairing available without creating a second repeat in this division."
          />
        </Field>

        <p className="rounded-control bg-secondary-050 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#2b7fd4]">
          Guidance only. The Tournament Director makes the final decision. This demonstration
          pairing engine is not certified by any rating body.
        </p>
      </div>
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */

function SwapModal({ pairing, onClose }: { pairing: Pairing | null; onClose: () => void }) {
  const store = useStore();
  const { draftRound, players } = store;
  const [target, setTarget] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [side, setSide] = React.useState<"A" | "B">("B");

  const [lastPairing, setLastPairing] = React.useState(pairing);
  if (lastPairing !== pairing) {
    setLastPairing(pairing);
    setTarget("");
    setReason("");
    setSide("B");
  }

  if (!pairing || !draftRound) return null;

  const movingId = side === "A" ? pairing.playerAId : pairing.playerBId;
  const moving = players.find((p) => p.id === movingId);

  // Candidates are every other player in the same division in this draft.
  const candidates = draftRound
    .filter((p) => p.id !== pairing.id && p.division === pairing.division && p.playerBId)
    .flatMap((p) => [p.playerAId, p.playerBId!])
    .map((id) => players.find((x) => x.id === id))
    .filter(Boolean);

  return (
    <Modal
      open={!!pairing}
      onClose={onClose}
      title={`Swap a player on board ${pairing.board}`}
      subtitle="The two players exchange boards. Locked pairings are never affected."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!target || !reason.trim()}
            onClick={() => {
              if (!movingId) return;
              store.swapDraftPlayers(movingId, target, reason);
              store.toast({
                title: "Players swapped",
                description: "The change was recorded with your reason in the audit log.",
                tone: "success",
              });
              onClose();
            }}
          >
            Confirm swap
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Which player is moving?">
          <Select value={side} onChange={(e) => setSide(e.target.value as "A" | "B")}>
            <option value="A">{players.find((p) => p.id === pairing.playerAId)?.fullName}</option>
            {pairing.playerBId ? (
              <option value="B">{players.find((p) => p.id === pairing.playerBId)?.fullName}</option>
            ) : null}
          </Select>
        </Field>

        <Field label="Swap with" required>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Select a player…</option>
            {candidates.map((c) => (
              <option key={c!.id} value={c!.id}>
                {c!.fullName} — {c!.playerId} ({c!.rating || "unrated"})
              </option>
            ))}
          </Select>
        </Field>

        {moving && target ? (
          <div className="rounded-control bg-primary-050/60 px-3.5 py-2.5 text-[12.5px] text-primary-600">
            {moving.fullName} will exchange boards with{" "}
            {players.find((p) => p.id === target)?.fullName}. Both pairings are re-checked for
            conflicts immediately.
          </div>
        ) : null}

        <Field label="Reason for the manual change" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Repeat opponent detected — swapped to the nearest available opponent."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function PairingHistory() {
  const store = useStore();
  const { pairings, players, rounds } = store;
  const [round, setRound] = React.useState(String(store.tournament.currentRound));

  const list = pairings
    .filter((p) => p.round === Number(round))
    .sort((a, b) => a.board - b.board);
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  return (
    <Card>
      <CardHeader
        title="Pairing History"
        subtitle="Every round that has been published in this tournament"
        icon={<History className="size-4.5" />}
        action={
          <div className="w-40">
            <Select value={round} onChange={(e) => setRound(e.target.value)} aria-label="Round">
              {rounds.map((r) => (
                <option key={r.id} value={r.number}>
                  Round {r.number}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <div className="px-3 pb-4">
        <TableWrap>
          <thead>
            <tr>
              <Th>Board</Th>
              <Th>Player A</Th>
              <Th>Player B</Th>
              <Th>Result</Th>
              <Th>Division</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                <Td className="num font-medium">{p.playerBId ? p.board : "Bye"}</Td>
                <Td>{nameOf(p.playerAId)}</Td>
                <Td>{nameOf(p.playerBId)}</Td>
                <Td className="num">
                  {p.scoreA !== undefined && p.scoreB !== undefined
                    ? `${p.scoreA} – ${p.scoreB}`
                    : "—"}
                </Td>
                <Td className="capitalize">{p.division.replace(/-/g, " ")}</Td>
                <Td>
                  <Badge
                    tone={
                      p.status === "verified"
                        ? "success"
                        : p.status === "live"
                          ? "info"
                          : p.status === "awaiting-verification"
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {p.status.replace(/-/g, " ")}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ConstraintsTab() {
  const store = useStore();
  const c = store.tournament.constraints;

  const set = (patch: Partial<typeof c>) => {
    if (!store.requireCapability("tournament.edit")) return;
    store.updateTournament({ constraints: { ...c, ...patch } });
    store.toast({
      title: "Pairing rules updated",
      description: "New pairings will use the updated constraints.",
      tone: "success",
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Pairing Constraints"
          subtitle="Applied every time a round is generated"
          icon={<Settings2 className="size-4.5" />}
        />
        <div className="divide-y divide-line px-5 pb-5">
          <Toggle
            checked={c.avoidRepeatOpponents}
            onChange={(v) => set({ avoidRepeatOpponents: v })}
            label="Avoid repeat opponents"
            description="Players who have already met are not paired again while an alternative exists."
          />
          <Toggle
            checked={c.balanceStarts}
            onChange={(v) => set({ balanceStarts: v })}
            label="Balance starts"
            description="Alternate which player starts the game across rounds where applicable."
          />
          <Toggle
            checked={c.avoidSameClub}
            onChange={(v) => set({ avoidSameClub: v })}
            label="Avoid same club or school"
            description="Raises a warning when both players represent the same organization."
          />
          <Toggle
            checked={c.respectAccessibility}
            onChange={(v) => set({ respectAccessibility: v })}
            label="Respect board accessibility"
            description="Players with an accessibility requirement are kept on ground-floor boards."
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Thresholds" subtitle="Numeric limits used by the engine" />
        <div className="space-y-4 px-5 pb-5">
          <Field
            label="Maximum rating difference"
            hint="Pairings above this gap are flagged for review, not blocked."
          >
            <Input
              type="number"
              value={c.maxRatingGap}
              onChange={(e) => set({ maxRatingGap: Number(e.target.value) })}
            />
          </Field>
          <Field label="Maximum byes per player" hint="A player will not receive a second bye while another eligible player has had none.">
            <Input
              type="number"
              value={c.maxByesPerPlayer}
              onChange={(e) => set({ maxByesPerPlayer: Number(e.target.value) })}
            />
          </Field>
          <Field label="Rank proximity window" hint="How far the engine may look for a valid opponent.">
            <Input
              type="number"
              value={c.rankProximityWindow}
              onChange={(e) => set({ rankProximityWindow: Number(e.target.value) })}
            />
          </Field>

          <p className="rounded-control bg-secondary-050 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#2b7fd4]">
            This demonstration engine is deterministic and explainable, but it is not certified
            by any national or international rating body. Every round is presented for director
            review before publication.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ManualTab({ onSwap }: { onSwap: (p: Pairing) => void }) {
  const store = useStore();
  const { draftRound, pairings, players, tournament } = store;
  const [boardInput, setBoardInput] = React.useState("");
  const [newBoard, setNewBoard] = React.useState("");
  const [reason, setReason] = React.useState("");

  const live = pairings
    .filter((p) => p.round === tournament.currentRound && p.playerBId)
    .sort((a, b) => a.board - b.board);
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  const target = live.find((p) => String(p.board) === boardInput.trim());

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Reassign a board"
          subtitle="Move a game to a different table without changing the pairing"
          icon={<Grid3x3 className="size-4.5" />}
        />
        <div className="space-y-3.5 px-5 pb-5">
          <Field label="Current board number" required>
            <Input
              value={boardInput}
              onChange={(e) => setBoardInput(e.target.value)}
              placeholder="e.g. 27"
              inputMode="numeric"
            />
          </Field>

          {target ? (
            <div className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5 text-[12.5px] text-ink">
              {nameOf(target.playerAId)} vs {nameOf(target.playerBId)} · {target.division}
            </div>
          ) : boardInput.trim() ? (
            <p className="rounded-control bg-critical-050 px-3.5 py-2.5 text-[12.5px] text-[#c93a51]">
              No live board with that number in round {tournament.currentRound}.
            </p>
          ) : null}

          <Field label="New board number" required>
            <Input
              value={newBoard}
              onChange={(e) => setNewBoard(e.target.value)}
              placeholder="e.g. 63"
              inputMode="numeric"
            />
          </Field>

          <Field label="Reason" required>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Table damaged during setup."
            />
          </Field>

          <Button
            variant="primary"
            disabled={!target || !newBoard.trim() || !reason.trim()}
            onClick={() => {
              if (!target) return;
              if (!store.requireCapability("pairings.override")) return;
              store.reassignBoard(target.id, Number(newBoard), reason);
              store.toast({
                title: "Board reassigned",
                description: `Board ${target.board} moved to board ${newBoard}. Players were notified.`,
                tone: "success",
              });
              setBoardInput("");
              setNewBoard("");
              setReason("");
            }}
          >
            Assign replacement board
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Manual pairing changes"
          subtitle={
            draftRound
              ? "Swap players inside the unpublished draft round"
              : "Generate a preview round to make manual changes"
          }
          icon={<Shuffle className="size-4.5" />}
        />
        <div className="px-5 pb-5">
          {!draftRound ? (
            <EmptyState
              title="No draft round in progress"
              description="Manual swaps apply to a generated preview so the change can be reviewed and undone before publication."
            />
          ) : (
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto scroll-slim">
              {draftRound
                .filter((p) => p.playerBId)
                .slice(0, 30)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-control border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] px-3 py-2"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-primary-050 text-[12px] font-semibold text-primary num">
                      {p.board}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {nameOf(p.playerAId)} vs {nameOf(p.playerBId)}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => onSwap(p)}>
                      Swap
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
