"use client";

import * as React from "react";
import {
  Accessibility,
  AlertTriangle,
  ArrowRightLeft,
  DoorOpen,
  Grid3x3,
  HeartHandshake,
  LifeBuoy,
  MapPinned,
  Users,
} from "lucide-react";
import {
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
import { PermissionDenied } from "@/components/ui/states";
import { useStore } from "@/lib/store/useStore";
import { Pairing } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Venue zones. Board ranges map the physical hall onto board numbers. */
const ZONES = [
  { id: "main", name: "Main Hall", from: 1, to: 20, accent: "#7357F6", accessible: true },
  { id: "blue", name: "Blue Hall", from: 21, to: 44, accent: "#3987F8", accessible: false },
  { id: "youth", name: "Youth Hall", from: 45, to: 64, accent: "#38C89A", accessible: false },
  { id: "accessible", name: "Accessible Area", from: 1, to: 20, accent: "#E6A93D", accessible: true },
] as const;

const FACILITIES = [
  { name: "Score Desk", icon: Grid3x3, detail: "Beside Main Hall entrance" },
  { name: "Help Desk", icon: LifeBuoy, detail: "Foyer, left of reception" },
  { name: "Parent Waiting Area", icon: HeartHandshake, detail: "Adjacent to Youth Hall" },
  { name: "Emergency Exit", icon: DoorOpen, detail: "Four marked exits" },
];

type BoardStatus =
  | "available"
  | "assigned"
  | "seated"
  | "live"
  | "awaiting"
  | "completed"
  | "assistance"
  | "unavailable";

const STATUS_LABEL: Record<BoardStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  seated: "Seated",
  live: "Live",
  awaiting: "Awaiting Result",
  completed: "Completed",
  assistance: "Assistance Requested",
  unavailable: "Unavailable",
};

const STATUS_TONE: Record<BoardStatus, "neutral" | "primary" | "success" | "warning" | "critical" | "info"> = {
  available: "neutral",
  assigned: "info",
  seated: "primary",
  live: "success",
  awaiting: "warning",
  completed: "neutral",
  assistance: "warning",
  unavailable: "critical",
};

