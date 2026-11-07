"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Plus,
  RefreshCw,
  Shuffle,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";

import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Progress, Select, Textarea } from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import { useStore } from "@/lib/store/useStore";
import { useCurrentEvent, useEventById } from "@/lib/supabase/useCurrentEvent";
import { useRoster } from "@/lib/supabase/useRoster";
import { useGames } from "@/lib/supabase/useGames";
import { useEventCategories, writeEventCategories } from "@/lib/supabase/useEventCategories";
import { useTablePlan, writeTablePlan } from "@/lib/supabase/useTablePlan";
import { writeEventDetails } from "@/lib/supabase/useEventDetails";
import { setEventPhase } from "@/lib/supabase/useEventState";
import { staffCheckIn, answer } from "@/lib/supabase/organizer";
import { clearResult, clearRound, publishRound, recordResult } from "@/lib/supabase/games";
import { supabase } from "@/lib/supabase/client";
import { generateRound } from "@/lib/engine/pairing";
import { computeStandings } from "@/lib/engine/standings";
import { validateBoardPlan, type BoardPlan, type GameRow } from "@/lib/domain/games";
import { formatTableSpec, parseTableSpec } from "@/lib/domain/tables";
import type { Division, Player } from "@/lib/domain/types";

/**
 * The whole tournament on one page.
 *
 * Students, sections, categories, tables, pairings, scores and standings are all here, one
 * under the other, so nothing needs a second screen. Every part is editable. The page reuses
 * the same database functions and pairing engine the rest of the app runs on, so what is
 * entered here is what the public results, certificates and standings read.
 *
 * Players are paired inside their section when the event has sections (a school's Section A,
 * B and C), and inside their category otherwise. A board never mixes categories: the database
 * refuses it.
 */

const BEGINNER: Division = { id: "beginner", name: "Beginner", shortName: "BEG", accent: "warning" };
const MASTERS: Division = { id: "masters", name: "Masters", shortName: "MAS", accent: "secondary" };

type Toast = (t: { title: string; description: string; tone: "success" | "info" | "warning" | "critical" }) => void;

type CategoryMode = "beginner" | "masters" | "both";

interface DraftBoard {
  key: string;
  table: number;
  a: string;
  b: string;
  aPlaysFirst?: boolean | null;
  reason?: string;
}

interface Draft {
  round: number;
  boards: DraftBoard[];
}

let keySeed = 0;
const nextKey = () => `b${++keySeed}`;

