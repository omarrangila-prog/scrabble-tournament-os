"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GripVertical,
  ListOrdered,
  MapPin,
  Plus,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Tabs,
  Toggle,
} from "@/components/ui";
import { LetterTile } from "@/components/art/ScrabbleArt";
import { useStore } from "@/lib/store/useStore";
import {
  DivisionId,
  PairingSystem,
  RankingCriterion,
  Tournament,
} from "@/lib/domain/types";
import { cn, formatDate } from "@/lib/utils";

const RANKING_LABEL: Record<RankingCriterion, string> = {
  wins: "Wins",
  draws: "Draws",
  spread: "Spread",
  "head-to-head": "Head-to-head",
  buchholz: "Buchholz",
  "median-buchholz": "Median Buchholz",
  "sonneborn-berger": "Sonneborn-Berger",
  cumulative: "Cumulative score",
  performance: "Performance rating",
};

const ALL_CRITERIA = Object.keys(RANKING_LABEL) as RankingCriterion[];

/** Restrained gradient identity per event, so each card is recognisable. */
const EVENT_GRADIENTS = [
  "linear-gradient(104deg, rgba(115,87,246,0.20), rgba(57,135,248,0.13) 54%, rgba(85,201,232,0.11))",
  "linear-gradient(104deg, rgba(56,200,154,0.18), rgba(85,201,232,0.13) 54%, rgba(57,135,248,0.10))",
  "linear-gradient(104deg, rgba(230,169,61,0.20), rgba(255,155,117,0.13) 54%, rgba(255,144,203,0.10))",
  "linear-gradient(104deg, rgba(255,144,203,0.18), rgba(115,87,246,0.13) 54%, rgba(57,135,248,0.10))",
];

