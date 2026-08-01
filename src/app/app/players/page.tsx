"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  LayoutGrid,
  List,
  Merge,
  Upload,
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
  Progress,
  SearchInput,
  Select,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { PlayerDrawer } from "@/components/players/PlayerDrawer";
import { PlayerSearch } from "@/components/profile/PlayerSearch";
import { useRouter } from "next/navigation";
import { DivisionId, Player } from "@/lib/domain/types";
import { cn, downloadFile, toCsv } from "@/lib/utils";

export default function PlayersPage() {
  return (
    <React.Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-[rgb(var(--c-surface-soft))]" />}>
      <PlayersView />
    </React.Suspense>
  );
}

function PlayersView() {
  const router = useRouter();
  const params = useSearchParams();
  const store = useStore();
  const { players, divisions } = store;

  const [query, setQuery] = React.useState("");
  const [division, setDivision] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [view, setView] = React.useState<"table" | "cards">("table");
  const [selected, setSelected] = React.useState<Player | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  // Deep link from global search: /app/players?player=p-3
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
        p.club.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q)
      );
    });
  }, [players, query, division, status]);

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ["Player ID", "Name", "Division", "Rating", "Seed", "City", "Club", "Payment", "Check-in"],
      ...filtered.map((p) => [
        p.playerId, p.fullName, p.division, p.rating || "Unrated", p.seed,
        p.city, p.club, p.payment, p.checkIn,
      ]),
    ];
    downloadFile("players.csv", toCsv(rows), "text/csv");
    store.toast({
      title: "Player list exported",
      description: `${filtered.length} records downloaded as CSV.`,
      tone: "success",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Players"
        badge={<Badge tone="primary">{players.length} registered</Badge>}
        subtitle="Registration, records and player profiles for this tournament."
        actions={
          <>
            <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
              Bulk import
            </Button>
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAddOpen(true)}>
              Add player
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <PlayerSearch placeholder="Search a player to open their full profile…" />
      </div>

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name, player ID, club or city"
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
            <option value="checked-in">Checked in</option>
            <option value="not-arrived">Not arrived</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="withdrawn">Withdrawn</option>
          </Select>
        </div>
        <div className="flex gap-1 lg:ml-auto">
          <Button
            size="sm"
            variant={view === "table" ? "primary" : "secondary"}
            onClick={() => setView("table")}
            icon={<List className="size-3.5" />}
          >
            Table
          </Button>
          <Button
            size="sm"
            variant={view === "cards" ? "primary" : "secondary"}
            onClick={() => setView("cards")}
            icon={<LayoutGrid className="size-3.5" />}
          >
            Cards
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title="No players match these filters"
            description="Adjust the search or filters to see more players."
            action={
              <Button variant="secondary" onClick={() => { setQuery(""); setDivision("all"); setStatus("all"); }}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : view === "table" ? (
        <Card>
          <div className="px-3 py-3">
            <TableWrap className="max-h-[68vh]">
              <thead>
                <tr>
                  <Th>Player</Th>
                  <Th className="w-24">Player ID</Th>
                  <Th className="w-28">Division</Th>
                  <Th className="w-20">Rating</Th>
                  <Th className="w-16">Seed</Th>
                  <Th className="w-28">City</Th>
                  <Th className="w-44">Club / School</Th>
                  <Th className="w-24">Payment</Th>
                  <Th className="w-28">Check-in</Th>
                  <Th className="w-24">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-[rgb(var(--c-surface-soft))]" onClick={() => router.push(`/app/players/${p.playerId}`)}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar initials={p.initials} hue={p.avatarHue} size={30} />
                        <span className="truncate text-[13.5px] font-medium text-ink">{p.fullName}</span>
                      </span>
                    </Td>
                    <Td className="num text-muted">{p.playerId}</Td>
                    <Td className="capitalize">{p.division.replace(/-/g, " ")}</Td>
                    <Td className="num">{p.rating || <span className="text-faint">Unrated</span>}</Td>
                    <Td className="num">{p.seed}</Td>
                    <Td className="truncate">{p.city}</Td>
                    <Td className="max-w-[176px] truncate text-muted">{p.club}</Td>
                    <Td>
                      <Badge tone={p.payment === "paid" ? "success" : p.payment === "pending" ? "warning" : "neutral"}>
                        {p.payment}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          p.checkIn === "checked-in" ? "success"
                            : p.checkIn === "late" ? "warning"
                            : p.checkIn === "not-arrived" ? "neutral" : "critical"
                        }
                        dot
                      >
                        {p.checkIn.replace(/-/g, " ")}
                      </Badge>
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(p); }}>
                        Quick look
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.slice(0, 60).map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/app/players/${p.playerId}`)}
              className="glass rounded-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(44,55,96,0.13)]"
            >
              <div className="flex items-center gap-3">
                <Avatar initials={p.initials} hue={p.avatarHue} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{p.fullName}</p>
                  <p className="truncate text-[12px] text-muted">{p.playerId} · {p.city}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-[10px] bg-[rgb(var(--c-surface))] py-1.5">
                  <p className="text-[14px] font-semibold text-ink num">{p.rating || "—"}</p>
                  <p className="text-[10.5px] text-muted">Rating</p>
                </div>
                <div className="rounded-[10px] bg-[rgb(var(--c-surface))] py-1.5">
                  <p className="text-[14px] font-semibold text-ink num">{p.seed}</p>
                  <p className="text-[10.5px] text-muted">Seed</p>
                </div>
                <div className="rounded-[10px] bg-[rgb(var(--c-surface))] py-1.5">
                  <p className="text-[14px] font-semibold text-ink num">{p.wins}–{p.losses}</p>
                  <p className="text-[10.5px] text-muted">Record</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge tone="neutral" className="capitalize">{p.division.replace(/-/g, " ")}</Badge>
                <Badge tone={p.checkIn === "checked-in" ? "success" : "warning"} dot>
                  {p.checkIn.replace(/-/g, " ")}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      <PlayerDrawer player={selected} onClose={() => setSelected(null)} />
      <AddPlayerModal open={addOpen} onClose={() => setAddOpen(false)} />
      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AddPlayerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { players, divisions } = store;
  const [form, setForm] = React.useState({
    fullName: "", city: "", club: "", division: "open" as DivisionId,
    rating: "", email: "", phone: "", emergencyName: "", accommodation: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Enter the player's full name.";
    if (!form.city.trim()) e.city = "Enter a city.";
    if (form.rating && (Number.isNaN(Number(form.rating)) || Number(form.rating) < 0))
      e.rating = "Rating must be a positive number.";

    // Duplicate check on name within the same city.
    const dup = players.find(
      (p) =>
        p.fullName.toLowerCase() === form.fullName.trim().toLowerCase() &&
        p.city.toLowerCase() === form.city.trim().toLowerCase(),
    );
    if (dup) e.fullName = `A player named ${dup.fullName} from ${dup.city} is already registered (${dup.playerId}).`;

    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (!store.requireCapability("players.edit")) return;

    const n = players.length + 1;
    const parts = form.fullName.trim().split(/\s+/);
    store.addPlayer({
      id: `p-${n}-${Math.random().toString(36).slice(2, 6)}`,
      playerId: `PK-${String(n).padStart(3, "0")}`,
      fullName: form.fullName.trim(),
      initials: `${parts[0][0]}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase(),
      avatarHue: (n * 47) % 360,
      city: form.city.trim(),
      club: form.club.trim() || "Unaffiliated",
      division: form.division,
      rating: form.rating ? Number(form.rating) : 0,
      ratingStatus: form.rating ? "rated" : "unrated",
      seed: players.filter((p) => p.division === form.division).length + 1,
      wins: 0, losses: 0, draws: 0, spread: 0, rank: 0, previousRank: 0,
      checkIn: "not-arrived",
      attendance: {}, opponentHistory: [], boardHistory: [], byeRounds: [],
      tournamentHistory: [],
      emergencyContact: {
        name: form.emergencyName || "Not provided",
        relationship: "Not provided",
        phone: form.phone || "Not provided",
      },
      accommodation: form.accommodation || undefined,
      payment: "pending",
      registeredAt: new Date().toISOString(),
    });

    store.toast({
      title: "Player registered",
      description: `${form.fullName} was added to the ${form.division.replace(/-/g, " ")} division.`,
      tone: "success",
    });
    setForm({ fullName: "", city: "", club: "", division: "open", rating: "", email: "", phone: "", emergencyName: "", accommodation: "" });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register a player"
      subtitle="Add a single player to this tournament."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Register player</Button>
        </div>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName} className="sm:col-span-2">
          <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} invalid={!!errors.fullName} />
        </Field>
        <Field label="City" required error={errors.city}>
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} invalid={!!errors.city} />
        </Field>
        <Field label="Club or school">
          <Input value={form.club} onChange={(e) => set("club", e.target.value)} />
        </Field>
        <Field label="Division" required>
          <Select value={form.division} onChange={(e) => set("division", e.target.value)}>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Rating" hint="Leave blank for an unrated player" error={errors.rating}>
          <Input value={form.rating} onChange={(e) => set("rating", e.target.value)} inputMode="numeric" className="num" invalid={!!errors.rating} />
        </Field>
        <Field label="Emergency contact name">
          <Input value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
        </Field>
        <Field label="Contact number">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+92 300 0000000" />
        </Field>
        <Field label="Special accommodation" className="sm:col-span-2" hint="Honoured by the pairing engine when assigning boards.">
          <Input value={form.accommodation} onChange={(e) => set("accommodation", e.target.value)} placeholder="e.g. Wheelchair access required — ground-floor board" />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk import: upload → map → validate → duplicates → preview → confirm       */
