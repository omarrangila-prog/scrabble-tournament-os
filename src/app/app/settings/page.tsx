"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
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
  Toggle,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { useEventSettings, writeEventSettings, type EventSettings } from "@/lib/supabase/useEventSettings";
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
  const { tournament, audit, role } = store;
  const [tab, setTab] = React.useState("general");
  const [auditQuery, setAuditQuery] = React.useState("");
  const [resetOpen, setResetOpen] = React.useState(false);

  const filteredAudit = audit.filter((a) => {
    const q = auditQuery.trim().toLowerCase();
    return (
      !q ||
      a.action.toLowerCase().includes(q) ||
      a.target.toLowerCase().includes(q) ||
      a.user.toLowerCase().includes(q)
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
          { id: "audit", label: "Audit log", count: audit.length },
          { id: "data", label: "Data & backup" },
          { id: "help", label: "Help" },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "general" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Tournament" subtitle="Basic details for the active event" />
            <div className="grid gap-3.5 px-5 pb-5 sm:grid-cols-2">
              <Field label="Name" className="sm:col-span-2">
                <Input
                  defaultValue={tournament.name}
                  onBlur={(e) => store.updateTournament({ name: e.target.value })}
                />
              </Field>
              <Field label="Organizer">
                <Input defaultValue={tournament.organizer} />
              </Field>
              <Field label="City">
                <Input defaultValue={tournament.city} />
              </Field>
              <Field label="Time zone">
                <Input defaultValue={tournament.timeZone} />
              </Field>
              <Field label="Total rounds">
                <Input
                  type="number"
                  defaultValue={tournament.totalRounds}
                  className="num"
                  onBlur={(e) => store.updateTournament({ totalRounds: Number(e.target.value) })}
                />
              </Field>
            </div>
          </Card>

          <EventSettingsCard by={store.currentUser?.name ?? "Director"} />
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
            subtitle="Every significant action, with the user, role, values changed and reason"
            icon={<History className="size-4.5" />}
            action={
              <div className="flex gap-2">
                <SearchInput value={auditQuery} onChange={setAuditQuery} placeholder="Search actions" className="w-48" />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="size-3.5" />}
                  onClick={() => {
                    const rows: (string | number)[][] = [
                      ["Time", "User", "Role", "Action", "Target", "Previous", "New", "Reason", "Device"],
                      ...filteredAudit.map((a) => [
                        formatDateTime(a.at), a.user, a.role, a.action, a.target,
                        a.previousValue ?? "", a.newValue ?? "", a.reason ?? "", a.device,
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
            <TableWrap className="max-h-[64vh]">
              <thead>
                <tr>
                  <Th className="w-40">Date and time</Th>
                  <Th className="w-32">User</Th>
                  <Th className="w-28">Role</Th>
                  <Th className="w-44">Action</Th>
                  <Th className="w-40">Target</Th>
                  <Th className="w-32">Previous value</Th>
                  <Th className="w-32">New value</Th>
                  <Th className="min-w-[200px]">Reason</Th>
                  <Th className="w-36">Device</Th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.map((a) => (
                  <tr key={a.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                    <Td className="whitespace-nowrap">{formatDateTime(a.at)}</Td>
                    <Td className="font-medium">{a.user}</Td>
                    <Td className="capitalize text-muted">{a.role}</Td>
                    <Td>{a.action}</Td>
                    <Td className="text-muted">{a.target}</Td>
                    <Td className="text-muted">{a.previousValue ?? "—"}</Td>
                    <Td>{a.newValue ?? "—"}</Td>
                    <Td className="text-muted">{a.reason ?? "—"}</Td>
                    <Td className="text-muted">{a.device}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </Card>
      ) : null}

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
function EventSettingsCard({ by }: { by: string }) {
  const eventSettings = useEventSettings(ACTIVE_EVENT_ID);
  const [saving, setSaving] = React.useState<string | null>(null);

  const flip = async (key: keyof EventSettings, label: string) => {
    setSaving(key);
    const result = await writeEventSettings(
      ACTIVE_EVENT_ID,
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
          description="Record who plays first and who plays second on each board."
        />
      </div>
    </Card>
  );
}