export default function TournamentsPage() {
  const router = useRouter();
  const store = useStore();
  const { tournaments, players, pairings, currentUser } = store;
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("all");

  const active = tournaments.find((t) => t.status === "live") ?? tournaments[0];
  const others = tournaments.filter((t) => t.id !== active?.id);

  const visible = others.filter((t) => filter === "all" || t.status === filter);

  /* Live figures for the featured event. */
  const activePlayers = active ? players.length : 0;
  const checkedIn = players.filter((p) => p.checkIn === "checked-in").length;
  const roundPairings = active
    ? pairings.filter((p) => p.round === active.currentRound && p.playerBId !== null)
    : [];
  const verified = roundPairings.filter((p) => p.status === "verified").length;
  const pending = roundPairings.filter((p) => p.status === "awaiting-verification").length;
  const completion = roundPairings.length
    ? Math.round((verified / roundPairings.length) * 100)
    : 0;

  const hour = 14; // Fixed reference hour keeps the greeting stable in the demo.
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  /*
   * Greet by the first given name, keeping any honorific attached — "Sir Hani"
   * rather than the bare "Sir" a naive first-word split would produce.
   */
  const HONORIFICS = ["sir", "dr", "mr", "mrs", "ms", "prof", "madam"];
  const nameParts = (currentUser?.name ?? "there").split(" ");
  const firstName =
    nameParts.length > 1 && HONORIFICS.includes(nameParts[0].toLowerCase().replace(".", ""))
      ? `${nameParts[0]} ${nameParts[1]}`
      : nameParts[0];

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${firstName}.`}
        subtitle="Continue an active championship or prepare your next event."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setWizardOpen(true)}>
            Create tournament
          </Button>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Featured active tournament                                          */}
      {/* ------------------------------------------------------------------ */}
      {active ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="glass relative mb-5 overflow-hidden rounded-hero"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: EVENT_GRADIENTS[0] }}
            aria-hidden
          />
          <div className="board-motif pointer-events-none absolute inset-0 opacity-35" aria-hidden />

          <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" dot pulse>
                  Live now
                </Badge>
                <Badge tone="neutral" className="capitalize">
                  {active.system.replace(/-/g, " ")}
                </Badge>
              </div>

              <h2 className="mt-3 text-[24px] font-extrabold leading-[1.12] tracking-[-0.03em] text-ink sm:text-[30px]">
                {active.name.replace(" — Demo", "")}
              </h2>

              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {store.venue.name} · {active.city}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" />
                  {formatDate(active.startDate)} – {formatDate(active.endDate)}
                </span>
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <HeroFigure label="Participants" value={String(activePlayers)} sub={`${checkedIn} checked in`} />
                <HeroFigure
                  label="Current round"
                  value={`${active.currentRound} of ${active.totalRounds}`}
                  sub={`${completion}% verified`}
                />
                <HeroFigure label="Divisions" value={String(active.divisions.length)} sub="All running" />
                <HeroFigure
                  label="Pending actions"
                  value={String(pending)}
                  sub={pending ? "Results to verify" : "Nothing outstanding"}
                  tone={pending ? "warning" : "success"}
                />
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[12.5px] font-semibold text-muted">Event completion</span>
                  <span className="num text-[13px] font-bold text-ink">
                    Round {active.currentRound} of {active.totalRounds}
                  </span>
                </div>
                <Progress
                  value={((active.currentRound - 1) / active.totalRounds) * 100}
                  tone="primary"
                  label="Event completion"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<ArrowRight className="size-4" />}
                  onClick={() => router.push("/app")}
                >
                  Continue Tournament
                </Button>
                <Button variant="secondary" onClick={() => router.push("/app/standings")}>
                  Live standings
                </Button>
                <Button variant="ghost" onClick={() => window.open("/live", "_blank")}>
                  Public site
                </Button>
              </div>
            </div>

            <div className="hidden shrink-0 items-end gap-2 xl:flex" aria-hidden>
              <LetterTile letter="P" size={52} className="float-soft-slow" />
              <LetterTile letter="L" size={52} className="float-soft" style={{ animationDelay: "300ms" }} />
              <LetterTile letter="A" size={52} className="float-soft-slow" style={{ animationDelay: "600ms" }} />
              <LetterTile letter="Y" size={52} tone="gold" className="float-soft" style={{ animationDelay: "900ms" }} />
            </div>
          </div>
        </motion.div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Library                                                             */}
      {/* ------------------------------------------------------------------ */}
      <Tabs
        tabs={[
          { id: "all", label: "All events", count: others.length },
          { id: "draft", label: "Upcoming & draft", count: others.filter((t) => t.status === "draft").length },
          { id: "complete", label: "Completed", count: others.filter((t) => t.status === "complete").length },
        ]}
        value={filter}
        onChange={setFilter}
        className="mb-4"
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="size-5" />}
            title="No other tournaments yet"
            description="Create your next championship and it will appear here alongside the active event."
            action={
              <Button variant="primary" onClick={() => setWizardOpen(true)}>
                Create tournament
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((t, i) => (
            <Card key={t.id} className="relative overflow-hidden p-5">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-24"
                style={{ background: EVENT_GRADIENTS[(i + 1) % EVENT_GRADIENTS.length] }}
                aria-hidden
              />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-control bg-[rgb(var(--c-surface-strong))] text-primary shadow-[var(--shadow-glass-sm)]">
                    <Trophy className="size-5" />
                  </span>
                  <Badge
                    tone={t.status === "live" ? "success" : t.status === "draft" ? "warning" : "neutral"}
                    dot
                    pulse={t.status === "live"}
                  >
                    {t.status === "draft" ? "Draft" : t.status === "live" ? "Live" : "Completed"}
                  </Badge>
                </div>

                <h3 className="mt-3 text-[16px] font-bold leading-snug tracking-[-0.015em] text-ink">
                  {t.name.replace(" — Demo", "")}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                  <MapPin className="size-3.5" />
                  {t.city} · {t.organizer}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                  <CalendarDays className="size-3.5" />
                  {formatDate(t.startDate)} – {formatDate(t.endDate)}
                </p>

                <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
                  <MiniFigure icon={<Users className="size-3.5" />} value={t.id === store.tournament.id ? players.length : 0} label="Players" />
                  <MiniFigure icon={<ListOrdered className="size-3.5" />} value={`${t.currentRound}/${t.totalRounds}`} label="Rounds" />
                  <MiniFigure icon={<Trophy className="size-3.5" />} value={t.divisions.length} label="Divisions" />
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3.5 w-full"
                  onClick={() =>
                    t.status === "live"
                      ? router.push("/app")
                      : store.toast({
                          title: `${t.name.replace(" — Demo", "")}`,
                          description:
                            t.status === "draft"
                              ? "This event is still a draft. Open the wizard to finish setting it up."
                              : "This event is complete. Its reports and standings remain available.",
                          tone: "info",
                        })
                  }
                >
                  {t.status === "live" ? "Continue" : t.status === "draft" ? "Finish setup" : "View results"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateTournamentWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function HeroFigure({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <div className="rounded-compact bg-[rgb(var(--c-surface-strong))] px-3.5 py-3">
      <p className="text-[11.5px] font-semibold text-muted">{label}</p>
      <p
        className={cn(
          "num mt-0.5 text-[21px] font-extrabold tracking-[-0.025em]",
          tone === "warning" && "text-[#a76d16]",
          tone === "success" && "text-[#12855c]",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function MiniFigure({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-control bg-[rgb(var(--c-surface-soft))] py-2">
      <span className="mx-auto flex items-center justify-center gap-1 text-muted">{icon}</span>
      <p className="num mt-0.5 text-[15px] font-extrabold text-ink">{value}</p>
      <p className="text-[10.5px] text-muted">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Five-step create wizard                                                     */
/* -------------------------------------------------------------------------- */

const STEPS = [
  "Tournament Details",
  "Competition Structure",
  "Ranking Rules",
  "Registration",
  "Review and Launch",
];

interface WizardState {
  name: string;
  organizer: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  visibility: "public" | "private";
  sponsors: string;

  totalRounds: number;
  divisions: DivisionId[];
  system: PairingSystem;
  finalPlayoff: boolean;
  gameMinutes: number;
  breakMinutes: number;
  startingMethod: string;
  latePolicy: string;
  byePolicy: string;

  rankingRules: RankingCriterion[];

  onlineRegistration: boolean;
  manualRegistration: boolean;
  csvImport: boolean;
  fee: number;
  deadline: string;
  capacity: number;
  waitingList: boolean;
  approvalRequired: boolean;
}

const INITIAL: WizardState = {
  name: "",
  organizer: "Bluffy Alphabattle",
  venue: "",
  city: "Karachi",
  startDate: "2026-09-12",
  endDate: "2026-09-14",
  timeZone: "Asia/Karachi (PKT, UTC+5)",
  visibility: "public",
  sponsors: "",

  totalRounds: 9,
  divisions: ["masters", "advanced"],
  system: "swiss",
  finalPlayoff: true,
  gameMinutes: 50,
  breakMinutes: 15,
  startingMethod: "Tile draw",
  latePolicy: "Forfeit after 15 minutes",
  byePolicy: "Bye counts as a win with a 50-point spread",

  rankingRules: ["wins", "spread", "head-to-head"],

  onlineRegistration: true,
  manualRegistration: true,
  csvImport: true,
  fee: 2500,
  deadline: "2026-09-05",
  capacity: 160,
  waitingList: true,
  approvalRequired: false,
};

function CreateTournamentWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { divisions } = store;
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<WizardState>(INITIAL);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [validated, setValidated] = React.useState(false);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setStep(0);
      setForm(INITIAL);
      setErrors({});
      setValidated(false);
    }
  }

  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validateStep = (target: number): boolean => {
    const e: Record<string, string> = {};
    if (target >= 1) {
      if (!form.name.trim()) e.name = "Enter a tournament name.";
      if (!form.venue.trim()) e.venue = "Enter a venue.";
      if (new Date(form.endDate) < new Date(form.startDate))
        e.endDate = "The end date cannot be before the start date.";
    }
    if (target >= 2) {
      if (form.totalRounds < 1 || form.totalRounds > 24) e.totalRounds = "Rounds must be between 1 and 24.";
      if (form.divisions.length === 0) e.divisions = "Select at least one division.";
    }
    if (target >= 3 && form.rankingRules.length === 0)
      e.rankingRules = "Select at least one ranking criterion.";
    if (target >= 4 && form.capacity < 2) e.capacity = "Capacity must be at least 2 players.";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep(step + 1)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const create = () => {
    if (!validateStep(4)) return;
    if (!store.requireCapability("tournament.create")) return;

    const t: Tournament = {
      id: `t-${Math.random().toString(36).slice(2, 8)}`,
      name: form.name.trim(),
      organizer: form.organizer,
      organizationId: store.organization.id,
      venueId: store.venue.id,
      city: form.city,
      startDate: form.startDate,
      endDate: form.endDate,
      timeZone: form.timeZone,
      status: "draft",
      system: form.system,
      totalRounds: form.totalRounds,
      currentRound: 0,
      divisions: form.divisions,
      rankingRules: form.rankingRules,
      constraints: store.tournament.constraints,
      gameMinutes: form.gameMinutes,
      breakMinutes: form.breakMinutes,
      visibility: form.visibility,
      registrationOpen: form.onlineRegistration,
      registrationFee: form.fee,
      currency: "PKR",
      capacity: form.capacity,
      sponsors: form.sponsors.split(",").map((s) => s.trim()).filter(Boolean),
    };

    store.createTournament(t);
    store.toast({
      title: "Tournament created",
      description: `${t.name} was saved as a draft and is ready for registration.`,
      tone: "success",
    });
    onClose();
  };

  /* Ranking rule reordering ------------------------------------------------ */
  const moveRule = (from: number, to: number) => {
    setForm((f) => {
      const next = [...f.rankingRules];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...f, rankingRules: next };
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a tournament"
      subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
      size="lg"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="flex flex-wrap gap-2">
            {step > 0 ? (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>Back</Button>
            ) : null}
            {step === STEPS.length - 1 ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    store.toast({
                      title: "Draft saved",
                      description: "You can return to this tournament at any time.",
                      tone: "success",
                    })
                  }
                >
                  Save Draft
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const ok = validateStep(4);
                    setValidated(ok);
                    store.toast({
                      title: ok ? "Validation passed" : "Validation found problems",
                      description: ok
                        ? "All required tournament settings are valid."
                        : "Review the highlighted fields before creating the tournament.",
                      tone: ok ? "success" : "warning",
                    });
                  }}
                >
                  Run Validation
                </Button>
                <Button variant="primary" onClick={create}>Create Tournament</Button>
              </>
            ) : (
              <Button variant="primary" onClick={next}>Continue</Button>
            )}
          </div>
        </div>
      }
    >
      {/* Step rail */}
      <div className="mb-5 flex gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-[rgb(var(--c-line-strong))]")} />
            <p className={cn("mt-1.5 hidden text-[11px] sm:block", i === step ? "font-medium text-ink" : "text-faint")}>
              {s}
            </p>
          </div>
        ))}
      </div>

      {/* Step 1 — details */}
      {step === 0 ? (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Tournament name" required error={errors.name} className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Sindh Open Scrabble Championship 2026"
              invalid={!!errors.name}
            />
          </Field>
          <Field label="Organizer" required>
            <Input value={form.organizer} onChange={(e) => set("organizer", e.target.value)} />
          </Field>
          <Field label="Venue" required error={errors.venue}>
            <Input value={form.venue} onChange={(e) => set("venue", e.target.value)} invalid={!!errors.venue} placeholder="e.g. Expo Centre Hall 2" />
          </Field>
          <Field label="City" required>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Time zone">
            <Input value={form.timeZone} onChange={(e) => set("timeZone", e.target.value)} />
          </Field>
          <Field label="Start date" required>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="End date" required error={errors.endDate}>
            <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} invalid={!!errors.endDate} />
          </Field>
          <Field label="Sponsor names" hint="Comma separated. Shown on the public site and certificates." className="sm:col-span-2">
            <Input value={form.sponsors} onChange={(e) => set("sponsors", e.target.value)} placeholder="e.g. Gulf Stationers, PakTel" />
          </Field>
          <div className="sm:col-span-2 space-y-2 rounded-compact bg-[rgb(var(--c-surface))] p-3.5">
            <p className="text-[13px] font-semibold text-ink">Branding</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <UploadTile label="Tournament logo" />
              <UploadTile label="Sponsor logos" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Toggle
              checked={form.visibility === "public"}
              onChange={(v) => set("visibility", v ? "public" : "private")}
              label="Public visibility"
              description="Publish pairings, standings and results on the public tournament website."
            />
          </div>
        </div>
      ) : null}

      {/* Step 2 — structure */}
      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Number of rounds" required error={errors.totalRounds}>
              <Input
                type="number"
                value={form.totalRounds}
                onChange={(e) => set("totalRounds", Number(e.target.value))}
                className="num"
                invalid={!!errors.totalRounds}
              />
            </Field>
            <Field label="Pairing system" required>
              <Select value={form.system} onChange={(e) => set("system", e.target.value as PairingSystem)}>
                <option value="swiss">Swiss</option>
                <option value="round-robin">Round Robin</option>
                <option value="knockout">Knockout</option>
                <option value="king-of-the-hill">King of the Hill</option>
                <option value="manual">Manual / custom pairing</option>
              </Select>
            </Field>
            <Field label="Game time (minutes)">
              <Input type="number" value={form.gameMinutes} onChange={(e) => set("gameMinutes", Number(e.target.value))} className="num" />
            </Field>
            <Field label="Break duration (minutes)">
              <Input type="number" value={form.breakMinutes} onChange={(e) => set("breakMinutes", Number(e.target.value))} className="num" />
            </Field>
            <Field label="Starting method">
              <Select value={form.startingMethod} onChange={(e) => set("startingMethod", e.target.value)}>
                <option>Tile draw</option>
                <option>Higher seed starts</option>
                <option>Alternating starts</option>
              </Select>
            </Field>
            <Field label="Late-player policy">
              <Select value={form.latePolicy} onChange={(e) => set("latePolicy", e.target.value)}>
                <option>Forfeit after 15 minutes</option>
                <option>Clock runs, no forfeit</option>
                <option>Director decision each case</option>
              </Select>
            </Field>
            <Field label="Bye policy" className="sm:col-span-2">
              <Select value={form.byePolicy} onChange={(e) => set("byePolicy", e.target.value)}>
                <option>Bye counts as a win with a 50-point spread</option>
                <option>Bye counts as a win with a 0-point spread</option>
                <option>Bye counts as half a point</option>
              </Select>
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">
              Divisions <span className="text-critical">*</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {divisions.map((d) => {
                const checked = form.divisions.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() =>
                      set(
                        "divisions",
                        checked ? form.divisions.filter((x) => x !== d.id) : [...form.divisions, d.id],
                      )
                    }
                    className={cn(
                      "flex items-center gap-2.5 rounded-control border px-3.5 py-2.5 text-left transition-colors",
                      checked ? "border-primary bg-primary-050" : "border-line-strong bg-[rgb(var(--c-surface))]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4.5 shrink-0 place-items-center rounded-[5px] border",
                        checked ? "border-primary bg-primary text-white" : "border-[rgb(17_22_43/0.2)]",
                      )}
                    >
                      {checked ? <CheckCircle2 className="size-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{d.name}</span>
                      <span className="block text-[11.5px] text-muted num">
                        {d.ratingFloor}–{d.ratingCeiling}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.divisions ? (
              <p className="mt-1 text-[12px] text-critical">{errors.divisions}</p>
            ) : null}
          </div>

          <Toggle
            checked={form.finalPlayoff}
            onChange={(v) => set("finalPlayoff", v)}
            label="Final playoff"
            description="Play a final between the top two finishers in each division."
          />
        </div>
      ) : null}

      {/* Step 3 — ranking */}
      {step === 2 ? (
        <div className="space-y-4">
          <div className="rounded-compact bg-secondary-050/60 px-3.5 py-3">
            <p className="text-[13px] font-semibold text-ink">Ranking policy is fully configurable</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Criteria are applied in order: the first decides the ranking, and each subsequent
              criterion only separates players still tied. Drag to reorder. The default policy for
              this demonstration is wins, then spread, then head-to-head.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Active criteria, in order</p>
            <ul className="space-y-1.5">
              {form.rankingRules.map((rule, i) => (
                <li
                  key={rule}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== i) moveRule(dragIndex, i);
                    setDragIndex(null);
                  }}
                  className={cn(
                    "flex cursor-grab items-center gap-2.5 rounded-control border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-strong))] px-3 py-2.5 active:cursor-grabbing",
                    dragIndex === i && "opacity-50",
                  )}
                >
                  <GripVertical className="size-4 shrink-0 text-faint" />
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-050 text-[11.5px] font-semibold text-primary num">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px] text-ink">{RANKING_LABEL[rule]}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveRule(i, i - 1)} aria-label="Move up">
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === form.rankingRules.length - 1} onClick={() => moveRule(i, i + 1)} aria-label="Move down">
                      ↓
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => set("rankingRules", form.rankingRules.filter((r) => r !== rule))}
                      aria-label="Remove criterion"
                    >
                      <XCircle className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {errors.rankingRules ? (
              <p className="mt-1 text-[12px] text-critical">{errors.rankingRules}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Available criteria</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CRITERIA.filter((c) => !form.rankingRules.includes(c)).map((c) => (
                <button
                  key={c}
                  onClick={() => set("rankingRules", [...form.rankingRules, c])}
                  className="rounded-full border border-line-strong bg-[rgb(var(--c-surface))] px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:border-primary/40 hover:bg-primary-050 hover:text-primary-600"
                >
                  + {RANKING_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Step 4 — registration */}
      {step === 3 ? (
        <div className="space-y-4">
          <div className="space-y-1 rounded-compact bg-[rgb(var(--c-surface))] p-3.5">
            <Toggle checked={form.onlineRegistration} onChange={(v) => set("onlineRegistration", v)} label="Online registration" description="Players register through the public tournament website." />
            <Toggle checked={form.manualRegistration} onChange={(v) => set("manualRegistration", v)} label="Manual registration" description="Organizers add players directly in the platform." />
            <Toggle checked={form.csvImport} onChange={(v) => set("csvImport", v)} label="CSV / Excel import" description="Bulk import an existing registration list." />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Registration fee (PKR)">
              <Input type="number" value={form.fee} onChange={(e) => set("fee", Number(e.target.value))} className="num" />
            </Field>
            <Field label="Registration deadline">
              <Input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </Field>
            <Field label="Maximum capacity" required error={errors.capacity}>
              <Input type="number" value={form.capacity} onChange={(e) => set("capacity", Number(e.target.value))} className="num" invalid={!!errors.capacity} />
            </Field>
            <Field label="Payment status tracking">
              <Select defaultValue="required">
                <option value="required">Track payment for every player</option>
                <option value="optional">Payment tracking optional</option>
                <option value="none">Free event — no payment</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-1 rounded-compact bg-[rgb(var(--c-surface))] p-3.5">
            <Toggle checked={form.waitingList} onChange={(v) => set("waitingList", v)} label="Waiting list" description="Accept registrations beyond capacity into a waiting list." />
            <Toggle checked={form.approvalRequired} onChange={(v) => set("approvalRequired", v)} label="Approval required" description="Every registration is reviewed before it is confirmed." />
          </div>
        </div>
      ) : null}

      {/* Step 5 — review */}
      {step === 4 ? (
        <div className="space-y-3">
          <ReviewBlock
            title="Tournament structure"
            rows={[
              ["Name", form.name || "—"],
              ["Organizer", form.organizer],
              ["Venue", `${form.venue || "—"}, ${form.city}`],
              ["Dates", `${formatDate(form.startDate)} – ${formatDate(form.endDate)}`],
              ["System", form.system.replace(/-/g, " ")],
              ["Rounds", String(form.totalRounds)],
              ["Game time", `${form.gameMinutes} minutes`],
              ["Final playoff", form.finalPlayoff ? "Yes" : "No"],
            ]}
          />
          <ReviewBlock
            title="Divisions"
            rows={form.divisions.map((d) => [
              divisions.find((x) => x.id === d)?.name ?? d,
              `${divisions.find((x) => x.id === d)?.ratingFloor}–${divisions.find((x) => x.id === d)?.ratingCeiling}`,
            ])}
          />
          <ReviewBlock
            title="Ranking rules"
            rows={form.rankingRules.map((r, i) => [`${i + 1}. ${RANKING_LABEL[r]}`, ""])}
          />
          <ReviewBlock
            title="Registration"
            rows={[
              ["Online registration", form.onlineRegistration ? "Enabled" : "Disabled"],
              ["Fee", `PKR ${form.fee.toLocaleString("en-PK")}`],
              ["Deadline", formatDate(form.deadline)],
              ["Capacity", String(form.capacity)],
              ["Waiting list", form.waitingList ? "Enabled" : "Disabled"],
              ["Approval required", form.approvalRequired ? "Yes" : "No"],
            ]}
          />
          <ReviewBlock
            title="Pairing constraints"
            rows={[
              ["Avoid repeat opponents", "Enabled"],
              ["Balance starts", "Enabled"],
              ["Avoid same club", "Warning only"],
              ["Board accessibility", "Respected"],
            ]}
          />
          <ReviewBlock
            title="Publishing"
            rows={[
              ["Visibility", form.visibility],
              ["Public website", form.visibility === "public" ? "Enabled" : "Disabled"],
              ["Sponsors", form.sponsors || "None"],
            ]}
          />

          {validated ? (
            <p className="flex items-center gap-2 rounded-control bg-success-050 px-3.5 py-3 text-[13px] font-medium text-[#1b8f68]">
              <CheckCircle2 className="size-4" />
              All required tournament settings are valid.
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function ReviewBlock({ title, rows }: { title: string; rows: (string | number)[][] }) {
  return (
    <div className="rounded-compact bg-[rgb(var(--c-surface))] p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">{title}</p>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex justify-between gap-3 text-[13px]">
            <dt className="capitalize text-muted">{k}</dt>
            <dd className="truncate text-right capitalize text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function UploadTile({ label }: { label: string }) {
  return (
    <button className="board-motif flex items-center justify-center gap-2 rounded-control border border-dashed border-line-strong px-3 py-4 text-[12.5px] text-muted transition-colors hover:border-primary/40 hover:text-ink">
      <Plus className="size-4" />
      {label}
    </button>
  );
}
