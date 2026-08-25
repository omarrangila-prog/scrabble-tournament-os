"use client";

import * as React from "react";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileDown,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import { PlayerDrawer } from "@/components/players/PlayerDrawer";
import { PlayerSearch } from "@/components/profile/PlayerSearch";
import { ALPHABATTLE_PRICES } from "@/lib/domain/eventSeed";
import { divisionFor } from "@/lib/domain/roster";
import type { Player } from "@/lib/domain/types";
import { useStore } from "@/lib/store/useStore";
import { addWalkIn } from "@/lib/supabase/organizer";
import { useRoster } from "@/lib/supabase/useRoster";
import { field, importField, numberField } from "@/lib/supabase/organizer";
import { downloadFile, formatTime, toCsv } from "@/lib/utils";


export default function PlayersPage() {
  return (
    <React.Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-[rgb(var(--c-surface-soft))]" />}>
      <PlayersView />
    </React.Suspense>
  );
}

/**
 * The roster.
 *
 * Reads registrations from the database rather than from browser storage. The old
 * version listed `store.players`, which was filled by demo data; once that was
 * removed it could only ever show an empty table, however many people had signed
 * up. Every column here traces back to a row in Postgres.
 */
function PlayersView() {
  const router = useRouter();
  const params = useSearchParams();
  const store = useStore();
  const { divisions } = store;
  const currentEvent = useCurrentEvent();

  const roster = useRoster(currentEvent.eventId);
  const { players, counts } = roster;

  const [query, setQuery] = React.useState("");
  const [division, setDivision] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [selected, setSelected] = React.useState<Player | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  // Deep link from global search: /app/players?player=<id>
  const deepLinkId = params.get("player");
  const [lastDeepLink, setLastDeepLink] = React.useState<string | null>(null);
  if (deepLinkId && lastDeepLink !== deepLinkId) {
    setLastDeepLink(deepLinkId);
    const p = players.find((x) => x.id === deepLinkId);
    if (p) setSelected(p);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (division !== "all" && p.division !== division) return false;
      if (status !== "all" && p.checkIn !== status) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.playerId.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.emergencyContact.phone.toLowerCase().includes(q)
      );
    });
  }, [players, query, division, status]);

  /*
   * Export what the roster actually knows, keyed by the number that is on the badge.
   *
   * It used to lead with "AB-001", an index into this list — a number that appears on no
   * badge, in no email, on no certificate and nowhere at the desk. Anybody reconciling the
   * spreadsheet against the day had nothing to join on. The player number is the identifier
   * everything else uses, so it is the first column.
   *
   * Rating and club stay absent: nobody has a rating at a first event, and the form never
   * asked for a club, so both columns would be blank in every row.
   */
  const exportCsv = () => {
    const byId = new Map(roster.registrations.map((r) => [r.id, r]));

    const rows: (string | number)[][] = [
      [
        "Player #", "Name", "Mobile", "Email", "Division", "Payment", "Amount (PKR)",
        "Check-in", "Arrived at", "Registered", "Area",
      ],
      ...filtered.map((p) => {
        const reg = byId.get(p.id);
        const number =
          (reg ? importField(reg, "playerNumber") ?? field(reg, "playerNumber") : null) ?? "";
        const amount = reg ? numberField(reg, "amountDue") : null;

        return [
          number,
          p.fullName,
          p.emergencyContact.phone,
          reg?.email ?? "",
          p.division,
          p.payment,
          /* Blank where no amount was ever established. Zero would be a claim. */
          amount === null ? "" : amount,
          p.checkIn,
          p.checkInAt ? formatTime(p.checkInAt) : "",
          p.registeredAt,
          p.city,
        ];
      }),
    ];

    downloadFile("roster.csv", toCsv(rows), "text/csv");
    store.toast({
      title: "Roster exported",
      description: `${filtered.length} ${filtered.length === 1 ? "player" : "players"} downloaded as CSV.`,
      tone: "success",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Players"
        badge={
          <Badge tone={counts.total ? "primary" : "neutral"}>
            {counts.total} registered
          </Badge>
        }
        subtitle="Everyone registered for 23 August, read live from the database."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className="size-4" />}
              onClick={roster.reload}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              icon={<FileDown className="size-4" />}
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              Export
            </Button>
            <Button
              variant="primary"
              icon={<UserPlus className="size-4" />}
              onClick={() => setAddOpen(true)}
              disabled={roster.access !== "ok"}
            >
              Add walk-in
            </Button>
          </>
        }
      />

      <RosterGate access={roster.access} loaded={roster.loaded}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Registered" value={counts.total} sub="on the roster" tone="primary" />
          <Stat
            label="Arrived"
            value={counts.checkedIn}
            sub={`of ${counts.total}`}
            tone={counts.checkedIn ? "success" : "neutral"}
          />
          <Stat label="Paid" value={counts.paid} sub="payment verified" tone="success" />
          <Stat
            label="Awaiting payment"
            value={counts.awaitingPayment}
            sub={counts.awaitingPayment ? "needs checking" : "all clear"}
            tone={counts.awaitingPayment ? "warning" : "success"}
          />
        </div>

        <div className="my-4">
          <PlayerSearch eventId={currentEvent.eventId} placeholder="Search a player to open their full profile…" />
        </div>

        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, entry number, area or mobile"
            className="lg:max-w-sm"
          />
          <div className="grid grid-cols-2 gap-2 lg:w-[26rem]">
            <Select value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
              <option value="all">All divisions</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">All statuses</option>
              <option value="checked-in">Arrived</option>
              <option value="not-arrived">Not arrived</option>
              <option value="withdrawn">Withdrawn</option>
            </Select>
          </div>
        </div>

        {players.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users className="size-5" />}
              title="Nobody has registered yet"
              description="Registrations from the public form appear here as they come in."
              action={
                <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={roster.reload}>
                  Check again
                </Button>
              }
            />
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users className="size-5" />}
              title="No players match these filters"
              description={`${players.length} on the roster, none matching the current search.`}
              action={
                <Button
                  variant="secondary"
                  onClick={() => { setQuery(""); setDivision("all"); setStatus("all"); }}
                >
                  Clear filters
                </Button>
              }
            />
          </Card>
        ) : (
          <Card>
            <div className="px-3 py-3">
              <TableWrap className="max-h-[68vh]">
                <thead>
                  <tr>
                    <Th>Player</Th>
                    <Th className="w-24">Entry</Th>
                    <Th className="w-36">Mobile</Th>
                    <Th className="w-28">Division</Th>
                    <Th className="w-16">Seed</Th>
                    <Th className="w-28">Area</Th>
                    <Th className="w-24">Payment</Th>
                    <Th className="w-32">Check-in</Th>
                    <Th className="w-24">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className="cursor-pointer hover:bg-[rgb(var(--c-surface-soft))]"
                      onClick={() => router.push(`/app/players/${p.playerId}`)}
                    >
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <Avatar initials={p.initials} hue={p.avatarHue} size={30} />
                          <span className="truncate text-[13.5px] font-medium text-ink">{p.fullName}</span>
                        </span>
                      </Td>
                      <Td className="num text-muted">{p.playerId}</Td>
                      <Td className="num text-muted">{p.emergencyContact.phone || "—"}</Td>
                      <Td className="capitalize">{p.division.replace(/-/g, " ")}</Td>
                      <Td className="num">{p.seed}</Td>
                      <Td className="truncate">{p.city}</Td>
                      <Td>
                        <Badge tone={p.payment === "paid" ? "success" : p.payment === "pending" ? "warning" : "neutral"}>
                          {p.payment}
                        </Badge>
                      </Td>
                      <Td>
                        {p.checkIn === "checked-in" ? (
                          <Badge tone="success" dot>
                            {p.checkInAt ? formatTime(p.checkInAt) : "arrived"}
                          </Badge>
                        ) : (
                          <Badge tone={p.checkIn === "withdrawn" ? "critical" : "neutral"}>
                            {p.checkIn.replace(/-/g, " ")}
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setSelected(p); }}
                        >
                          Quick look
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </Card>
        )}
      </RosterGate>

      <PlayerDrawer player={selected} eventId={currentEvent.eventId} onClose={() => setSelected(null)} />
      <WalkInModal
        open={addOpen}
        eventId={currentEvent.eventId}
        onClose={() => setAddOpen(false)}
        signedInAs={roster.signedInAs}
        onAdded={roster.reload}
        existing={players}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Adding somebody at the door.
 *
 * The old version of this form collected a rating, a club and an accommodation
 * note, then wrote the player to browser storage — invisible on every other
 * device and gone on refresh. This writes to the database, and asks only for what
 * the desk can actually find out in the thirty seconds somebody is standing there.
 *
 * A walk-in is marked arrived on the spot, because they are. Payment is not
 * assumed: it stays unpaid until someone confirms the money.
 */