export default function ManagePage() {
  const app = useStore();
  const current = useCurrentEvent();
  const eventId = current.eventId;
  const { event, reload: reloadEvent } = useEventById(eventId);
  const roster = useRoster(eventId);
  const games = useGames(eventId, app.tournament.id);
  const cats = useEventCategories(eventId);
  const tablePlan = useTablePlan(eventId);

  const by = app.currentUser?.name ?? "Director";
  const toast = app.toast;

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [viewRound, setViewRound] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const categories = cats.categories;
  const sections = React.useMemo(() => event?.details.sections ?? [], [event]);
  const pairWithin = sections.length > 0 && event?.details.pairWithinSections !== false;
  const totalRounds = event?.details.rounds ?? 3;

  const players = React.useMemo(
    () => roster.players.filter((p) => p.checkIn !== "withdrawn"),
    [roster.players],
  );
  const sectionById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roster.registrations) m.set(r.id, answer(r, "section") ?? "");
    return m;
  }, [roster.registrations]);
  const nameOf = React.useCallback(
    (id: string) => roster.players.find((p) => p.id === id)?.fullName ?? "Unknown",
    [roster.players],
  );
  const categoryName = React.useCallback(
    (id: string) => categories.find((c) => c.id === id)?.name ?? id,
    [categories],
  );

  const round = games.round;
  const roundGames = React.useMemo(
    () => games.games.filter((g) => g.round === round),
    [games.games, round],
  );
  const roundDone =
    round > 0 && roundGames.filter((g) => g.playerB).every((g) => g.status === "verified");
  const notHere = players.filter((p) => p.checkIn !== "checked-in");

  /** The tournament as the engine wants it: this event's rounds, no club rule, repeats avoided. */
  const pairingTournament = React.useMemo(
    () => ({
      ...app.tournament,
      system: "swiss" as const,
      totalRounds,
      currentRound: round,
      divisions: categories.map((c) => c.id),
      constraints: {
        ...app.tournament.constraints,
        balanceStarts: false,
        avoidRepeatOpponents: true,
        avoidSameClub: false,
        maxByesPerPlayer: 3,
      },
    }),
    [app.tournament, totalRounds, round, categories],
  );

  const reloadAll = () => {
    roster.reload();
    games.reload();
    reloadEvent();
    tablePlan.reload();
    cats.reload();
  };

  const run = async (label: string, fn: () => Promise<{ ok: boolean; message?: string } | boolean | void>) => {
    setBusy(label);
    try {
      const out = await fn();
      if (out && typeof out === "object" && !out.ok) {
        toast({ title: "Not done", description: out.message ?? "Please try again.", tone: "critical" });
      }
    } finally {
      setBusy(null);
    }
  };

  /* ---- Pairing ---------------------------------------------------------- */

  /** The groups that play each other: sections when the event has them, otherwise categories. */
  const groups = (): Player[][] => {
    const key = (p: Player) => (pairWithin ? `${sectionById.get(p.id) || "—"}|${p.division}` : p.division);
    const by2 = new Map<string, Player[]>();
    for (const p of players) by2.set(key(p), [...(by2.get(key(p)) ?? []), p]);
    return [...by2.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([, v]) => v);
  };

  const tablesFor = (division: string): number[] =>
    tablePlan.plan.find((t) => t.division === division)?.tables ?? [];

  /** Gives each board a table: the category's own range when it has one, otherwise the next free number. */
  const seat = (boards: Omit<DraftBoard, "table">[]): DraftBoard[] => {
    const used = new Set<number>();
    const result: DraftBoard[] = [];
    for (const b of boards) {
      const division = players.find((p) => p.id === b.a)?.division ?? "";
      const planned = tablesFor(division).find((t) => !used.has(t));
      let t = planned ?? 1;
      if (planned === undefined) while (used.has(t)) t += 1;
      used.add(t);
      result.push({ ...b, table: t });
    }
    return result;
  };

  const startDraft = (auto: boolean) => {
    const next = round + 1;
    if (next > totalRounds) {
      toast({ title: "That was the last round", description: "Finish the tournament below, or add a round in Setup.", tone: "warning" });
      return;
    }
    if (round > 0 && !roundDone) {
      toast({ title: `Round ${round} is not finished`, description: "Enter every score first.", tone: "warning" });
      return;
    }
    if (players.length < 2) {
      toast({ title: "Add students first", description: "At least two players are needed.", tone: "warning" });
      return;
    }
    if (!auto) {
      setDraft({ round: next, boards: [] });
      return;
    }
    const here = players.map((p) => ({ ...p, checkIn: "checked-in" as const }));
    const hereById = new Map(here.map((p) => [p.id, p]));
    const boards: Omit<DraftBoard, "table">[] = [];
    for (const group of groups()) {
      if (group.length < 2) continue;
      const result = generateRound({
        players: group.map((p) => hereById.get(p.id) ?? p),
        pairings: games.pairings,
        tournament: pairingTournament,
        round: next,
        random: Math.random,
      });
      for (const p of result.pairings) {
        boards.push({ key: nextKey(), a: p.playerAId, b: p.playerBId ?? "", aPlaysFirst: p.aPlaysFirst, reason: p.reason });
      }
    }
    setDraft({ round: next, boards: seat(boards) });
  };

  const draftProblems = (d: Draft): string[] => {
    const out: string[] = [];
    const seen = new Map<string, number>();
    const tables = new Map<number, number>();
    for (const b of d.boards) {
      for (const id of [b.a, b.b].filter(Boolean)) seen.set(id, (seen.get(id) ?? 0) + 1);
      tables.set(b.table, (tables.get(b.table) ?? 0) + 1);
      if (!b.a) out.push("A board has no first player.");
      const da = players.find((p) => p.id === b.a)?.division;
      const db = players.find((p) => p.id === b.b)?.division;
      if (b.b && da && db && da !== db) out.push(`${nameOf(b.a)} and ${nameOf(b.b)} are in different categories.`);
    }
    for (const [id, n] of seen) if (n > 1) out.push(`${nameOf(id)} is on more than one board.`);
    for (const [t, n] of tables) if (n > 1) out.push(`Table ${t} is used by ${n} boards.`);
    return out;
  };

  const publishDraft = async () => {
    if (!draft) return;
    const problems = draftProblems(draft);
    if (problems.length) {
      toast({ title: "Fix the pairings first", description: problems[0], tone: "critical" });
      return;
    }
    const plan: BoardPlan[] = draft.boards.map((b) => ({
      board: b.table,
      division: players.find((p) => p.id === b.a)?.division ?? "beginner",
      playerA: b.a,
      playerB: b.b || null,
      aPlaysFirst: b.aPlaysFirst ?? null,
      reason: b.reason ?? "Set by the director.",
    }));
    const check = validateBoardPlan(plan);
    if (!check.ok) {
      toast({ title: "These pairings are not valid", description: check.problems[0] ?? "", tone: "critical" });
      return;
    }
    await run("publish", async () => {
      const out = await publishRound(eventId, draft.round, plan, by);
      if (!out.ok) return out;
      await setEventPhase(eventId, "round-active", { force: true, by, reason: "Round published from the tournament manager" });
      setDraft(null);
      setViewRound(null);
      games.reload();
      toast({ title: `Round ${draft.round} published`, description: `${out.boards} boards. Enter scores below as they finish.`, tone: "success" });
    });
  };

  /** Takes the published round back into a draft so any board can be changed. Scores in it are removed. */
  const editPublishedRound = async () => {
    const scored = roundGames.filter((g) => g.scoreA !== null || g.scoreB !== null).length;
    if (
      !window.confirm(
        `Change the pairings for round ${round}?\n\nThe boards come back here to edit` +
          (scored ? `, and the ${scored} score(s) already entered are removed` : "") +
          `.`,
      )
    )
      return;
    await run("reopen", async () => {
      const keep: DraftBoard[] = roundGames
        .slice()
        .sort((x, y) => x.board - y.board)
        .map((g) => ({ key: nextKey(), table: g.board, a: g.playerA, b: g.playerB ?? "", aPlaysFirst: g.aPlaysFirst }));
      const ok = await clearRound(eventId, round);
      if (!ok) return { ok: false, message: "Could not take the round back." };
      games.reload();
      setDraft({ round, boards: keep });
    });
  };

  const finishTournament = async () => {
    if (!window.confirm("Finish the tournament?\n\nThis makes the final results public.")) return;
    await run("finish", async () => {
      const out = await setEventPhase(eventId, "completed", { force: true, by, reason: "Finished from the tournament manager" });
      if (out.ok) {
        reloadEvent();
        toast({ title: "Tournament finished", description: "The results page is live.", tone: "success" });
      }
      return out;
    });
  };

  /* ---- Render ----------------------------------------------------------- */

  if (!eventId) {
    return (
      <Card>
        <EmptyState title="Choose a tournament" description="Pick one from the switcher at the top of the page." />
      </Card>
    );
  }

  const progressPct = roundGames.length ? games.progress.percentComplete : 0;
  const finished = event?.state === "completed";

  /** What to do next, said once, with the one button that does it. */
  let next: { text: string; action?: React.ReactNode };
  if (players.length < 2) next = { text: "Add your students in step 1." };
  else if (draft) next = { text: `Round ${draft.round} is a draft. Check the boards, then publish.` };
  else if (finished) next = { text: "The tournament is finished. Results and certificates are ready." };
  else if (round === 0 || (roundDone && round < totalRounds))
    next = {
      text: round === 0 ? "Ready to start. Pair the first round." : `Round ${round} is complete. Pair round ${round + 1}.`,
      action: (
        <Button variant="primary" icon={<Shuffle className="size-4" />} onClick={() => startDraft(true)}>
          Pair round {round + 1} automatically
        </Button>
      ),
    };
  else if (roundDone)
    next = {
      text: `All ${totalRounds} rounds are complete.`,
      action: (
        <Button variant="primary" icon={<Trophy className="size-4" />} onClick={() => void finishTournament()} disabled={busy === "finish"}>
          Finish the tournament
        </Button>
      ),
    };
  else next = { text: `Round ${round} is being played. Enter each score in step 2.` };

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 pb-16">
      <PageHeader
        title={event?.name ?? "Tournament"}
        subtitle="Everything for this tournament on one page: students, pairings, tables, scores and standings."
        actions={
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={reloadAll}>
            Refresh
          </Button>
        }
      />

      <RosterGate access={roster.access} loaded={roster.loaded}>
        {/* ---- Progress ------------------------------------------------- */}
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{players.length} students</Badge>
            <Badge tone="neutral">
              Round {Math.max(round, draft?.round ?? 0) || 0} of {totalRounds}
            </Badge>
            {round > 0 ? (
              <Badge tone={roundDone ? "success" : "info"}>
                {games.progress.verified} of {games.progress.totalBoards} scores in
              </Badge>
            ) : null}
            {finished ? <Badge tone="success">Finished</Badge> : null}
          </div>
          {round > 0 ? <Progress value={progressPct} tone="success" label="Round progress" className="mt-3" /> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-[14.5px] font-semibold text-ink">{next.text}</p>
            {next.action}
            {finished ? (
              <>
                <Link href={`/results/event/${event?.slug}`} target="_blank">
                  <Button variant="secondary">Public results</Button>
                </Link>
                <Link href={`/app/events/${eventId}/awards`}>
                  <Button variant="secondary">Certificates</Button>
                </Link>
              </>
            ) : null}
          </div>
        </Card>

        <SetupCard
          eventId={eventId}
          event={event}
          categories={categories}
          tablePlan={tablePlan.plan}
          totalRounds={totalRounds}
          by={by}
          onSaved={reloadAll}
          toast={toast}
        />

        <StudentsCard
          eventId={eventId}
          players={roster.players.filter((p) => p.checkIn !== "withdrawn")}
          categories={categories}
          sections={sections}
          sectionById={sectionById}
          notHere={notHere}
          by={by}
          locked={games.games.length > 0}
          onChanged={() => {
            roster.reload();
            games.reload();
          }}
          toast={toast}
        />

        {/* ---- Pairings --------------------------------------------------- */}
        <Card>
          <CardHeader
            title="2. Pairings and tables"
            icon={<Shuffle className="size-4.5" />}
            action={
              !draft && !finished ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => startDraft(true)}>
                    Pair automatically
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => startDraft(false)}>
                    Pair by hand
                  </Button>
                </div>
              ) : null
            }
          />
          <div className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
            {draft ? (
              <DraftEditor
                draft={draft}
                players={players}
                sectionById={sectionById}
                categoryName={categoryName}
                problems={draftProblems(draft)}
                busy={busy === "publish"}
                onChange={setDraft}
                onPublish={() => void publishDraft()}
                onDiscard={() => setDraft(null)}
              />
            ) : round === 0 ? (
              <p className="text-[13.5px] text-muted">
                No round yet. {pairWithin ? "Students are paired inside their section." : "Students are paired inside their category."}{" "}
                Choose Pair automatically, or Pair by hand to choose every board yourself.
              </p>
            ) : (
              <PublishedBoards
                eventId={eventId}
                games={games.games}
                rounds={round}
                viewRound={viewRound ?? round}
                onViewRound={setViewRound}
                nameOf={nameOf}
                sectionById={sectionById}
                by={by}
                currentRound={round}
                onChanged={() => games.reload()}
                onEditPairings={() => void editPublishedRound()}
                toast={toast}
              />
            )}
          </div>
        </Card>

        {/* ---- Standings ---------------------------------------------------- */}
        <StandingsCard
          players={players}
          games={games}
          tournament={pairingTournament}
          categories={categories}
          sections={sections}
          sectionById={sectionById}
        />
      </RosterGate>
    </div>
  );
}