/* -------------------------------------------------------------------------- */

const STEPS = ["Upload", "Map columns", "Validate", "Duplicates", "Preview", "Confirm"];

function BulkImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const [step, setStep] = React.useState(0);
  const [resolution, setResolution] = React.useState<Record<number, string>>({});

  // Reset the wizard each time it opens.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) { setStep(0); setResolution({}); }
  }

  // A representative import: 129 rows → 126 valid, 2 duplicates, 1 incomplete.
  const duplicates = [
    {
      id: 0,
      incoming: { name: "Hassan Chaudhry", city: "Lahore", club: "Lahore Word Masters", rating: 1842, id: "—" },
      existing: { name: "Hassan Chaudhry", city: "Lahore", club: "Lahore Word Masters", rating: 1838, id: "PK-011" },
    },
    {
      id: 1,
      incoming: { name: "Ayesha Malik", city: "Karachi", club: "Karachi Scrabble Club", rating: 1611, id: "—" },
      existing: { name: "Ayesha Malik", city: "Karachi", club: "Sindh Scrabble Association", rating: 1604, id: "PK-047" },
    },
  ];

  const finish = () => {
    if (!store.requireCapability("players.import")) return;
    store.toast({
      title: "Import complete",
      description: "126 players were imported. 2 duplicates resolved, 1 incomplete record skipped.",
      tone: "success",
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk import players"
      subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
      size="lg"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>Back</Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)} icon={<ArrowRight className="size-4" />}>
                Continue
              </Button>
            ) : (
              <Button variant="primary" onClick={finish}>Confirm import</Button>
            )}
          </div>
        </div>
      }
    >
      {/* Step indicator */}
      <div className="mb-4 flex gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-[rgb(var(--c-line-strong))]")} />
            <p className={cn("mt-1.5 hidden text-[11px] sm:block", i === step ? "font-medium text-ink" : "text-faint")}>
              {s}
            </p>
          </div>
        ))}
      </div>

      {step === 0 ? (
        <div className="board-motif rounded-compact border border-dashed border-line-strong p-8 text-center">
          <FileSpreadsheet className="mx-auto size-8 text-faint" />
          <p className="mt-2 text-[14px] font-medium text-ink">Upload a CSV or Excel file</p>
          <p className="mt-1 text-[12.5px] text-muted">
            The demo uses a sample file with 129 registration records.
          </p>
          <Button variant="primary" className="mt-4" onClick={() => setStep(1)}>
            Select sample file
          </Button>
          <p className="mt-3 text-[11.5px] text-faint">registrations-2026.csv · 129 rows · 14 KB</p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-2.5">
          <p className="text-[13px] text-muted">
            Match each column in your file to a Bluffy Alphabattle field. Detected matches are pre-selected.
          </p>
          {[
            ["Full Name", "fullName"], ["City", "city"], ["Club/School", "club"],
            ["Division", "division"], ["Rating", "rating"], ["Contact", "phone"],
          ].map(([source, target]) => (
            <div key={source} className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5">
              <span className="w-32 shrink-0 truncate text-[13px] font-medium text-ink">{source}</span>
              <ArrowRight className="size-3.5 shrink-0 text-faint" />
              <div className="flex-1">
                <Select defaultValue={target} aria-label={`Map ${source}`}>
                  <option value="fullName">Full name</option>
                  <option value="city">City</option>
                  <option value="club">Club or school</option>
                  <option value="division">Division</option>
                  <option value="rating">Rating</option>
                  <option value="phone">Contact number</option>
                  <option value="ignore">Do not import</option>
                </Select>
              </div>
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            </div>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <ImportStat label="Valid players" value={126} tone="success" />
            <ImportStat label="Possible duplicates" value={2} tone="warning" />
            <ImportStat label="Incomplete records" value={1} tone="critical" />
          </div>
          <Progress value={100} tone="success" label="Validation" />
          <div className="rounded-control bg-critical-050/60 px-3.5 py-3">
            <p className="text-[13px] font-semibold text-ink">1 incomplete record</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Row 87 — “Zoya Kamal” is missing a city and division. This row will be skipped unless
              completed.
            </p>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <p className="text-[13px] text-muted">
            Two incoming records closely match existing players. Choose how to handle each.
          </p>
          {duplicates.map((d) => (
            <div key={d.id} className="rounded-compact border border-warning/30 bg-warning-050/40 p-3.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <DupCard title="Incoming record" data={d.incoming} />
                <DupCard title="Existing player" data={d.existing} highlight />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[
                  ["merge", "Merge records", <Merge key="m" className="size-3.5" />],
                  ["keep", "Keep both", null],
                  ["replace", "Replace existing", null],
                  ["later", "Review later", null],
                ].map(([value, label, icon]) => (
                  <Button
                    key={String(value)}
                    size="sm"
                    variant={resolution[d.id] === value ? "primary" : "secondary"}
                    onClick={() => setResolution((r) => ({ ...r, [d.id]: String(value) }))}
                    icon={icon as React.ReactNode}
                  >
                    {label as string}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3">
          <p className="text-[13px] text-muted">Review the changes before they are applied.</p>
          <ul className="space-y-1.5">
            {[
              ["126 players will be created", "success"],
              [`${Object.values(resolution).filter((r) => r === "merge").length} records will be merged`, "info"],
              [`${Object.values(resolution).filter((r) => r === "keep").length} duplicates kept as separate players`, "info"],
              ["1 incomplete record will be skipped", "warning"],
              ["No existing players will be deleted", "success"],
            ].map(([text, tone]) => (
              <li
                key={String(text)}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3.5 py-2.5 text-[13px]",
                  tone === "success" && "bg-success-050/60 text-ink",
                  tone === "info" && "bg-secondary-050/60 text-ink",
                  tone === "warning" && "bg-warning-050/60 text-ink",
                )}
              >
                <CheckCircle2 className={cn("size-4 shrink-0", tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-secondary")} />
                {text as string}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="rounded-compact bg-success-050/60 p-6 text-center">
          <CheckCircle2 className="mx-auto size-9 text-success" />
          <p className="mt-2 text-[15px] font-semibold text-ink">Ready to import</p>
          <p className="mt-1 text-[13px] text-muted">
            126 players will be added to the tournament. Seeding will be recalculated automatically
            and an audit entry will be recorded.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function ImportStat({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "critical" }) {
  return (
    <div className={cn(
      "rounded-control px-3 py-2.5",
      tone === "success" && "bg-success-050/70",
      tone === "warning" && "bg-warning-050/70",
      tone === "critical" && "bg-critical-050/70",
    )}>
      <p className="text-[20px] font-semibold text-ink num">{value}</p>
      <p className="text-[11.5px] text-muted">{label}</p>
    </div>
  );
}

function DupCard({
  title,
  data,
  highlight,
}: {
  title: string;
  data: { name: string; city: string; club: string; rating: number; id: string };
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-control p-3", highlight ? "bg-white" : "bg-[rgb(var(--c-surface))]")}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{title}</p>
      <p className="mt-1 text-[13.5px] font-semibold text-ink">{data.name}</p>
      <dl className="mt-1.5 space-y-0.5 text-[12px]">
        <div className="flex justify-between gap-2"><dt className="text-muted">Player ID</dt><dd className="text-ink num">{data.id}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">City</dt><dd className="text-ink">{data.city}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Club</dt><dd className="truncate text-ink">{data.club}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Rating</dt><dd className="text-ink num">{data.rating}</dd></div>
      </dl>
    </div>
  );
}
