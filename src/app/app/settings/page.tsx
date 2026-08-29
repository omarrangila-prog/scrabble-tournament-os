"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Database,
  Download,
  History,
  RotateCcw,
  Shield,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Tabs,
  TableWrap,
  Td,
  Th,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { useEventSettings, writeEventSettings, type EventSettings } from "@/lib/supabase/useEventSettings";
import { useEventFormat } from "@/lib/supabase/useEventFormat";
import { useRoster } from "@/lib/supabase/useRoster";
import { useGames } from "@/lib/supabase/useGames";
import { summarizeAuditDetail, useAuditLog } from "@/lib/supabase/useAuditLog";
import { useRoundSnapshots, type RoundSnapshot } from "@/lib/supabase/useRoundSnapshots";
import { useEventCategories, writeEventCategories } from "@/lib/supabase/useEventCategories";
import {
  useEventDetails,
  writeEventDetails,
  writePairingRules,
  type PairingRules,
} from "@/lib/supabase/useEventDetails";
import type { EventDetails } from "@/lib/supabase/events";
import type { Division } from "@/lib/domain/types";
import { FormatPicker } from "@/components/forms/FormatPicker";
import type { PairingSystem } from "@/lib/domain/types";
import {
  ALL_CAPABILITIES,
  ALL_ROLES,
  CAPABILITY_LABEL,
  ROLE_LABEL,
  ROLE_SUMMARY,
  can,
} from "@/lib/store/permissions";
import { cn, downloadFile, formatDateTime, toCsv } from "@/lib/utils";