/* ========================================================================== */
/* Setup                                                                       */
/* ========================================================================== */

function SetupCard({
  eventId,
  event,
  categories,
  tablePlan,
  totalRounds,
  by,
  onSaved,
  toast,
}: {
  eventId: string;
  event: ReturnType<typeof useEventById>["event"];
  categories: Division[];
  tablePlan: { division: string; tables: number[] }[];
  totalRounds: number;
  by: string;
  onSaved: () => void;
  toast: Toast;
}) {
  const ids = categories.map((c) => c.id);
  const mode: CategoryMode | null =
    ids.length === 1 && ids[0] === "beginner"
      ? "beginner"
      : ids.length === 1 && ids[0] === "masters"
        ? "masters"
        : ids.includes("beginner") && ids.includes("masters") && ids.length === 2
          ? "both"
          : null;

  const [sectionsText, setSectionsText] = React.useState<string | null>(null);
  const [tableText, setTableText] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const sections = event?.details.sections ?? [];
  const shownSections = sectionsText ?? sections.join(", ");

  const saveDetails = async (patch: Record<string, unknown>) => {
    if (!event) return false;
    const out = await writeEventDetails(
      eventId,
      {
        name: event.name,
        subtitle: event.subtitle ?? "",
        details: { startDate: event.details.startDate, ...patch },
      },
      by,
    );
    if (!out.ok) toast({ title: "Not saved", description: out.message ?? "", tone: "critical" });
    return out.ok;
  };

  const setMode = async (m: CategoryMode) => {
    setBusy(true);
    const list = m === "beginner" ? [BEGINNER] : m === "masters" ? [MASTERS] : [BEGINNER, MASTERS];
    const out = await writeEventCategories(eventId, list, by);
    setBusy(false);
    if (!out.ok) {
      toast({ title: "Categories not changed", description: out.message ?? "", tone: "critical" });
      return;
    }
    onSaved();
  };

  const saveSections = async () => {
    const list = shownSections
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy(true);
    const ok = await saveDetails({ sections: list });
    setBusy(false);
    if (ok) {
      setSectionsText(null);
      onSaved();
    }
  };

  const saveTables = async () => {
    const plan = categories
      .map((c) => ({ division: c.id, tables: parseTableSpec(tableText[c.id] ?? formatTableSpec(tablePlan.find((t) => t.division === c.id)?.tables ?? [])) }))
      .filter((p) => p.tables.length > 0);
    setBusy(true);
    const out = await writeTablePlan(eventId, plan);
    setBusy(false);
    if (!out.ok) {
      toast({ title: "Tables not saved", description: out.message ?? "", tone: "critical" });
      return;
    }
    setTableText({});
    onSaved();
    toast({ title: "Tables saved", description: "", tone: "success" });
  };

  const modes: { key: CategoryMode; label: string }[] = [
    { key: "beginner", label: "Beginners only" },
    { key: "masters", label: "Masters only" },
    { key: "both", label: "Beginners and Masters" },
  ];

  return (
    <Card>
      <CardHeader title="Setup" icon={<CheckCircle2 className="size-4.5" />} />
      <div className="grid gap-5 p-4 pt-0 sm:p-5 sm:pt-0 lg:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink">Who plays</span>
          <div className="flex flex-wrap gap-2">
            {modes.map((m) => (
              <Button key={m.key} size="sm" variant={mode === m.key ? "primary" : "secondary"} disabled={busy} onClick={() => void setMode(m.key)}>
                {m.label}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {mode ? "Players are paired inside their category." : `Categories now: ${categories.map((c) => c.name).join(", ") || "none"}.`}
          </p>
        </div>

        <div>
          <Field label="Rounds" hint="Change it at any time before the last round.">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={busy || totalRounds <= 1} onClick={() => void saveDetails({ rounds: totalRounds - 1 }).then((ok) => ok && onSaved())}>
                −
              </Button>
              <span className="num w-10 text-center text-[18px] font-bold text-ink">{totalRounds}</span>
              <Button size="sm" variant="secondary" disabled={busy || totalRounds >= 12} onClick={() => void saveDetails({ rounds: totalRounds + 1 }).then((ok) => ok && onSaved())}>
                +
              </Button>
            </div>
          </Field>
        </div>

        <div>
          <Field label="Sections" hint="Separate with commas, for example Section A, Section B. Leave empty for none.">
            <div className="flex gap-2">
              <Input value={shownSections} onChange={(e) => setSectionsText(e.target.value)} placeholder="Section A, Section B, Section C" />
              <Button variant="secondary" disabled={busy || sectionsText === null} onClick={() => void saveSections()}>
                Save
              </Button>
            </div>
          </Field>
          {sections.length > 0 ? (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={event?.details.pairWithinSections !== false}
                onChange={(e) => void saveDetails({ pairWithinSections: e.target.checked }).then((ok) => ok && onSaved())}
              />
              Pair students only against their own section
            </label>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink">Tables</span>
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[13px] text-muted">{c.name}</span>
                <Input
                  value={tableText[c.id] ?? formatTableSpec(tablePlan.find((t) => t.division === c.id)?.tables ?? [])}
                  onChange={(e) => setTableText((t) => ({ ...t, [c.id]: e.target.value }))}
                  placeholder="e.g. 1-9 or 1, 2, 3"
                />
              </div>
            ))}
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void saveTables()}>
              Save tables
            </Button>
          </div>
          <p className="mt-1.5 text-[12px] text-muted">Boards are seated at these tables. You can still change any table below.</p>
        </div>
      </div>
    </Card>
  );
}

/* ========================================================================== */
/* Students                                                                    */
/* ========================================================================== */

function StudentsCard({
  eventId,
  players,
  categories,
  sections,
  sectionById,
  notHere,
  by,
  locked,
  onChanged,
  toast,
}: {
  eventId: string;
  players: Player[];
  categories: Division[];
  sections: string[];
  sectionById: Map<string, string>;
  notHere: Player[];
  by: string;
  locked: boolean;
  onChanged: () => void;
  toast: Toast;
}) {
  const [name, setName] = React.useState("");
  const [section, setSection] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [paste, setPaste] = React.useState("");
  const [showPaste, setShowPaste] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  const defaultCategory = category || categories[0]?.id || "";

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const db = supabase();
    if (!db) return "The database is not reachable right now.";
    const { error } = await db.rpc(fn, args);
    return error ? error.message.replace(/^.*?:\s*/, "") : null;
  };

  const add = async (n: string, s: string, c: string) => {
    return rpc("staff_add_student", { p_event_id: eventId, p_name: n, p_category: c, p_section: s, p_by: by });
  };

  const addOne = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const problem = await add(name.trim(), section, defaultCategory);
    setBusy(false);
    if (problem) return toast({ title: "Not added", description: problem, tone: "critical" });
    setName("");
    onChanged();
  };

  /** "Section A:" starts a section; every other line is a student. */
  const addPasted = async () => {
    let currentSection = section;
    const rows: { name: string; section: string }[] = [];
    for (const raw of paste.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const header = line.match(/^(section\s*[\w-]+|[\w ]+?)\s*:\s*$/i);
      if (header) {
        const found = sections.find((s) => s.toLowerCase() === header[1].trim().toLowerCase());
        currentSection = found ?? header[1].trim();
        continue;
      }
      rows.push({ name: line.replace(/^[-*\d.\s]+/, "").trim(), section: currentSection });
    }
    if (!rows.length) return;
    setBusy(true);
    let failed = 0;
    for (const r of rows) {
      if (await add(r.name, r.section, defaultCategory)) failed += 1;
    }
    setBusy(false);
    setPaste("");
    setShowPaste(false);
    onChanged();
    toast({ title: `${rows.length - failed} student${rows.length - failed === 1 ? "" : "s"} added`, description: failed ? `${failed} could not be added.` : "", tone: failed ? "warning" : "success" });
  };

  const checkInAll = async () => {
    setBusy(true);
    for (const p of notHere) await staffCheckIn(p.id, "Checked in from the tournament manager");
    setBusy(false);
    onChanged();
  };

  const shown = players.filter((p) => !filter.trim() || p.fullName.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <Card>
      <CardHeader
        title={`1. Students (${players.length})`}
        icon={<Users className="size-4.5" />}
        action={
          <Button size="sm" variant="secondary" onClick={() => setShowPaste((v) => !v)}>
            {showPaste ? "Close list" : "Paste a list"}
          </Button>
        }
      />
      <div className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
        {notHere.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-control bg-warning-050 px-3.5 py-2.5 text-[13px] text-[#a76d16]">
            <span className="flex-1">{notHere.length} not marked present yet. Only present students can be paired.</span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void checkInAll()}>
              Mark everyone present
            </Button>
          </div>
        ) : null}

        {showPaste ? (
          <div className="space-y-2 rounded-control border border-line p-3">
            <p className="text-[12.5px] text-muted">
              One name per line. A line like &ldquo;Section A:&rdquo; puts the names under it in that section.
            </p>
            <Textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Section A:\nRania\nPrachi\n\nSection B:\nIsmail"} />
            <Button variant="primary" disabled={busy || !paste.trim()} onClick={() => void addPasted()}>
              {busy ? "Adding…" : "Add these students"}
            </Button>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addOne()}
            placeholder="New student's name"
          />
          <Select value={section} onChange={(e) => setSection(e.target.value)} disabled={sections.length === 0}>
            <option value="">{sections.length ? "No section" : "Sections: none"}</option>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select value={defaultCategory} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button variant="primary" icon={<Plus className="size-4" />} disabled={busy || !name.trim()} onClick={() => void addOne()}>
            Add
          </Button>
        </div>

        {players.length > 8 ? (
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search students" className="sm:max-w-xs" />
        ) : null}

        {players.length === 0 ? (
          <p className="text-[13.5px] text-muted">No students yet. Add one above, or paste a list.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="text-[11.5px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">Name</th>
                  <th className="py-1.5 pr-2">Section</th>
                  <th className="py-1.5 pr-2">Category</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p, i) => (
                  <StudentRow
                    key={p.id}
                    index={i + 1}
                    player={p}
                    section={sectionById.get(p.id) ?? ""}
                    categories={categories}
                    sections={sections}
                    onSave={async (n, c, s) => {
                      const problem = await rpc("staff_update_student", { p_record_id: p.id, p_name: n, p_category: c, p_section: s, p_by: by });
                      if (problem) toast({ title: "Not saved", description: problem, tone: "critical" });
                      else onChanged();
                    }}
                    onDelete={async () => {
                      if (!window.confirm(`Delete ${p.fullName}?`)) return;
                      const problem = await rpc("staff_delete_student", { p_record_id: p.id, p_by: by });
                      if (problem) toast({ title: "Not deleted", description: problem, tone: "critical" });
                      else onChanged();
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {locked ? (
          <p className="text-[12px] text-muted">A student who has already played cannot be deleted. Rename or move them instead.</p>
        ) : null}
      </div>
    </Card>
  );
}

function StudentRow({
  index,
  player,
  section,
  categories,
  sections,
  onSave,
  onDelete,
}: {
  index: number;
  player: Player;
  section: string;
  categories: Division[];
  sections: string[];
  onSave: (name: string, category: string, section: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = React.useState(player.fullName);
  const sectionOptions = section && !sections.includes(section) ? [...sections, section] : sections;
  const categoryOptions = categories.some((c) => c.id === player.division) ? categories : [...categories, { id: player.division, name: player.division, shortName: "", accent: "primary" as const }];

  return (
    <tr className="border-t border-line">
      <td className="num py-1.5 pr-2 text-[13px] text-muted">{index}</td>
      <td className="py-1.5 pr-2">
        <Input
          className="h-9"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== player.fullName && void onSave(name.trim(), player.division, section)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </td>
      <td className="py-1.5 pr-2">
        <Select className="h-9" value={section} onChange={(e) => void onSave(name.trim() || player.fullName, player.division, e.target.value)}>
          <option value="">—</option>
          {sectionOptions.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </td>
      <td className="py-1.5 pr-2">
        <Select className="h-9" value={player.division} onChange={(e) => void onSave(name.trim() || player.fullName, e.target.value, section)}>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </td>
      <td className="py-1.5 text-right">
        <button type="button" onClick={() => void onDelete()} className="rounded-control p-2 text-muted hover:bg-critical-050 hover:text-critical" aria-label={`Delete ${player.fullName}`}>
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

/* ========================================================================== */
/* Pairings                                                                    */
/* ========================================================================== */

function DraftEditor({
  draft,
  players,
  sectionById,
  categoryName,
  problems,
  busy,
  onChange,
  onPublish,
  onDiscard,
}: {
  draft: Draft;
  players: Player[];
  sectionById: Map<string, string>;
  categoryName: (id: string) => string;
  problems: string[];
  busy: boolean;
  onChange: (d: Draft) => void;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  const used = new Set(draft.boards.flatMap((b) => [b.a, b.b].filter(Boolean)));
  const waiting = players.filter((p) => !used.has(p.id));

  const patch = (key: string, change: Partial<DraftBoard>) =>
    onChange({ ...draft, boards: draft.boards.map((b) => (b.key === key ? { ...b, ...change } : b)) });

  const label = (p: Player) => {
    const s = sectionById.get(p.id);
    return `${p.fullName}${s ? ` (${s.replace(/^Section\s*/i, "")})` : ""}`;
  };

  const playerSelect = (value: string, onPick: (id: string) => void, allowBye: boolean, takenElsewhere: Set<string>) => (
    <Select className="h-9" value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">{allowBye ? "Bye (no opponent)" : "Choose…"}</option>
      {players
        .filter((p) => p.id === value || !takenElsewhere.has(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {label(p)} · {categoryName(p.division)}
          </option>
        ))}
    </Select>
  );

  const nextTable = () => {
    const taken = new Set(draft.boards.map((b) => b.table));
    let t = 1;
    while (taken.has(t)) t += 1;
    return t;
  };

  return (
    <div className="space-y-3">
      <p className="text-[13.5px] font-semibold text-ink">
        Round {draft.round}: not published yet. Change anything, then publish.
      </p>

      {draft.boards.length === 0 ? <p className="text-[13px] text-muted">No boards yet. Add one below.</p> : null}

      <div className="space-y-2">
        {draft.boards
          .slice()
          .sort((x, y) => x.table - y.table)
          .map((b) => {
            const others = new Set(draft.boards.filter((o) => o.key !== b.key).flatMap((o) => [o.a, o.b].filter(Boolean)));
            return (
              <div key={b.key} className="grid items-center gap-2 rounded-control border border-line p-2.5 sm:grid-cols-[5.5rem_1fr_auto_1fr_auto]">
                <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  Table
                  <Input
                    className="h-9 w-16"
                    type="number"
                    min={1}
                    value={b.table}
                    onChange={(e) => patch(b.key, { table: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                  />
                </label>
                {playerSelect(b.a, (id) => patch(b.key, { a: id }), false, new Set([...others, ...(b.b ? [b.b] : [])]))}
                <span className="text-center text-[12px] font-semibold text-muted">vs</span>
                {playerSelect(b.b, (id) => patch(b.key, { b: id }), true, new Set([...others, ...(b.a ? [b.a] : [])]))}
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, boards: draft.boards.filter((o) => o.key !== b.key) })}
                  className="justify-self-end rounded-control p-2 text-muted hover:bg-critical-050 hover:text-critical"
                  aria-label="Remove this board"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => onChange({ ...draft, boards: [...draft.boards, { key: nextKey(), table: nextTable(), a: "", b: "" }] })}>
          Add a board
        </Button>
        {waiting.length > 0 ? (
          <span className="text-[12.5px] text-muted">
            Not on a board yet: {waiting.map((p) => p.fullName).join(", ")}
          </span>
        ) : (
          <span className="text-[12.5px] text-success">Everyone has a board.</span>
        )}
      </div>

      {problems.length > 0 ? (
        <ul className="space-y-1 rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<ArrowRight className="size-4" />} disabled={busy || draft.boards.length === 0 || problems.length > 0} onClick={onPublish}>
          {busy ? "Publishing…" : `Publish round ${draft.round}`}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onDiscard}>
          Discard this draft
        </Button>
      </div>
    </div>
  );
}

function PublishedBoards({
  eventId,
  games,
  rounds,
  viewRound,
  onViewRound,
  nameOf,
  sectionById,
  by,
  currentRound,
  onChanged,
  onEditPairings,
  toast,
}: {
  eventId: string;
  games: GameRow[];
  rounds: number;
  viewRound: number;
  onViewRound: (r: number) => void;
  nameOf: (id: string) => string;
  sectionById: Map<string, string>;
  by: string;
  currentRound: number;
  onChanged: () => void;
  onEditPairings: () => void;
  toast: Toast;
}) {
  const boards = games.filter((g) => g.round === viewRound).sort((x, y) => x.board - y.board);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
          <Button key={r} size="sm" variant={r === viewRound ? "primary" : "secondary"} onClick={() => onViewRound(r)}>
            Round {r}
          </Button>
        ))}
        {viewRound === currentRound ? (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={onEditPairings}>
            Change this round&rsquo;s pairings
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        {boards.map((g) => (
          <BoardRow key={g.id} game={g} eventId={eventId} nameOf={nameOf} sectionById={sectionById} by={by} onChanged={onChanged} toast={toast} />
        ))}
      </div>
    </div>
  );
}

function BoardRow({
  game,
  eventId,
  nameOf,
  sectionById,
  by,
  onChanged,
  toast,
}: {
  game: GameRow;
  eventId: string;
  nameOf: (id: string) => string;
  sectionById: Map<string, string>;
  by: string;
  onChanged: () => void;
  toast: Toast;
}) {
  const [a, setA] = React.useState(game.scoreA === null ? "" : String(game.scoreA));
  const [b, setB] = React.useState(game.scoreB === null ? "" : String(game.scoreB));
  const [table, setTable] = React.useState(String(game.board));
  const [busy, setBusy] = React.useState(false);
  const bye = !game.playerB;
  const done = game.status === "verified";
  const section = (sectionById.get(game.playerA) ?? "").replace(/^Section\s*/i, "");

  const save = async () => {
    const x = Number(a);
    const y = Number(b);
    if (a === "" || b === "" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      toast({ title: "Enter both scores", description: "Whole numbers, zero or more.", tone: "warning" });
      return;
    }
    setBusy(true);
    const out = await recordResult(game.id, Math.round(x), Math.round(y), by, "", eventId);
    setBusy(false);
    if (!out.ok) return toast({ title: "Score not saved", description: out.message, tone: "critical" });
    onChanged();
  };

  const clear = async () => {
    setBusy(true);
    const ok = await clearResult(game.id, eventId);
    setBusy(false);
    if (!ok) return toast({ title: "Could not clear it", description: "", tone: "critical" });
    setA("");
    setB("");
    onChanged();
  };

  const moveTable = async () => {
    const n = Math.round(Number(table));
    if (!Number.isFinite(n) || n < 1 || n === game.board) return setTable(String(game.board));
    const db = supabase();
    const { error } = (await db?.rpc("staff_move_table", { p_game_id: game.id, p_board: n, p_by: by })) ?? { error: { message: "Not reachable" } };
    if (error) {
      setTable(String(game.board));
      toast({ title: "Table not changed", description: error.message.replace(/^.*?:\s*/, ""), tone: "critical" });
      return;
    }
    onChanged();
  };

  return (
    <div className="grid items-center gap-2 rounded-control border border-line p-2.5 sm:grid-cols-[5.5rem_1fr_auto]">
      <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
        Table
        <Input className="h-9 w-16" type="number" min={1} value={table} onChange={(e) => setTable(e.target.value)} onBlur={() => void moveTable()} />
      </label>
      <div className="min-w-0">
        <p className="truncate text-[14.5px] font-semibold text-ink">
          {nameOf(game.playerA)}
          {bye ? "" : <span className="font-normal text-muted"> vs </span>}
          {bye ? "" : nameOf(game.playerB!)}
        </p>
        <p className="text-[12px] text-muted">{section ? `Section ${section}` : game.division}</p>
      </div>
      {bye ? (
        <Badge tone="neutral">Bye</Badge>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 w-20" type="number" min={0} inputMode="numeric" placeholder="Score" value={a} onChange={(e) => setA(e.target.value)} aria-label={`Score for ${nameOf(game.playerA)}`} />
          <span className="text-muted">–</span>
          <Input className="h-9 w-20" type="number" min={0} inputMode="numeric" placeholder="Score" value={b} onChange={(e) => setB(e.target.value)} aria-label={`Score for ${nameOf(game.playerB!)}`} />
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>
            {done ? "Update" : "Save"}
          </Button>
          {done ? (
            <>
              <Badge tone="success">Done</Badge>
              <button type="button" disabled={busy} onClick={() => void clear()} className="text-[12px] font-semibold text-muted underline-offset-4 hover:underline">
                Clear
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Standings                                                                   */
/* ========================================================================== */

function StandingsCard({
  players,
  games,
  tournament,
  categories,
  sections,
  sectionById,
}: {
  players: Player[];
  games: ReturnType<typeof useGames>;
  tournament: Parameters<typeof computeStandings>[2];
  categories: Division[];
  sections: string[];
  sectionById: Map<string, string>;
}) {
  const [view, setView] = React.useState("all");

  const blocks = React.useMemo(() => {
    if (players.length === 0) return [];
    if (view !== "all") {
      const subset = players.filter((p) => sectionById.get(p.id) === view);
      return [{ title: view, rows: computeStandings(subset, games.pairings, tournament) }];
    }
    return categories
      .map((c) => ({ title: c.name, rows: computeStandings(players, games.pairings, tournament, { division: c.id }) }))
      .filter((b) => b.rows.length > 0);
  }, [players, games.pairings, tournament, categories, view, sectionById]);

  const byId = new Map(players.map((p) => [p.id, p]));

  return (
    <Card>
      <CardHeader
        title="3. Scores and standings"
        icon={<Trophy className="size-4.5" />}
        action={
          sections.length > 0 ? (
            <Select className="h-9 w-44" value={view} onChange={(e) => setView(e.target.value)}>
              <option value="all">All sections</option>
              {sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          ) : null
        }
      />
      <div className="space-y-5 p-4 pt-0 sm:p-5 sm:pt-0">
        {games.games.length === 0 ? <p className="text-[13.5px] text-muted">Standings appear once scores are in. Scores are entered on the boards in step 2.</p> : null}
        {blocks.map((b) => (
          <div key={b.title}>
            <p className="mb-1.5 text-[13px] font-bold text-ink">{b.title}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left text-[13.5px]">
                <thead>
                  <tr className="text-[11.5px] uppercase tracking-wide text-muted">
                    <th className="py-1.5 pr-2">Rank</th>
                    <th className="py-1.5 pr-2">Student</th>
                    {sections.length > 0 ? <th className="py-1.5 pr-2">Section</th> : null}
                    <th className="py-1.5 pr-2 text-right">Played</th>
                    <th className="py-1.5 pr-2 text-right">Wins</th>
                    <th className="py-1.5 pr-2 text-right">Losses</th>
                    <th className="py-1.5 text-right">Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.playerId} className="border-t border-line">
                      <td className="num py-1.5 pr-2 font-bold text-ink">{r.rank}</td>
                      <td className="py-1.5 pr-2 font-semibold text-ink">{byId.get(r.playerId)?.fullName}</td>
                      {sections.length > 0 ? <td className="py-1.5 pr-2 text-muted">{sectionById.get(r.playerId) ?? ""}</td> : null}
                      <td className="num py-1.5 pr-2 text-right">{r.played}</td>
                      <td className="num py-1.5 pr-2 text-right">{r.wins}</td>
                      <td className="num py-1.5 pr-2 text-right">{r.losses}</td>
                      <td className="num py-1.5 text-right">{r.spread > 0 ? `+${r.spread}` : r.spread}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