function WalkInModal({
  open,
  eventId,
  onClose,
  signedInAs,
  onAdded,
  existing,
}: {
  open: boolean;
  eventId: string;
  onClose: () => void;
  signedInAs: string | null;
  onAdded: () => void;
  existing: Player[];
}) {
  const store = useStore();
  const [form, setForm] = React.useState({
    fullName: "",
    mobile: "",
    area: "",
    level: "recreational",
    amount: String(ALPHABATTLE_PRICES.base),
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm({ fullName: "", mobile: "", area: "", level: "recreational", amount: String(ALPHABATTLE_PRICES.base) });
    setErrors({});
    setCode(null);
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Enter the player's name.";
    if (form.amount && Number.isNaN(Number(form.amount))) e.amount = "Enter a number, or leave blank.";

    /*
     * A soft duplicate warning rather than a block. Two people at one event really
     * can share a name, and refusing the second one at the desk is worse than
     * letting the director decide.
     */
    const dup = existing.find(
      (p) => p.fullName.toLowerCase() === form.fullName.trim().toLowerCase(),
    );

    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setBusy(true);
    const outcome = await addWalkIn({
      eventId,
      fullName: form.fullName.trim(),
      mobile: form.mobile.trim(),
      playingLevel: form.level,
      amount: form.amount ? Number(form.amount) : 0,
      by: signedInAs ?? "staff",
    });
    setBusy(false);

    if (!outcome.ok) {
      setErrors({ form: outcome.message });
      return;
    }

    setCode(outcome.checkInCode);
    onAdded();
    store.toast({
      title: `${form.fullName.trim()} added and checked in`,
      description: dup
        ? `Note: ${dup.fullName} was already on the roster as ${dup.playerId}.`
        : `Playing in ${divisionFor(form.level)}. Payment recorded as unpaid.`,
      tone: dup ? "warning" : "success",
    });
  };

  /* ---- Added ----------------------------------------------------------- */
  if (code) {
    return (
      <Modal
        open={open}
        onClose={() => { reset(); onClose(); }}
        title="Player added"
        subtitle="They are on the roster and marked as arrived."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Add another</Button>
            <Button variant="primary" onClick={() => { reset(); onClose(); }}>Done</Button>
          </div>
        }
      >
        <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-5 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
            Their check-in code
          </p>
          <p className="num mt-2 text-[34px] font-extrabold tracking-[0.18em] text-ink">{code}</p>
          <p className="mt-2 text-[13px] text-muted">
            Write this on their badge. It is how they look themselves up later.
          </p>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          Payment is recorded as unpaid. Mark it verified from Payments once the money is in hand.
        </p>
      </Modal>
    );
  }

  /* ---- Form ------------------------------------------------------------ */
  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Add a walk-in"
      subtitle="For somebody at the desk who did not register online."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { reset(); onClose(); }} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Adding…" : "Add and check in"}
          </Button>
        </div>
      }
    >
      {errors.form ? (
        <p className="mb-3 rounded-input bg-critical-050 px-3 py-2 text-[13px] font-medium text-critical">
          {errors.form}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName} className="sm:col-span-2">
          <Input
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            invalid={!!errors.fullName}
            autoFocus
          />
        </Field>
        <Field label="Mobile" hint="So they can be reached on the day">
          <Input
            value={form.mobile}
            onChange={(e) => set("mobile", e.target.value)}
            inputMode="tel"
            placeholder="0300 0000000"
          />
        </Field>
        <Field label="Area">
          <Input value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Clifton" />
        </Field>
        <Field label="Playing level" required>
          <Select value={form.level} onChange={(e) => set("level", e.target.value)}>
            <option value="beginner">Beginner / new to the game</option>
            <option value="recreational">Intermediate / recreational</option>
            <option value="advanced">Advanced / regular</option>
          </Select>
        </Field>
        <Field label="Amount due" hint={`${ALPHABATTLE_PRICES.currency}. Leave as is for the standard fee.`} error={errors.amount}>
          <Input
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            inputMode="numeric"
            className="num"
            invalid={!!errors.amount}
          />
        </Field>
      </div>
    </Modal>
  );
}