export default function VenuePage() {
  const store = useStore();
  const { players, pairings, tournament, venue } = store;

  const [view, setView] = React.useState("map");
  const [query, setQuery] = React.useState("");
  const [zone, setZone] = React.useState("all");
  const [dragging, setDragging] = React.useState<Pairing | null>(null);
  const [dropTarget, setDropTarget] = React.useState<number | null>(null);
  const [reassign, setReassign] = React.useState<{ pairing: Pairing; board: number } | null>(null);
  const [invalidMessage, setInvalidMessage] = React.useState<string | null>(null);

  const roundPairings = React.useMemo(
    () =>
      pairings
        .filter((p) => p.round === tournament.currentRound && p.playerBId !== null)
        .sort((a, b) => a.board - b.board),
    [pairings, tournament.currentRound],
  );

  const playerOf = (id: string | null) => (id ? players.find((p) => p.id === id) : undefined);
  const nameOf = (id: string | null) => playerOf(id)?.fullName ?? "—";

  const boardMap = React.useMemo(() => {
    const m = new Map<number, Pairing>();
    for (const p of roundPairings) m.set(p.board, p);
    return m;
  }, [roundPairings]);

  const zoneOf = (board: number) =>
    ZONES.find((z) => z.id !== "accessible" && board >= z.from && board <= z.to) ?? ZONES[0];

  /** Board status derived from the pairing and any accessibility requirement. */
  const statusOf = (board: number): BoardStatus => {
    const p = boardMap.get(board);
    if (!p) return board > venue.totalBoards ? "unavailable" : "available";
    const needsAssist = [p.playerAId, p.playerBId].some((id) =>
      playerOf(id)?.accommodation?.toLowerCase().includes("wheelchair"),
    );
    if (needsAssist && !venue.accessibleBoards.includes(board)) return "assistance";
    if (p.status === "verified") return "completed";
    if (p.status === "awaiting-verification") return "awaiting";
    if (p.status === "live") return "live";
    return "assigned";
  };

  const boards = React.useMemo(
    () => Array.from({ length: venue.totalBoards }, (_, i) => i + 1),
    [venue.totalBoards],
  );

  const visibleBoards = boards.filter((b) => {
    if (zone !== "all" && zoneOf(b).id !== zone) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const p = boardMap.get(b);
    return (
      String(b) === q ||
      (p && (nameOf(p.playerAId).toLowerCase().includes(q) || nameOf(p.playerBId).toLowerCase().includes(q)))
    );
  });

  /** A drop is valid when the destination is free and meets accessibility needs. */
  const validateDrop = (pairing: Pairing, board: number): string | null => {
    if (board === pairing.board) return null;
    if (boardMap.has(board)) return `Board ${board} is already in use this round.`;
    if (board > venue.totalBoards) return `Board ${board} is not available at this venue.`;
    const needsAccess = [pairing.playerAId, pairing.playerBId].some((id) =>
      playerOf(id)?.accommodation?.toLowerCase().includes("wheelchair"),
    );
    if (needsAccess && !venue.accessibleBoards.includes(board)) {
      return `This pairing needs a step-free board. Board ${board} is not in the accessible area.`;
    }
    return null;
  };

  const exceptions = boards
    .map((b) => ({ board: b, status: statusOf(b) }))
    .filter((x) => x.status === "assistance" || x.status === "unavailable");

  return (
    <div>
      <PageHeader
        title="Seating & Venue"
        badge={<Badge tone="primary">{venue.totalBoards} boards</Badge>}
        subtitle={`${venue.name} · drag a game onto a free board to reassign it. Every move is recorded.`}
        actions={
          <Button
            variant="secondary"
            icon={<Grid3x3 className="size-4" />}
            onClick={() => setView("grid")}
          >
            Board grid
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Tabs
          tabs={[
            { id: "map", label: "Venue Map" },
            { id: "grid", label: "Board Grid", count: visibleBoards.length },
            { id: "list", label: "Player List", count: roundPairings.length },
            { id: "exceptions", label: "Exceptions", count: exceptions.length },
          ]}
          value={view}
          onChange={setView}
          className="flex-1"
        />
        <div className="flex flex-col gap-2 sm:flex-row lg:w-[440px]">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Board number or player"
            className="flex-1"
          />
          <Select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone" className="sm:w-44">
            <option value="all">All zones</option>
            {ZONES.filter((z) => z.id !== "accessible").map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {invalidMessage ? (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2.5 rounded-compact border border-critical/25 bg-critical-050 px-4 py-3"
        >
          <AlertTriangle className="size-4 shrink-0 text-critical" />
          <p className="flex-1 text-[13px] text-ink">{invalidMessage}</p>
          <button
            onClick={() => setInvalidMessage(null)}
            className="text-[12.5px] font-semibold text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* VENUE MAP                                                         */}
      {/* ---------------------------------------------------------------- */}
      {view === "map" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Venue layout"
              subtitle={`${venue.name}, ${tournament.city}`}
              icon={<MapPinned className="size-4.5" />}
            />
            <div className="px-5 pb-5">
              <div className="board-motif relative overflow-hidden rounded-feature border border-line p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {ZONES.filter((z) => z.id !== "accessible").map((z) => {
                    const inZone = boards.filter((b) => zoneOf(b).id === z.id);
                    const occupied = inZone.filter((b) => boardMap.has(b)).length;
                    return (
                      <button
                        key={z.id}
                        onClick={() => {
                          setZone(z.id);
                          setView("grid");
                        }}
                        className="rounded-compact border border-line bg-[rgb(var(--c-surface-strong))] p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--sh-card-hover)]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-[14px] font-bold text-ink">
                            <span className="size-2.5 rounded-full" style={{ background: z.accent }} />
                            {z.name}
                          </span>
                          {z.accessible ? (
                            <Accessibility className="size-4 text-success" aria-label="Step-free access" />
                          ) : null}
                        </div>
                        <p className="num mt-2 text-[22px] font-extrabold tracking-[-0.02em] text-ink">
                          {occupied}
                          <span className="text-[14px] font-semibold text-muted">/{inZone.length}</span>
                        </p>
                        <p className="text-[11.5px] text-muted">
                          Boards {z.from}–{z.to} in use
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {FACILITIES.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center gap-2.5 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2.5"
                    >
                      <f.icon className="size-4 shrink-0 text-muted" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{f.name}</p>
                        <p className="truncate text-[11px] text-muted">{f.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Board status" subtitle="Across the whole venue" />
            <div className="space-y-1.5 px-5 pb-5">
              {(Object.keys(STATUS_LABEL) as BoardStatus[]).map((s) => {
                const count = boards.filter((b) => statusOf(b) === s).length;
                if (count === 0) return null;
                return (
                  <div
                    key={s}
                    className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5"
                  >
                    <Badge tone={STATUS_TONE[s]} dot>
                      {STATUS_LABEL[s]}
                    </Badge>
                    <span className="num text-[14px] font-bold text-ink">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* BOARD GRID                                                        */}
      {/* ---------------------------------------------------------------- */}
      {view === "grid" ? (
        <Card variant="data">
          <CardHeader
            title="Board grid"
            subtitle="Drag a game onto a free board to reassign it"
            icon={<Grid3x3 className="size-4.5" />}
          />
          <div className="p-4 pt-0">
            {visibleBoards.length === 0 ? (
              <EmptyState
                icon={<Grid3x3 className="size-5" />}
                title="No boards match this filter"
                description="Clear the search or choose a different zone."
              />
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {visibleBoards.map((b) => {
                  const pairing = boardMap.get(b);
                  const status = statusOf(b);
                  const z = zoneOf(b);
                  const invalid = dragging ? validateDrop(dragging, b) : null;
                  const isTarget = dropTarget === b;
                  const canDrop = !!dragging && !invalid && b !== dragging.board;

                  return (
                    <div
                      key={b}
                      draggable={!!pairing}
                      onDragStart={() => pairing && setDragging(pairing)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragging) return;
                        e.preventDefault();
                        setDropTarget(b);
                      }}
                      onDragLeave={() => setDropTarget((t) => (t === b ? null : t))}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!dragging) return;
                        const reason = validateDrop(dragging, b);
                        if (reason) {
                          setInvalidMessage(reason);
                        } else if (b !== dragging.board) {
                          setReassign({ pairing: dragging, board: b });
                        }
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      className={cn(
                        "rounded-compact border p-3 transition-all duration-150",
                        pairing ? "cursor-grab active:cursor-grabbing" : "",
                        canDrop && isTarget && "border-success bg-success-050 shadow-[0_0_0_3px_rgba(32,185,130,0.16)]",
                        canDrop && !isTarget && "border-success/35",
                        !!dragging && !!invalid && "border-critical/30 bg-critical-050/40 opacity-70",
                        !dragging && "border-line bg-[rgb(var(--c-surface-strong))] hover:shadow-[var(--sh-card-hover)]",
                        dragging?.board === b && "opacity-40",
                      )}
                      title={invalid ?? undefined}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="num grid size-8 place-items-center rounded-control text-[13px] font-extrabold text-white"
                          style={{ background: z.accent }}
                        >
                          {b}
                        </span>
                        <Badge tone={STATUS_TONE[status]} dot pulse={status === "live"}>
                          {STATUS_LABEL[status]}
                        </Badge>
                      </div>

                      {pairing ? (
                        <div className="mt-2.5 space-y-0.5">
                          <p className="truncate text-[12.5px] font-semibold text-ink">
                            {nameOf(pairing.playerAId)}
                          </p>
                          <p className="truncate text-[12.5px] text-muted">
                            {nameOf(pairing.playerBId)}
                          </p>
                          <p className="mt-1 truncate text-[11px] capitalize text-faint">
                            {pairing.division.replace(/-/g, " ")} · {z.name}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2.5 text-[12px] text-faint">Free · {z.name}</p>
                      )}

                      {status === "assistance" ? (
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#a76d16]">
                          <Accessibility className="size-3" />
                          Needs step-free board
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* PLAYER LIST                                                       */}
      {/* ---------------------------------------------------------------- */}
      {view === "list" ? (
        <Card variant="data">
          <CardHeader
            title="Seated players"
            subtitle={`Round ${tournament.currentRound}`}
            icon={<Users className="size-4.5" />}
          />
          <div className="px-3 pb-4">
            <TableWrap className="max-h-[64vh]">
              <thead>
                <tr>
                  <Th className="w-20">Board</Th>
                  <Th className="w-32">Zone</Th>
                  <Th>Player A</Th>
                  <Th>Player B</Th>
                  <Th className="w-32">Division</Th>
                  <Th className="w-36">Status</Th>
                </tr>
              </thead>
              <tbody>
                {roundPairings
                  .filter((p) => {
                    const q = query.trim().toLowerCase();
                    return (
                      !q ||
                      String(p.board) === q ||
                      nameOf(p.playerAId).toLowerCase().includes(q) ||
                      nameOf(p.playerBId).toLowerCase().includes(q)
                    );
                  })
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-[rgb(var(--c-surface-soft))]">
                      <Td className="num font-bold">{p.board}</Td>
                      <Td className="text-muted">{zoneOf(p.board).name}</Td>
                      <Td>{nameOf(p.playerAId)}</Td>
                      <Td>{nameOf(p.playerBId)}</Td>
                      <Td className="capitalize">{p.division.replace(/-/g, " ")}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[statusOf(p.board)]} dot>
                          {STATUS_LABEL[statusOf(p.board)]}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </TableWrap>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* EXCEPTIONS                                                        */}
      {/* ---------------------------------------------------------------- */}
      {view === "exceptions" ? (
        <Card>
          <CardHeader
            title="Venue exceptions"
            subtitle="Boards needing a decision before the next round"
            icon={<AlertTriangle className="size-4.5" />}
          />
          <div className="space-y-2 px-5 pb-5">
            {exceptions.length === 0 ? (
              <EmptyState
                icon={<Accessibility className="size-5" />}
                title="No venue exceptions"
                description="Every board meets its players' accessibility requirements and all tables are serviceable."
              />
            ) : (
              exceptions.map((x) => {
                const p = boardMap.get(x.board);
                return (
                  <div
                    key={x.board}
                    className="flex flex-wrap items-center gap-3 rounded-compact border border-warning/25 bg-warning-050/50 px-4 py-3"
                  >
                    <span className="num grid size-9 shrink-0 place-items-center rounded-control bg-warning/15 text-[13px] font-extrabold text-[#a76d16]">
                      {x.board}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold text-ink">{STATUS_LABEL[x.status]}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {p
                          ? `${nameOf(p.playerAId)} vs ${nameOf(p.playerBId)} — requires a step-free board in the Accessible Area.`
                          : "This board is not serviceable and should not be assigned."}
                      </p>
                    </div>
                    {p ? (
                      <Button size="sm" variant="secondary" onClick={() => setView("grid")}>
                        Reassign board
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      ) : null}

      <ReassignModal
        request={reassign}
        onClose={() => setReassign(null)}
        nameOf={nameOf}
        zoneName={(b) => zoneOf(b).name}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReassignModal({
  request,
  onClose,
  nameOf,
  zoneName,
}: {
  request: { pairing: Pairing; board: number } | null;
  onClose: () => void;
  nameOf: (id: string | null) => string;
  zoneName: (b: number) => string;
}) {
  const store = useStore();
  const [reason, setReason] = React.useState("");
  const canOverride = store.role === "director";

  const [last, setLast] = React.useState(request);
  if (last !== request) {
    setLast(request);
    setReason("");
  }

  if (!request) return null;
  const { pairing, board } = request;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move board ${pairing.board} to board ${board}`}
      subtitle={`${nameOf(pairing.playerAId)} vs ${nameOf(pairing.playerBId)}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!reason.trim() || !canOverride}
            onClick={() => {
              if (!store.requireCapability("pairings.override")) return;
              store.reassignBoard(pairing.id, board, reason);
              store.toast({
                title: "Board reassigned",
                description: `Moved to board ${board} in the ${zoneName(board)}. Both players were notified.`,
                tone: "success",
              });
              onClose();
            }}
          >
            Confirm move
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="flex items-center gap-3 rounded-compact bg-[rgb(var(--c-surface-soft))] px-3.5 py-3">
          <span className="num grid size-10 place-items-center rounded-control bg-[rgb(var(--c-line))] text-[14px] font-extrabold text-muted">
            {pairing.board}
          </span>
          <ArrowRightLeft className="size-4 shrink-0 text-faint" />
          <span className="num grid size-10 place-items-center rounded-control bg-gradient-to-br from-primary to-secondary text-[14px] font-extrabold text-white">
            {board}
          </span>
          <p className="min-w-0 flex-1 text-[12.5px] text-muted">
            Moving to the {zoneName(board)}.
          </p>
        </div>

        {!canOverride ? (
          <PermissionDenied capability="pairings.override" compact />
        ) : (
          <Field label="Reason for the move" required hint="Recorded in the audit log.">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Table damaged during setup."
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
