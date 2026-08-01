"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Accessibility,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Printer,
  QrCode,
  ScanLine,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  SearchInput,
  Select,
  Tabs,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { Player } from "@/lib/domain/types";
import { cn, formatTime } from "@/lib/utils";
import { KioskMode } from "@/components/checkin/KioskMode";
import { Maximize2 } from "lucide-react";

export default function CheckInPage() {
  return (
    <React.Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-[rgb(var(--c-surface-soft))]" />}>
      <CheckInView />
    </React.Suspense>
  );
}

function CheckInView() {
  const params = useSearchParams();
  const store = useStore();
  const { players, divisions } = store;

  const [query, setQuery] = React.useState("");
  const [method, setMethod] = React.useState("qr");
  const [scanning, setScanning] = React.useState(false);
  const [justChecked, setJustChecked] = React.useState<Player | null>(null);
  const [cardPlayer, setCardPlayer] = React.useState<Player | null>(null);
  const [lateOpen, setLateOpen] = React.useState(params.get("late") === "1");
  const [kiosk, setKiosk] = React.useState(false);

  const checkedIn = players.filter((p) => p.checkIn === "checked-in");
  const notArrived = players.filter((p) => p.checkIn === "not-arrived");
  const late = players.filter((p) => p.checkIn === "late");
  const absent = players.filter((p) => p.checkIn === "absent");
  const withdrawn = players.filter((p) => p.checkIn === "withdrawn");
  const assistance = players.filter((p) => p.accommodation);

  const recent = React.useMemo(
    () =>
      [...checkedIn]
        .filter((p) => p.checkInAt)
        .sort((a, b) => (b.checkInAt ?? "").localeCompare(a.checkInAt ?? ""))
        .slice(0, 10),
    [checkedIn],
  );

  const searchResults = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.playerId.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, players]);

  /** Simulates a QR scan by checking in the next player who has not arrived. */
  const simulateScan = () => {
    if (!store.requireCapability("checkin.manage")) return;
    const target = late[0] ?? notArrived[0] ?? absent[0];
    if (!target) {
      store.toast({
        title: "Everyone is checked in",
        description: "There are no outstanding players to scan.",
        tone: "info",
      });
      return;
    }
    setScanning(true);
    window.setTimeout(() => {
      store.checkInPlayer(target.id, "QR code");
      setScanning(false);
      setJustChecked(target);
      window.setTimeout(() => setJustChecked(null), 4200);
    }, 1150);
  };

  const checkIn = (p: Player, how: string) => {
    if (!store.requireCapability("checkin.manage")) return;
    store.checkInPlayer(p.id, how);
    setJustChecked(p);
    setQuery("");
    window.setTimeout(() => setJustChecked(null), 4200);
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Check-in Centre"
        badge={
          <Badge tone={checkedIn.length === players.length ? "success" : "warning"} dot>
            {checkedIn.length} / {players.length} checked in
          </Badge>
        }
        subtitle="Verify players quickly by QR code, name or player ID."
        actions={
          <>
            <Button variant="secondary" icon={<Clock className="size-4" />} onClick={() => setLateOpen(true)}>
              Late player workflow
            </Button>
            <Button variant="primary" icon={<Maximize2 className="size-4" />} onClick={() => setKiosk(true)}>
              Open kiosk mode
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* LEFT — scanner ------------------------------------------------ */}
        <div className="xl:col-span-4">
          <Card data-tour="qr-scanner">
            <CardHeader
              title="Check in a player"
              subtitle="Scan a badge or search by name"
              icon={<ScanLine className="size-4.5" />}
            />
            <div className="px-5 pb-5">
              <Tabs
                tabs={[
                  { id: "qr", label: "QR code" },
                  { id: "search", label: "Search" },
                  { id: "bulk", label: "Bulk" },
                ]}
                value={method}
                onChange={setMethod}
                className="mb-3"
              />

              {method === "qr" ? (
                <>
                  <div
                    className={cn(
                      "relative grid aspect-square w-full place-items-center overflow-hidden rounded-card border-2 border-dashed",
                      scanning ? "border-primary bg-primary-050/40" : "border-line-strong bg-[rgb(var(--c-surface-soft))]",
                    )}
                  >
                    <div className="board-motif absolute inset-0 opacity-60" aria-hidden />
                    <QrCode className={cn("relative size-24", scanning ? "text-primary" : "text-faint")} />
                    {scanning ? (
                      <motion.div
                        initial={{ top: "8%" }}
                        animate={{ top: ["8%", "88%", "8%"] }}
                        transition={{ duration: 1.15, ease: "easeInOut" }}
                        className="absolute inset-x-6 h-0.5 rounded-full bg-primary shadow-[0_0_12px_rgba(109,93,251,0.7)]"
                      />
                    ) : null}
                    {/* Corner brackets */}
                    {["left-4 top-4 border-l-2 border-t-2", "right-4 top-4 border-r-2 border-t-2",
                      "left-4 bottom-4 border-b-2 border-l-2", "right-4 bottom-4 border-b-2 border-r-2"].map((c) => (
                      <span key={c} className={cn("absolute size-7 rounded-[6px] border-primary/60", c)} />
                    ))}
                  </div>

                  <Button
                    variant="primary"
                    className="mt-3 w-full"
                    loading={scanning}
                    onClick={simulateScan}
                    icon={<ScanLine className="size-4" />}
                  >
                    {scanning ? "Reading badge…" : "Scan player badge"}
                  </Button>
                  <p className="mt-2 text-center text-[12px] text-muted">
                    Point the camera at the QR code on the player badge.
                  </p>
                </>
              ) : method === "search" ? (
                <>
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Name, player ID or club"
                  />
                  <div className="mt-2 space-y-1.5">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2.5 rounded-control border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] px-3 py-2"
                      >
                        <Avatar initials={p.initials} hue={p.avatarHue} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{p.fullName}</p>
                          <p className="truncate text-[11.5px] text-muted">
                            {p.playerId} · {p.division}
                          </p>
                        </div>
                        {p.checkIn === "checked-in" ? (
                          <Badge tone="success" dot>In</Badge>
                        ) : (
                          <Button size="sm" variant="primary" onClick={() => checkIn(p, "name search")}>
                            Check in
                          </Button>
                        )}
                      </div>
                    ))}
                    {query && searchResults.length === 0 ? (
                      <p className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-3 text-center text-[12.5px] text-muted">
                        No player matches that search.
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <BulkCheckIn />
              )}
            </div>
          </Card>
        </div>

        {/* CENTER — recent ---------------------------------------------- */}
        <div className="xl:col-span-4">
          {justChecked ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 rounded-card border border-success/30 bg-success-050/70 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success text-white">
                  <CheckCircle2 className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{justChecked.fullName} checked in</p>
                  <p className="text-[12.5px] text-muted">
                    {justChecked.playerId} · {justChecked.division.replace(/-/g, " ")} ·{" "}
                    {justChecked.payment === "paid" ? "Payment confirmed" : `Payment ${justChecked.payment}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setCardPlayer(justChecked)}>
                  View player card
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Printer className="size-3.5" />}
                  onClick={() =>
                    store.toast({
                      title: "Player card sent to printer",
                      description: `${justChecked.fullName}'s badge is printing.`,
                      tone: "success",
                    })
                  }
                >
                  Print card
                </Button>
              </div>
            </motion.div>
          ) : null}

          <Card>
            <CardHeader
              title="Recently checked in"
              subtitle={`${checkedIn.length} players verified`}
              icon={<UserCheck className="size-4.5" />}
            />
            <div className="max-h-[460px] space-y-1.5 overflow-y-auto px-4 pb-4 scroll-slim">
              {recent.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCardPlayer(p)}
                  className="flex w-full items-center gap-2.5 rounded-control border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] px-3 py-2 text-left hover:bg-[rgb(var(--c-surface-strong))]"
                >
                  <Avatar initials={p.initials} hue={p.avatarHue} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.fullName}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {p.playerId} · {p.division.replace(/-/g, " ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] text-muted">{formatTime(p.checkInAt)}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT — attendance summary ------------------------------------ */}
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader
              title="Attendance summary"
              subtitle={`${Math.round((checkedIn.length / players.length) * 100)}% of the field verified`}
              icon={<Users className="size-4.5" />}
            />
            <div className="px-5 pb-5">
              <Progress
                value={(checkedIn.length / players.length) * 100}
                tone="success"
                label="Checked in"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SummaryTile label="Checked in" value={checkedIn.length} tone="success" />
                <SummaryTile label="Not arrived" value={notArrived.length} tone="neutral" />
                <SummaryTile label="Late" value={late.length} tone="warning" />
                <SummaryTile label="Absent" value={absent.length} tone="critical" />
                <SummaryTile label="Withdrawn" value={withdrawn.length} tone="critical" />
                <SummaryTile label="Assistance" value={assistance.length} tone="info" />
              </div>

              <div className="mt-3 space-y-1.5">
                {divisions.map((d) => {
                  const inDiv = players.filter((p) => p.division === d.id);
                  const done = inDiv.filter((p) => p.checkIn === "checked-in").length;
                  return (
                    <div key={d.id} className="rounded-control bg-[rgb(var(--c-surface))] px-3 py-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12.5px] text-ink">{d.name}</span>
                        <span className="text-[12px] text-muted num">
                          {done}/{inDiv.length}
                        </span>
                      </div>
                      <Progress value={(done / inDiv.length) * 100} className="mt-1.5 h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Exceptions"
              subtitle="Players needing a decision"
              icon={<UserX className="size-4.5" />}
            />
            <div className="max-h-[280px] space-y-1.5 overflow-y-auto px-4 pb-4 scroll-slim">
              {[...late, ...absent, ...withdrawn].length === 0 ? (
                <p className="rounded-control bg-success-050/60 px-3 py-3 text-center text-[12.5px] text-[#1b8f68]">
                  No outstanding exceptions.
                </p>
              ) : (
                [...late, ...absent, ...withdrawn].map((p) => (
                  <div
                    key={p.id}
                    className="rounded-control border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={p.initials} hue={p.avatarHue} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{p.fullName}</p>
                        <p className="truncate text-[11.5px] text-muted">
                          {p.playerId}
                          {p.expectedArrival ? ` · expected ${formatTime(p.expectedArrival)}` : ""}
                        </p>
                      </div>
                      <Badge tone={p.checkIn === "late" ? "warning" : "critical"} dot>
                        {p.checkIn}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => checkIn(p, "manual check-in")}>
                        Check in
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          store.setPlayerStatus(p.id, "withdrawn", "Withdrawn at check-in desk");
                          store.toast({
                            title: "Player withdrawn",
                            description: `${p.fullName} will not be paired in future rounds.`,
                            tone: "warning",
                          });
                        }}
                      >
                        Withdraw
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {assistance.length > 0 ? (
            <Card>
              <CardHeader
                title="Special assistance"
                subtitle="Honoured by the pairing engine"
                icon={<Accessibility className="size-4.5" />}
              />
              <ul className="space-y-1.5 px-4 pb-4">
                {assistance.slice(0, 5).map((p) => (
                  <li key={p.id} className="rounded-control bg-warning-050/60 px-3 py-2">
                    <p className="text-[12.5px] font-medium text-ink">{p.fullName}</p>
                    <p className="text-[11.5px] text-[#b4741f]">{p.accommodation}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {kiosk ? <KioskMode onExit={() => setKiosk(false)} /> : null}

      <PlayerCardDrawer player={cardPlayer} onClose={() => setCardPlayer(null)} />
      <LatePlayerModal open={lateOpen} onClose={() => setLateOpen(false)} />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "critical" | "neutral" | "info";
}) {
  return (
    <div
      className={cn(
        "rounded-control px-3 py-2",
        tone === "success" && "bg-success-050/70",
        tone === "warning" && "bg-warning-050/70",
        tone === "critical" && "bg-critical-050/70",
        tone === "info" && "bg-secondary-050/70",
        tone === "neutral" && "bg-[rgb(var(--c-surface))]",
      )}
    >
      <p className="text-[19px] font-semibold text-ink num">{value}</p>
      <p className="text-[11.5px] text-muted">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function BulkCheckIn() {
  const store = useStore();
  const { players } = store;
  const [club, setClub] = React.useState("");

  const clubs = React.useMemo(
    () => [...new Set(players.map((p) => p.club))].sort(),
    [players],
  );
  const pending = players.filter((p) => p.club === club && p.checkIn !== "checked-in");

  return (
    <div className="space-y-3">
      <Field label="Team, club or school">
        <Select value={club} onChange={(e) => setClub(e.target.value)}>
          <option value="">Select an organization…</option>
          {clubs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>

      {club ? (
        <div className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-3">
          <p className="text-[13px] text-ink">
            {pending.length} player{pending.length === 1 ? "" : "s"} from {club} still to check in.
          </p>
        </div>
      ) : null}

      <Button
        variant="primary"
        className="w-full"
        disabled={!club || pending.length === 0}
        onClick={() => {
          if (!store.requireCapability("checkin.manage")) return;
          pending.forEach((p) => store.checkInPlayer(p.id, "bulk school check-in"));
          store.toast({
            title: "Bulk check-in complete",
            description: `${pending.length} players from ${club} were checked in.`,
            tone: "success",
          });
        }}
      >
        Check in {pending.length || ""} player{pending.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PlayerCardDrawer({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const store = useStore();
  if (!player) return null;

  return (
    <Drawer
      open={!!player}
      onClose={onClose}
      title="Digital player card"
      subtitle={player.fullName}
      width="md"
      footer={
        <Button
          variant="primary"
          className="w-full"
          icon={<Printer className="size-4" />}
          onClick={() =>
            store.toast({
              title: "Player card sent to printer",
              description: `${player.fullName}'s badge is printing.`,
              tone: "success",
            })
          }
        >
          Print player card
        </Button>
      }
    >
      <div className="overflow-hidden rounded-card border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-strong))]">
        <div className="board-motif relative bg-primary/95 px-5 py-4 text-white">
          <p className="text-[11px] uppercase tracking-[0.08em] opacity-85">
            Pakistan National Scrabble Championship 2026
          </p>
          <p className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">{player.fullName}</p>
          <p className="text-[12.5px] opacity-90">{player.playerId}</p>
        </div>

        <div className="flex items-center gap-4 p-5">
          <Avatar initials={player.initials} hue={player.avatarHue} size={64} />
          <div className="min-w-0 flex-1 space-y-1 text-[12.5px]">
            <p className="text-ink">
              <span className="text-muted">Division:</span>{" "}
              <span className="capitalize">{player.division.replace(/-/g, " ")}</span>
            </p>
            <p className="text-ink">
              <span className="text-muted">Rating:</span> {player.rating || "Unrated"}
            </p>
            <p className="text-ink">
              <span className="text-muted">Seed:</span> {player.seed}
            </p>
            <p className="text-ink">
              <span className="text-muted">Club:</span> {player.club}
            </p>
          </div>
          <span className="grid size-16 shrink-0 place-items-center rounded-control border border-line-strong">
            <QrCode className="size-12 text-ink" />
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
          <Badge tone={player.checkIn === "checked-in" ? "success" : "warning"} dot>
            {player.checkIn.replace(/-/g, " ")}
          </Badge>
          <Badge tone={player.payment === "paid" ? "success" : "warning"}>
            Payment {player.payment}
          </Badge>
          {player.accommodation ? <Badge tone="info">Assistance required</Badge> : null}
        </div>
      </div>

      {player.accommodation ? (
        <p className="mt-3 rounded-control bg-warning-050 px-3.5 py-2.5 text-[12.5px] text-[#b4741f]">
          {player.accommodation}
        </p>
      ) : null}

      <div className="mt-3 rounded-compact bg-[rgb(var(--c-surface))] p-4">
        <p className="text-[13px] font-semibold text-ink">Emergency contact</p>
        <p className="mt-1 text-[12.5px] text-muted">
          {player.emergencyContact.name} ({player.emergencyContact.relationship}) ·{" "}
          {player.emergencyContact.phone}
        </p>
      </div>
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */

function LatePlayerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { players, tournament } = store;
  const [selected, setSelected] = React.useState("");
  const [arrival, setArrival] = React.useState("13:15");
  const [decision, setDecision] = React.useState<"include" | "withdraw">("include");

  const candidates = players.filter((p) => p.checkIn !== "checked-in");
  const player = players.find((p) => p.id === selected);

  // Preselect the late player the first time the dialog opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open && !selected) {
      const late = players.find((p) => p.checkIn === "late");
      if (late) setSelected(late.id);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Late player workflow"
      subtitle="Record the arrival and decide whether the player joins the next round."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!player}
            onClick={() => {
              if (!player) return;
              if (!store.requireCapability("checkin.manage")) return;
              if (decision === "include") {
                store.checkInPlayer(player.id, "late arrival — director approved");
                store.toast({
                  title: "Late player included",
                  description: `${player.fullName} will be paired in round ${tournament.currentRound + 1}.`,
                  tone: "success",
                });
              } else {
                store.setPlayerStatus(player.id, "withdrawn", "Late arrival — director withdrew player");
                store.toast({
                  title: "Player withdrawn",
                  description: `${player.fullName} was withdrawn from the tournament.`,
                  tone: "warning",
                });
              }
              onClose();
            }}
          >
            Record decision
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Player" required>
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Search for the player…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} — {p.playerId} ({p.checkIn})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Expected arrival time">
          <Input type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </Field>

        <Field label="Director decision" required>
          <Select value={decision} onChange={(e) => setDecision(e.target.value as "include" | "withdraw")}>
            <option value="include">Include in round {tournament.currentRound + 1}</option>
            <option value="withdraw">Withdraw from the tournament</option>
          </Select>
        </Field>

        {player ? (
          <div className="rounded-control bg-primary-050/60 px-3.5 py-2.5 text-[12.5px] text-primary-600">
            {decision === "include"
              ? `${player.fullName} will be marked present and included when round ${tournament.currentRound + 1} is generated.`
              : `${player.fullName} will be excluded from all future pairings.`}
          </div>
        ) : null}

        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-faint">
          <BadgeCheck className="mt-px size-3.5 shrink-0" />
          This decision is recorded in the audit log against your name and role.
        </p>
      </div>
    </Modal>
  );
}