export default function SettingsPage() {
  const store = useStore();
  const { role } = store;
  const currentEvent = useCurrentEvent();
  const [tab, setTab] = React.useState("general");
  const [auditQuery, setAuditQuery] = React.useState("");
  const [resetOpen, setResetOpen] = React.useState(false);

  /*
   * The real audit trail, not `store.audit` — a Zustand array seeded once with demo entries
   * and never touched by any real write since. Every score correction, dispute, check-in,
   * payment decision, phase change and settings change has been landing in Postgres since
   * Phase 1; this is the first screen that reads it back.
   */
  const auditLog = useAuditLog(currentEvent.eventId);
  const roundHistory = useRoundSnapshots(currentEvent.eventId);

  const filteredAudit = auditLog.entries.filter((a) => {
    const q = auditQuery.trim().toLowerCase();
    return (
      !q ||
      a.action.toLowerCase().includes(q) ||
      a.actor.toLowerCase().includes(q) ||
      summarizeAuditDetail(a.detail).toLowerCase().includes(q)
    );
  });

  const exportData = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      tournament: store.tournament,
      players: store.players,
      pairings: store.pairings,
      rounds: store.rounds,
      disputes: store.disputes,
      audit: store.audit,
    };
    downloadFile("tournament-os-export.json", JSON.stringify(snapshot, null, 2), "application/json");
    store.toast({
      title: "Data exported",
      description: "A full JSON snapshot of this tournament was downloaded.",
      tone: "success",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Settings"
        subtitle="Roles, permissions, audit history and demo data controls."
        badge={<Badge tone="primary">{ROLE_LABEL[role]}</Badge>}
      />

      <Tabs
        tabs={[
          { id: "general", label: "General" },
          { id: "roles", label: "Roles & permissions" },
          { id: "audit", label: "Audit log", count: auditLog.entries.length },
          { id: "history", label: "Round history", count: roundHistory.snapshots.length },
          { id: "data", label: "Data & backup" },
          { id: "help", label: "Help" },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "general" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EventDetailsCard
            eventId={currentEvent.eventId}
            by={store.currentUser?.name ?? "Director"}
            onSaved={currentEvent.reload}
          />

          <PairingRulesCard
            eventId={currentEvent.eventId}
            by={store.currentUser?.name ?? "Director"}
          />

          <CategoriesCard
            eventId={currentEvent.eventId}
            by={store.currentUser?.name ?? "Director"}
          />

          <PairingFormatCard eventId={currentEvent.eventId} />

          <EventSettingsCard eventId={currentEvent.eventId} by={store.currentUser?.name ?? "Director"} />
        </div>
      ) : null}

      {tab === "roles" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Your current role"
              subtitle="Switch roles to see how permissions change across the platform"
              icon={<Shield className="size-4.5" />}
            />
            <div className="px-5 pb-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ALL_ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      store.signIn(r);
                      store.toast({
                        title: `Now signed in as ${ROLE_LABEL[r]}`,
                        description: ROLE_SUMMARY[r],
                        tone: "info",
                      });
                    }}
                    className={cn(
                      "rounded-compact border p-3.5 text-left transition-colors",
                      role === r ? "border-primary bg-primary-050" : "border-line-strong bg-[rgb(var(--c-surface))] hover:bg-[rgb(var(--c-surface-strong))]",
                    )}
                  >
                    <p className="text-[13.5px] font-semibold text-ink">{ROLE_LABEL[r]}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{ROLE_SUMMARY[r]}</p>
                    {role === r ? <Badge tone="primary" className="mt-2">Active</Badge> : null}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Permission matrix"
              subtitle="Restricted actions are never hidden — the platform explains who may perform them."
            />
            <div className="px-3 pb-4">
              <TableWrap className="max-h-[60vh]">
                <thead>
                  <tr>
                    <Th className="min-w-[220px]">Action</Th>
                    {ALL_ROLES.map((r) => (
                      <Th key={r} className="w-28 text-center">{ROLE_LABEL[r].replace("Tournament ", "")}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_CAPABILITIES.map((c) => (
                    <tr key={c} className="hover:bg-[rgb(var(--c-surface-soft))]">
                      <Td className="font-medium">{CAPABILITY_LABEL[c]}</Td>
                      {ALL_ROLES.map((r) => (
                        <Td key={r} className="text-center">
                          {can(r, c) ? (
                            <span className="inline-flex items-center gap-1 text-[12px] text-[#1b8f68]">
                              <CheckCircle2 className="size-3.5" />
                              <span className="sr-only">Allowed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[12px] text-faint">
                              <XCircle className="size-3.5" />
                              <span className="sr-only">Not permitted</span>
                            </span>
                          )}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "audit" ? (
        <Card id="audit">
          <CardHeader
            title="Audit log"
            subtitle="Every recorded action for this event, with who did it and what changed"
            icon={<History className="size-4.5" />}
            action={
              <div className="flex gap-2">
                <SearchInput value={auditQuery} onChange={setAuditQuery} placeholder="Search actions" className="w-48" />
                <Button size="sm" variant="secondary" onClick={auditLog.reload}>
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="size-3.5" />}
                  onClick={() => {
                    const rows: (string | number)[][] = [
                      ["Time", "Actor", "Action", "Detail"],
                      ...filteredAudit.map((a) => [
                        formatDateTime(a.at), a.actor, a.action, summarizeAuditDetail(a.detail),
                      ]),
                    ];
                    downloadFile("audit-log.csv", toCsv(rows), "text/csv");
                    store.toast({ title: "Audit log exported", description: `${filteredAudit.length} entries downloaded.`, tone: "success" });
                  }}
                >
                  Export
                </Button>
              </div>
            }
          />
          <div className="px-3 pb-4">
            {!auditLog.loaded ? (
              <div className="space-y-2 px-2 py-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-control bg-[rgb(var(--c-surface-soft))]" />
                ))}
              </div>
            ) : filteredAudit.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-[13px] font-medium text-ink">
                  {auditLog.entries.length === 0 ? "Nothing recorded yet" : "No entries match that search"}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {auditLog.entries.length === 0
                    ? "Every score correction, dispute, check-in, payment decision and phase change will appear here as it happens."
                    : "Try a different action, staff name or value."}
                </p>
              </div>
            ) : (
              <TableWrap className="max-h-[64vh]">
                <thead>
                  <tr>
                    <Th className="w-40">Date and time</Th>
                    <Th className="w-40">Actor</Th>
                    <Th className="w-44">Action</Th>
                    <Th className="min-w-[280px]">What changed</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((a) => (
                    <tr key={a.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                      <Td className="whitespace-nowrap">{formatDateTime(a.at)}</Td>
                      <Td className="font-medium">{a.actor}</Td>
                      <Td className="text-muted">{a.action}</Td>
                      <Td className="text-muted">{summarizeAuditDetail(a.detail)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "history" ? <RoundHistoryCard snapshots={roundHistory.snapshots} loaded={roundHistory.loaded} onRefresh={roundHistory.reload} /> : null}

      {tab === "data" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Backup status" subtitle="Local demo storage" icon={<Database className="size-4.5" />} />
            <div className="space-y-2 px-5 pb-5">
              <div className="flex items-center gap-2.5 rounded-control bg-success-050/70 px-3.5 py-3">
                <CheckCircle2 className="size-4 shrink-0 text-success" />
                <div>
                  <p className="text-[13px] font-medium text-ink">Automatic backup active</p>
                  <p className="text-[12px] text-muted">
                    Every change is written to this device immediately. The demo survives a refresh.
                  </p>
                </div>
              </div>
              <dl className="space-y-1 text-[12.5px]">
                {[
                  ["Players", store.players.length],
                  ["Pairings", store.pairings.length],
                  ["Rounds", store.rounds.length],
                  ["Audit entries", store.audit.length],
                  ["Arbiter cases", store.disputes.length],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2">
                    <dt className="text-muted">{k as string}</dt>
                    <dd className="font-semibold text-ink num">{v as number}</dd>
                  </div>
                ))}
              </dl>
              <Button variant="secondary" className="w-full" icon={<Download className="size-4" />} onClick={exportData}>
                Export all tournament data
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Demo controls" subtitle="Restore the demonstration to its starting state" />
            <div className="space-y-3 px-5 pb-5">
              <div className="rounded-control bg-warning-050/60 px-3.5 py-3">
                <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <AlertTriangle className="size-4 text-warning" />
                  Reset demo data
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  This restores all 128 players, rounds 1 to 5, the pending results and the seeded
                  arbiter cases. Any changes you made during the demonstration are discarded.
                </p>
              </div>
              <Button variant="danger" className="w-full" icon={<RotateCcw className="size-4" />} onClick={() => setResetOpen(true)}>
                Reset Demo Data
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "help" ? (
        <div id="help" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Keyboard shortcuts" subtitle="Speed up tournament operations" icon={<CircleHelp className="size-4.5" />} />
            <ul className="space-y-1.5 px-5 pb-5">
              {[
                ["Ctrl / Cmd + K", "Open global search"],
                ["Tab", "Move between score fields"],
                ["Enter", "Submit a score and advance to the next board"],
                ["Arrow up / down", "Move between boards in score entry"],
                ["Esc", "Close a dialog or drawer"],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2">
                  <kbd className="shrink-0 rounded-md border border-line-strong bg-white px-2 py-0.5 text-[11.5px] text-ink">
                    {k}
                  </kbd>
                  <span className="text-right text-[12.5px] text-muted">{v}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="About this demonstration" subtitle="What is real and what is simulated" />
            <div className="space-y-2 px-5 pb-5 text-[12.5px] leading-relaxed">
              <p className="rounded-control bg-success-050/60 px-3.5 py-2.5 text-ink">
                <strong className="font-semibold">Fully working:</strong> pairing generation and
                validation, conflict detection, score entry and verification, standings
                recalculation, seeding, check-in, reports, exports, roles and the audit trail.
              </p>
              <p className="rounded-control bg-secondary-050/70 px-3.5 py-2.5 text-ink">
                <strong className="font-semibold">Simulated:</strong> QR camera scanning, result
                sheet OCR, and external delivery of WhatsApp, SMS and email messages. These connect
                to real providers in production.
              </p>
              <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5 text-muted">
                All data is fictional and stored only in this browser. The pairing engine is
                deterministic and explainable, but it is not certified by any national or
                international rating body.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset demo data?"
        subtitle="This cannot be undone."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                store.resetDemo();
                setResetOpen(false);
              }}
            >
              Reset demo data
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Every change made during this demonstration — checked-in players, entered scores,
          published rounds, arbiter rulings and audit entries — will be discarded and the
          tournament restored to round 5 as originally seeded.
        </p>
      </Modal>
    </div>
  );
}

/**
 * The real event settings — one row in Postgres, read from the same place by every screen
 * that cares. This replaces four toggles that used to sit here: two wrote to a
 * Zustand/localStorage model no Supabase-backed screen ever reads, and two were literally
 * `<Toggle checked onChange={() => undefined}>` — hardcoded on, doing nothing. Every switch
 * below actually changes what the tournament does, everywhere it does it, and every change
 * is written to the audit log.
 */
function EventSettingsCard({ eventId, by }: { eventId: string; by: string }) {
  const eventSettings = useEventSettings(eventId);
  const [saving, setSaving] = React.useState<string | null>(null);

  const flip = async (key: keyof EventSettings, label: string) => {
    setSaving(key);
    const result = await writeEventSettings(
      eventId,
      { [key]: !eventSettings.settings[key] },
      by,
    );
    setSaving(null);

    if (!result.ok) {
      alert(result.message ?? "Not saved. Please try again.");
      return;
    }
    eventSettings.reload();
    void label;
  };

  const s = eventSettings.settings;

  return (
    <Card>
      <CardHeader
        title="Event settings"
        subtitle="What is turned on for the active event — changes apply everywhere at once"
      />
      <div className="divide-y divide-line px-5 pb-5">
        <Toggle
          checked={s.qrEnabled}
          disabled={saving === "qrEnabled" || !eventSettings.loaded}
          onChange={() => void flip("qrEnabled", "QR")}
          label="QR codes"
          description="Show a QR code on the wall, TV and check-in. Off means staff handle everything by name — nothing about the tournament itself changes."
        />
        <Toggle
          checked={s.selfCheckinEnabled}
          disabled={saving === "selfCheckinEnabled" || !eventSettings.loaded}
          onChange={() => void flip("selfCheckinEnabled", "Self check-in")}
          label="Self check-in"
          description="Let a participant check themselves in from their own phone. Off means every check-in goes through staff."
        />
        <Toggle
          checked={s.playerScoreEntryEnabled}
          disabled={saving === "playerScoreEntryEnabled" || !eventSettings.loaded}
          onChange={() => void flip("playerScoreEntryEnabled", "Player score entry")}
          label="Player score entry"
          description="Let a player submit their own board's score. Off means staff enter every score."
        />
        <Toggle
          checked={s.opponentConfirmationEnabled}
          disabled={saving === "opponentConfirmationEnabled" || !eventSettings.loaded}
          onChange={() => void flip("opponentConfirmationEnabled", "Opponent confirmation")}
          label="Opponent confirmation"
          description="Ask the opponent to confirm a submitted score before it counts."
        />
        <Toggle
          checked={s.certificatesEnabled}
          disabled={saving === "certificatesEnabled" || !eventSettings.loaded}
          onChange={() => void flip("certificatesEnabled", "Certificates")}
          label="Certificates"
          description="Issue certificates for this event."
        />
        <Toggle
          checked={s.emailEnabled}
          disabled={saving === "emailEnabled" || !eventSettings.loaded}
          onChange={() => void flip("emailEnabled", "Email")}
          label="Email"
          description="Send confirmation, code and results emails for this event."
        />
        <Toggle
          checked={s.whatsappEnabled}
          disabled={saving === "whatsappEnabled" || !eventSettings.loaded}
          onChange={() => void flip("whatsappEnabled", "WhatsApp")}
          label="WhatsApp"
          description="Send WhatsApp links/messages for this event."
        />
        <Toggle
          checked={s.firstSecondEnabled}
          disabled={saving === "firstSecondEnabled" || !eventSettings.loaded}
          onChange={() => void flip("firstSecondEnabled", "First/second tracking")}
          label="Track first / second"
          description="Balance who plays first across the tournament, and show it on each board. Off means pairing makes no decision — nobody is marked to move first."
        />
      </div>
    </Card>
  );
}

/**
 * How the next round gets decided. Saved on the event the same way round count and round
 * length already are — read live by pairing, so a choice made here is the choice a director
 * actually gets when they press Review on Live Event, rather than the Swiss fold running no
 * matter what this said.
 *
 * Locked once Round 1 exists: round robin's whole schedule depends on the field being fixed
 * from the start, and changing format mid-event would leave earlier rounds decided under
 * rules the later ones no longer follow.
 */
function PairingFormatCard({ eventId }: { eventId: string }) {
  const roster = useRoster(eventId);
  const games = useGames(eventId);
  const { format, loaded, save } = useEventFormat(eventId, {
    rounds: 5,
    roundMinutes: 20,
    system: "swiss",
  });
  const [saving, setSaving] = React.useState(false);

  const attending = roster.players.filter((p) => p.checkIn === "checked-in").length;
  /*
   * Locked once Round 1 has been published. Round robin's whole schedule is fixed the moment
   * it is generated — changing the format after boards exist would leave earlier rounds
   * decided under rules the later ones no longer follow.
   */
  const locked = games.round > 0;

  const setSystem = async (system: PairingSystem) => {
    setSaving(true);
    const out = await save({ ...format, system });
    setSaving(false);
    if (!out.ok) alert(out.message ?? "Not saved. Please try again.");
  };

  return (
    <Card>
      <CardHeader
        title="Pairing format"
        subtitle="How the next round gets decided — read live by pairing on Live Event"
      />
      <div className="px-5 pb-5">
        {!loaded ? (
          <div className="h-32 animate-pulse rounded-feature bg-[rgb(var(--c-surface-soft))]" />
        ) : locked ? (
          <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
            Round 1 has already been paired, so the format for this event is locked in. Clear
            every round on Live Event to change it.
          </p>
        ) : (
          <FormatPicker
            value={format.system}
            onChange={(next) => void setSystem(next)}
            players={attending || roster.players.length}
            rounds={format.rounds}
          />
        )}
        {saving ? <p className="mt-2 text-[12px] text-muted">Saving…</p> : null}
      </div>
    </Card>
  );
}

/**
 * Pairings and standings exactly as they stood when each round finalized.
 *
 * `staff_snapshot_round` has been writing these since Phase 1 — automatically, once for every
 * round, right before the next one publishes — and nothing had ever read one back. Not the
 * source of truth for anything else in this app: standings elsewhere are still derived live
 * from verified games, which is what keeps them correct after a later correction. This
 * answers a different question, one live derivation cannot: what did round 2 actually say at
 * the time, before that correction changed the games behind it.
 */
function RoundHistoryCard({
  snapshots,
  loaded,
  onRefresh,
}: {
  snapshots: RoundSnapshot[];
  loaded: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  const toggle = (round: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });

  return (
    <Card>
      <CardHeader
        title="Round history"
        subtitle="Pairings and standings as they stood when each round finalized — never recomputed, never edited"
        icon={<Archive className="size-4.5" />}
        action={
          <Button size="sm" variant="secondary" onClick={onRefresh}>
            Refresh
          </Button>
        }
      />
      <div className="space-y-2 px-5 pb-5">
        {!loaded ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-control bg-[rgb(var(--c-surface-soft))]" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13px] font-medium text-ink">No rounds finalized yet</p>
            <p className="mt-1 text-[12px] text-muted">
              A record is written automatically once the next round is prepared, preserving the
              one before it exactly as it stood.
            </p>
          </div>
        ) : (
          snapshots.map((s) => {
            const open = expanded.has(s.round);
            return (
              <div key={s.round} className="overflow-hidden rounded-feature border border-line">
                <button
                  type="button"
                  onClick={() => toggle(s.round)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--c-surface-soft))]"
                >
                  <span>
                    <span className="text-[13.5px] font-semibold text-ink">Round {s.round}</span>
                    <span className="ml-2 text-[12px] text-muted">
                      finalized by {s.createdBy} · {formatDateTime(s.createdAt)}
                    </span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
                </button>

                {open ? (
                  <div className="space-y-4 border-t border-line px-4 py-3">
                    {s.pairings && s.pairings.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                          Pairings
                        </p>
                        <ul className="space-y-1">
                          {s.pairings
                            .slice()
                            .sort((a, b) => a.board - b.board)
                            .map((b, i) => (
                              <li
                                key={i}
                                className="flex items-center gap-2.5 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-1.5 text-[12.5px]"
                              >
                                <span className="num w-7 shrink-0 font-bold text-ink">{b.board || "—"}</span>
                                <span className="min-w-0 flex-1 truncate">
                                  {b.playerA}
                                  {b.playerB ? ` v ${b.playerB}` : " — bye"}
                                </span>
                                {b.scoreA !== null && b.scoreB !== null ? (
                                  <span className="num shrink-0 text-muted">
                                    {b.scoreA}–{b.scoreB}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}

                    {s.standings && s.standings.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                          Standings at this point
                        </p>
                        <TableWrap className="max-h-[320px]">
                          <thead>
                            <tr>
                              <Th className="w-28">Division</Th>
                              <Th>Name</Th>
                              <Th className="w-14">W</Th>
                              <Th className="w-14">L</Th>
                              <Th className="w-14">D</Th>
                              <Th className="w-20">Spread</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.standings.map((row, i) => (
                              <tr key={i}>
                                <Td className="capitalize text-muted">{row.out_division}</Td>
                                <Td className="font-medium">{row.out_name}</Td>
                                <Td className="num">{row.out_wins}</Td>
                                <Td className="num">{row.out_losses}</Td>
                                <Td className="num">{row.out_draws}</Td>
                                <Td className="num">{row.out_spread > 0 ? `+${row.out_spread}` : row.out_spread}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </TableWrap>
                      </div>
                    ) : null}

                    {(!s.pairings || s.pairings.length === 0) && (!s.standings || s.standings.length === 0) ? (
                      <p className="text-[12px] text-muted">
                        No boards had been published when this round was recorded.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/**
 * The categories this tournament runs.
 *
 * They were three fixed strings in the code — beginner, recreational, advanced — so an event
 * wanting an Under-12 section, a Schools field, or one Open category could not have one
 * without a redeploy. This is that list, editable, stored on the event.
 *
 * Removing a category somebody is already entered in is refused by the database rather than
 * here: it would leave their registration pointing at something that no longer exists, and
 * they would disappear from every roster and pairing screen that groups by category. The
 * refusal says so, and says to rename instead — renaming keeps the id and moves nobody.
 */
function CategoriesCard({ eventId, by }: { eventId: string; by: string }) {
  const { categories, loaded, reload } = useEventCategories(eventId);

  /* `null` means "not edited yet", so the saved list shows through without being copied into
     state in an effect — the same render-time fallback the table plan uses. */
  const [draft, setDraft] = React.useState<Division[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const rows = draft ?? categories;
  const dirty = draft !== null;

  const edit = (i: number, patch: Partial<Division>) =>
    setDraft(rows.map((c, n) => (n === i ? { ...c, ...patch } : c)));

  const add = () =>
    setDraft([...rows, { id: "", name: "", shortName: "", accent: "primary" }]);

  const remove = (i: number) => setDraft(rows.filter((_, n) => n !== i));

  const save = async () => {
    setSaving(true);
    setError(null);

    /* An id is what every registration and game row stores, so it is generated from the name
       only while it is blank — editing a name must never silently re-point existing entrants
       at a different category. */
    const cleaned = rows.map((c) => ({
      ...c,
      name: c.name.trim(),
      id: c.id.trim() || c.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      shortName: c.shortName.trim() || c.name.trim().slice(0, 3).toUpperCase(),
    }));

    const out = await writeEventCategories(eventId, cleaned, by);
    setSaving(false);

    if (!out.ok) {
      setError(out.message ?? "Not saved.");
      return;
    }
    setDraft(null);
    reload();
  };

  return (
    <Card>
      <CardHeader
        title="Categories"
        subtitle="The sections this tournament runs. Players are paired and ranked within their own."
      />
      <div className="space-y-3 px-5 pb-5">
        {!loaded ? (
          <div className="h-24 animate-pulse rounded-feature bg-[rgb(var(--c-surface-soft))]" />
        ) : (
          <>
            {rows.map((c, i) => (
              <div key={i} className="flex items-end gap-2">
                <Field label={i === 0 ? "Name" : ""} className="flex-1">
                  <Input
                    value={c.name}
                    placeholder="e.g. Under 12"
                    onChange={(e) => edit(i, { name: e.target.value })}
                  />
                </Field>
                <Field label={i === 0 ? "Short" : ""} className="w-[92px]">
                  <Input
                    value={c.shortName}
                    placeholder="U12"
                    onChange={(e) => edit(i, { shortName: e.target.value })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-1"
                  disabled={rows.length === 1}
                  title={rows.length === 1 ? "A tournament needs at least one category" : "Remove"}
                  onClick={() => remove(i)}
                >
                  <XCircle className="size-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={add}>
                Add a category
              </Button>
              {dirty ? (
                <>
                  <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
                    {saving ? "Saving…" : "Save categories"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      setDraft(null);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : null}
            </div>

            {error ? (
              <p className="rounded-control bg-critical-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-critical">
                {error}
              </p>
            ) : (
              <p className="text-[12px] leading-relaxed text-muted">
                Renaming a category keeps everybody in it. Removing one is refused while
                anybody is still entered in it — move them first.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * The event's own details.
 *
 * This card used to be five fields that changed nothing: Name and Total rounds wrote to a
 * browser-only store no Supabase-backed screen has read since this app moved to Postgres, and
 * Organizer, City and Time zone had no handler attached at all — typing in them did not even
 * reach the dead store. It has looked editable for the whole life of the app.
 *
 * Rounds and round length are not here on purpose. They belong to the day and are set on Live
 * Event, where a director changes them with the room in front of them.
 */
function EventDetailsCard({
  eventId,
  by,
  onSaved,
}: {
  eventId: string;
  by: string;
  onSaved: () => void;
}) {
  const { event, loaded, reload } = useEventDetails(eventId);

  const [draft, setDraft] = React.useState<{ name: string; subtitle: string; details: EventDetails } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const current = {
    name: event?.name ?? "",
    subtitle: event?.subtitle ?? "",
    details: event?.details ?? ({ startDate: "" } as EventDetails),
  };
  const form = draft ?? current;

  const set = (patch: Partial<typeof form>) => setDraft({ ...form, ...patch });
  const setDetail = (patch: Partial<EventDetails>) =>
    setDraft({ ...form, details: { ...form.details, ...patch } });

  const save = async () => {
    setSaving(true);
    setError(null);
    const out = await writeEventDetails(eventId, form, by);
    setSaving(false);

    if (!out.ok) {
      setError(out.message ?? "Not saved.");
      return;
    }
    setDraft(null);
    reload();
    /* The nav picker shows event names, so a rename has to reach it too. */
    onSaved();
  };

  return (
    <Card>
      <CardHeader title="Event details" subtitle="Everything the public page and every message say about it" />
      <div className="grid gap-3.5 px-5 pb-5 sm:grid-cols-2">
        {!loaded ? (
          <div className="sm:col-span-2 h-40 animate-pulse rounded-feature bg-[rgb(var(--c-surface-soft))]" />
        ) : (
          <>
            <Field label="Name" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Subtitle" className="sm:col-span-2" hint="Shown under the name on the public page.">
              <Input value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.details.startDate ?? ""}
                onChange={(e) => setDetail({ startDate: e.target.value })}
              />
            </Field>
            <Field label="Venue">
              <Input
                value={form.details.venueName ?? ""}
                onChange={(e) => setDetail({ venueName: e.target.value })}
              />
            </Field>
            <Field label="Starts">
              <Input
                type="time"
                value={form.details.startTime ?? ""}
                onChange={(e) => setDetail({ startTime: e.target.value })}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="time"
                value={form.details.endTime ?? ""}
                onChange={(e) => setDetail({ endTime: e.target.value })}
              />
            </Field>
            <Field label="City">
              <Input
                value={form.details.city ?? ""}
                onChange={(e) => setDetail({ city: e.target.value })}
              />
            </Field>
            <Field label="Entry fee" hint="Per player, in the event's own currency.">
              <Input
                type="number"
                className="num"
                value={form.details.fee ?? 0}
                onChange={(e) => setDetail({ fee: Number(e.target.value) })}
              />
            </Field>

            {/*
              The three blocks of text the registration form prints verbatim. They were
              readable on the form and editable nowhere, which meant changing a bank
              account or a refund rule was a code change. Blank hides the block rather
              than printing an empty heading, so leaving one empty is a way to turn it off.
            */}
            <Field
              label="Registration fees"
              className="sm:col-span-2"
              hint="Shown on the form above the payment question. Leave empty to show nothing."
            >
              <Textarea
                rows={5}
                value={form.details.feeDetails ?? ""}
                onChange={(e) => setDetail({ feeDetails: e.target.value })}
                placeholder="Regular — Rs 1,000 per head"
              />
            </Field>
            <Field
              label="Payment details"
              className="sm:col-span-2"
              hint="Shown on the form once somebody chooses to pay online."
            >
              <Textarea
                rows={5}
                value={form.details.paymentInstructions ?? ""}
                onChange={(e) => setDetail({ paymentInstructions: e.target.value })}
                placeholder="Bank name, account title, account number, IBAN"
              />
            </Field>
            <Field
              label="Terms"
              className="sm:col-span-2"
              hint="Shown on the form above the box somebody ticks to agree."
            >
              <Textarea
                rows={4}
                value={form.details.terms ?? ""}
                onChange={(e) => setDetail({ terms: e.target.value })}
                placeholder="Refunds, cancellations, late arrival"
              />
            </Field>

            {error ? (
              <p className="sm:col-span-2 rounded-control bg-critical-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-critical">
                {error}
              </p>
            ) : null}

            {draft ? (
              <div className="sm:col-span-2 flex gap-2">
                <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save details"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <p className="sm:col-span-2 text-[12px] text-muted">
                Rounds and round length are set on Live Event, with the room in front of you.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * The rules a round is paired under.
 *
 * These were constants in a seed file — the rules a tournament runs by, differing between
 * events, with no way to change them short of editing code and redeploying.
 */
function PairingRulesCard({ eventId, by }: { eventId: string; by: string }) {
  const { rules, loaded, reload } = useEventDetails(eventId);

  const [draft, setDraft] = React.useState<PairingRules | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = draft ?? rules;

  const save = async (next: PairingRules) => {
    setSaving(true);
    setError(null);
    const out = await writePairingRules(eventId, next, by);
    setSaving(false);

    if (!out.ok) {
      setError(out.message ?? "Not saved.");
      return;
    }
    setDraft(null);
    reload();
  };

  return (
    <Card>
      <CardHeader title="Pairing rules" subtitle="How the engine decides who plays whom" />
      <div className="px-5 pb-5">
        {!loaded ? (
          <div className="h-32 animate-pulse rounded-feature bg-[rgb(var(--c-surface-soft))]" />
        ) : (
          <>
            <div className="divide-y divide-line">
              <Toggle
                checked={form.avoidRepeatOpponents}
                disabled={saving}
                onChange={() => void save({ ...form, avoidRepeatOpponents: !form.avoidRepeatOpponents })}
                label="Avoid repeat opponents"
                description="Never put the same two players together twice while any alternative exists. Off, the engine pairs on standings alone and rematches happen freely."
              />
              <Toggle
                checked={form.avoidSameClub}
                disabled={saving}
                onChange={() => void save({ ...form, avoidSameClub: !form.avoidSameClub })}
                label="Keep clubmates apart"
                description="Only has an effect once players have a club or school recorded against them. Nobody does yet, so this changes nothing today."
              />
            </div>

            <Field
              label="Most byes one player may receive"
              className="mt-3"
              hint="A field with an odd number of players has to sit somebody out, so this is at least one."
            >
              <Input
                type="number"
                min={1}
                max={5}
                className="num"
                value={form.maxByesPerPlayer}
                onChange={(e) => setDraft({ ...form, maxByesPerPlayer: Number(e.target.value) })}
              />
            </Field>

            {draft ? (
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" disabled={saving} onClick={() => void save(form)}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 rounded-control bg-critical-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-critical">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
