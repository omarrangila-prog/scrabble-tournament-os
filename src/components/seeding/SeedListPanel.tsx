"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Grid3x3,
  Info,
  Lock,
  LockOpen,
  MoveVertical,
  RefreshCw,
  School,
  Send,
  Sparkles,
  Wand2,
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
  Select,
  Textarea,
} from "@/components/ui";
import { PermissionDenied } from "@/components/ui/states";
import { useStore } from "@/lib/store/useStore";
import {
  firstRoundFromSeeds,
  generateSeeding,
  HYBRID_MAX_SHIFT,
  SeedEntry,
  SeedingMode,
  SeedResult,
  validateSeeding,
} from "@/lib/engine/seeding";
import { DivisionId } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Override = { seed: number; by: string; reason: string; at: string };

/**
 * Seed list workspace.
 *
 * Generates a draft seed order for one division, explains every position,
 * surfaces same-organization adjacency, and lets the director override, lock,
 * validate and publish. Publication is what makes the order available to the
 * Pairing Lab for building round one.
 */
export function SeedListPanel() {
  const router = useRouter();
  const store = useStore();
  const { players, divisions, currentUser } = store;

  const [division, setDivision] = React.useState<DivisionId>("masters");
  const [mode, setMode] = React.useState<SeedingMode>("rating");
  const [draft, setDraft] = React.useState<SeedResult | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [locked, setLocked] = React.useState<Set<string>>(new Set());
  const [overrides, setOverrides] = React.useState<Map<string, Override>>(new Map());
  const [published, setPublished] = React.useState<SeedResult | null>(null);

  const [whySeed, setWhySeed] = React.useState<SeedEntry | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<SeedEntry | null>(null);
  const [validateOpen, setValidateOpen] = React.useState(false);

  const pool = React.useMemo(
    () => players.filter((p) => p.division === division),
    [players, division],
  );
  const playerMap = React.useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const divisionName = divisions.find((d) => d.id === division)?.name ?? division;

  /** Same-mode regeneration under the alternate policy, for the comparison strip. */
  const comparison = React.useMemo(() => {
    if (pool.length === 0) return null;
    const rating = generateSeeding(pool, division, "rating", { locked, overrides });
    const hybrid = generateSeeding(pool, division, "hybrid", { locked, overrides });
    return {
      rating: rating.warnings.filter((w) => w.kind === "same-school").length,
      hybrid: hybrid.warnings.filter((w) => w.kind === "same-school").length,
    };
  }, [pool, division, locked, overrides]);

  const generate = (nextMode: SeedingMode = mode) => {
    if (!store.requireCapability("seeding.edit")) return;
    setGenerating(true);
    window.setTimeout(() => {
      const r = generateSeeding(pool, division, nextMode, { locked, overrides });
      setDraft(r);
      setGenerating(false);
      const schoolWarnings = r.warnings.filter((w) => w.kind === "same-school").length;
      store.toast({
        title: `${divisionName} seed list generated`,
        description: `${r.entries.length} players ordered by ${nextMode === "rating" ? "rating" : "hybrid"} seeding · ${
          schoolWarnings === 0
            ? "no same-organization adjacency"
            : `${schoolWarnings} same-organization warning${schoolWarnings === 1 ? "" : "s"}`
        }.`,
        tone: schoolWarnings > 0 ? "warning" : "success",
      });
    }, 420);
  };

  const switchMode = (next: SeedingMode) => {
    setMode(next);
    if (draft) generate(next);
  };

  const validation = React.useMemo(
    () => (draft ? validateSeeding(draft, playerMap) : null),
    [draft, playerMap],
  );

  const schoolWarnings = draft?.warnings.filter((w) => w.kind === "same-school") ?? [];
  const infoWarnings = draft?.warnings.filter((w) => w.kind !== "same-school") ?? [];

  const publish = () => {
    if (!draft) return;
    if (!store.requireCapability("seeding.edit")) return;

    // Persist the agreed order onto the player records.
    for (const e of draft.entries) store.setSeed(e.playerId, e.seed);

    setPublished(draft);
    setValidateOpen(false);
    store.logAudit({
      user: currentUser?.name ?? "Demo user",
      role: store.role,
      action: "Seeding published",
      target: divisionName,
      newValue: `${draft.entries.length} seeds · ${draft.mode} mode`,
      reason: `${overrides.size} director override(s), ${locked.size} locked seed(s)`,
      device: "Desktop · Chrome",
    });
    store.toast({
      title: `${divisionName} seeding published`,
      description: "The Pairing Lab can now build round one from this order.",
      tone: "success",
    });
  };

  return (
    <div className="space-y-4">
      {/* Controls -------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Seed list"
          subtitle="Generate a draft order, review every position, then publish for pairing"
          icon={<Wand2 className="size-4.5" />}
          action={
            published ? (
              <Badge tone="success" dot>
                Published
              </Badge>
            ) : draft ? (
              <Badge tone="warning" dot>
                Draft
              </Badge>
            ) : null
          }
        />
        <div className="grid gap-3 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Division">
            <Select
              value={division}
              onChange={(e) => {
                setDivision(e.target.value as DivisionId);
                setDraft(null);
                setPublished(null);
                setLocked(new Set());
                setOverrides(new Map());
              }}
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {players.filter((p) => p.division === d.id).length} players
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Seeding method">
            <Select value={mode} onChange={(e) => switchMode(e.target.value as SeedingMode)}>
              <option value="rating">Rating-Based Seeding</option>
              <option value="hybrid">Hybrid Seeding</option>
            </Select>
          </Field>

          <div className="flex items-end">
            <Button
              variant="primary"
              className="w-full lg:w-auto"
              loading={generating}
              icon={<Wand2 className="size-4" />}
              onClick={() => generate()}
            >
              Generate Draft
            </Button>
          </div>
        </div>

        {/* Method explanation */}
        <div className="px-5 pb-5">
          <p className="rounded-control bg-info-050 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#2668c9]">
            {mode === "rating" ? (
              <>
                <strong className="font-bold">Rating-Based Seeding</strong> orders players strictly
                by descending rating. It is simple and easy to defend, but clubmates with similar
                ratings land next to each other, and a Swiss draw often pairs adjacent seeds in
                round one.
              </>
            ) : (
              <>
                <strong className="font-bold">Hybrid Seeding</strong> keeps the same rating order,
                then separates same-organization neighbours by at most{" "}
                {HYBRID_MAX_SHIFT} places. The rating order stays visible — no player moves further
                than that, so the strongest player is still seed 1.
              </>
            )}
          </p>
        </div>
      </Card>

      {/* Health summary --------------------------------------------------- */}
      {draft && validation ? (
        <Card variant="data">
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Players seeded" value={validation.playerCount} ok />
            <Metric label="Duplicate seeds" value={validation.duplicateSeeds} ok={validation.duplicateSeeds === 0} />
            <Metric label="Missing seeds" value={validation.missingSeeds} ok={validation.missingSeeds === 0} />
            <Metric
              label="Same-school adjacent"
              value={validation.sameSchoolAdjacent}
              ok={validation.sameSchoolAdjacent === 0}
              warn
            />
            <Metric label="Director overrides" value={validation.overrides} ok neutral />
            <Metric label="Locked seeds" value={locked.size} ok neutral />
          </div>

          {/* Mode comparison — shows hybrid reduces warnings without hiding rating order */}
          {comparison ? (
            <div className="border-t border-line px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-muted">
                  Same-organization adjacency by method
                </span>
                <span className="flex items-center gap-2 text-[13px]">
                  <Badge tone={mode === "rating" ? "primary" : "neutral"}>Rating</Badge>
                  <span className="num font-bold text-ink">{comparison.rating}</span>
                </span>
                <ArrowRight className="size-3.5 text-faint" />
                <span className="flex items-center gap-2 text-[13px]">
                  <Badge tone={mode === "hybrid" ? "primary" : "neutral"}>Hybrid</Badge>
                  <span className="num font-bold text-success">{comparison.hybrid}</span>
                </span>
                <span className="text-[12.5px] text-muted">
                  Maximum movement {validation.maxShift} place
                  {validation.maxShift === 1 ? "" : "s"} — rating order preserved.
                </span>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Warnings --------------------------------------------------------- */}
      {schoolWarnings.length > 0 ? (
        <Card className="border-warning/30">
          <CardHeader
            title={`${schoolWarnings.length} same-organization warning${schoolWarnings.length === 1 ? "" : "s"}`}
            subtitle="Adjacent seeds from one school or club are often drawn together in round one"
            icon={<School className="size-4.5" />}
          />
          <div className="space-y-2 px-5 pb-5">
            {schoolWarnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-compact border border-warning/25 bg-warning-050/50 px-3.5 py-3"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#a76d16]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed text-ink">{w.message}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {w.seeds.map((s) => (
                      <span
                        key={s}
                        className="num rounded-full bg-[rgb(var(--c-surface-strong))] px-2 py-0.5 text-[11.5px] font-bold text-muted"
                      >
                        Seed {s}
                      </span>
                    ))}
                  </p>
                </div>
                {mode === "rating" ? (
                  <Button size="sm" variant="secondary" onClick={() => switchMode("hybrid")}>
                    Try Hybrid
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {infoWarnings.length > 0 ? (
        <Card>
          <div className="space-y-1.5 p-4">
            {infoWarnings.slice(0, 3).map((w, i) => (
              <p
                key={i}
                className="flex items-start gap-2 rounded-control bg-info-050/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#2668c9]"
              >
                <Info className="mt-px size-3.5 shrink-0" />
                {w.message}
              </p>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Ordered seed list ------------------------------------------------ */}
      {draft ? (
        <Card variant="data" data-tour="seed-list">
          <CardHeader
            title={`${divisionName} seed order`}
            subtitle={`${draft.entries.length} players · ${draft.mode === "rating" ? "rating-based" : "hybrid"} seeding`}
            icon={<MoveVertical className="size-4.5" />}
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RefreshCw className="size-3.5" />}
                  onClick={() => generate()}
                  loading={generating}
                >
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<CheckCircle2 className="size-3.5" />}
                  onClick={() => setValidateOpen(true)}
                >
                  Run Validation
                </Button>
              </div>
            }
          />

          <div className="max-h-[62vh] space-y-1 overflow-y-auto px-3 pb-4 scroll-slim">
            <AnimatePresence initial={false}>
              {draft.entries.map((e) => {
                const p = playerMap.get(e.playerId);
                if (!p) return null;
                const flagged = schoolWarnings.some((w) => w.seeds.includes(e.seed));

                return (
                  <motion.div
                    key={e.playerId}
                    layout
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      "flex items-center gap-3 rounded-compact border px-3 py-2.5",
                      flagged
                        ? "border-warning/30 bg-warning-050/40"
                        : "border-line bg-[rgb(var(--c-surface-strong))]",
                    )}
                  >
                    <span
                      className={cn(
                        "num grid size-9 shrink-0 place-items-center rounded-control text-[13.5px] font-extrabold",
                        e.seed <= 3
                          ? "bg-gradient-to-br from-primary to-secondary text-white"
                          : "bg-[rgb(var(--c-line))] text-ink",
                      )}
                    >
                      {e.seed}
                    </span>

                    <Avatar initials={p.initials} hue={p.avatarHue} size={34} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-ink">{p.fullName}</p>
                      <p className="truncate text-[11.5px] text-muted">
                        {p.playerId} · {p.club}
                      </p>
                    </div>

                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="num text-[13.5px] font-bold text-ink">{p.rating || "—"}</p>
                      <p className="text-[10.5px] text-muted">Rating</p>
                    </div>

                    {/* Movement from the rating order */}
                    <div className="hidden w-16 shrink-0 text-right md:block">
                      {e.shift === 0 ? (
                        <span className="text-[11.5px] text-faint">—</span>
                      ) : (
                        <span
                          className={cn(
                            "num text-[12px] font-bold",
                            e.shift > 0 ? "text-success" : "text-critical",
                          )}
                        >
                          {e.shift > 0 ? "▲" : "▼"} {Math.abs(e.shift)}
                        </span>
                      )}
                      <p className="text-[10px] text-faint">vs rating</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {e.override ? <Badge tone="info">Override</Badge> : null}
                      {e.locked ? (
                        <Badge tone="primary" dot>
                          Locked
                        </Badge>
                      ) : null}

                      <Button size="sm" variant="ghost" onClick={() => setWhySeed(e)}>
                        Why this seed?
                      </Button>

                      <button
                        onClick={() => setMoveTarget(e)}
                        aria-label={`Move ${p.fullName}`}
                        className="rounded-control p-2 text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
                      >
                        <MoveVertical className="size-4" />
                      </button>

                      <button
                        onClick={() =>
                          setLocked((s) => {
                            const next = new Set(s);
                            if (next.has(e.playerId)) next.delete(e.playerId);
                            else next.add(e.playerId);
                            return next;
                          })
                        }
                        aria-label={e.locked ? "Unlock seed" : "Lock seed"}
                        className="rounded-control p-2 text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
                      >
                        {e.locked ? (
                          <Lock className="size-4 text-primary" />
                        ) : (
                          <LockOpen className="size-4" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-feature bg-gradient-to-br from-primary-050 to-secondary-050 text-primary">
              <Wand2 className="size-6" />
            </span>
            <p className="mt-3 text-[15.5px] font-bold text-ink">
              No seed list generated for {divisionName}
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13.5px] leading-relaxed text-muted">
              Choose a seeding method and generate a draft. Nothing is applied to players until you
              validate and publish.
            </p>
            <Button variant="primary" className="mt-4" loading={generating} onClick={() => generate()}>
              Generate Draft
            </Button>
          </div>
        </Card>
      )}

      {/* Published → Pairing Lab handoff ---------------------------------- */}
      {published ? (
        <Card className="border-success/30">
          <CardHeader
            title="Seeding published"
            subtitle="Round one is built from this order using a top-half versus bottom-half fold"
            icon={<CheckCircle2 className="size-4.5" />}
            action={
              <Button
                variant="primary"
                icon={<Grid3x3 className="size-4" />}
                onClick={() => router.push("/app/pairings?tab=preview")}
              >
                Open Pairing Lab
              </Button>
            }
          />
          <div className="px-5 pb-5">
            <p className="mb-3 text-[12.5px] text-muted">
              First-round preview — seed 1 meets seed {Math.floor(published.entries.length / 2) + 1},
              and so on down the list.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {firstRoundFromSeeds(published)
                .slice(0, 8)
                .map((m) => {
                  const top = playerMap.get(m.topId);
                  const bottom = playerMap.get(m.bottomId);
                  return (
                    <div
                      key={m.board}
                      className="rounded-compact border border-line bg-[rgb(var(--c-surface-strong))] p-3"
                    >
                      <p className="num text-[11.5px] font-bold uppercase tracking-[0.05em] text-primary">
                        Board {m.board}
                      </p>
                      <p className="mt-1 truncate text-[12.5px] font-semibold text-ink">
                        <span className="num text-muted">#{m.topSeed}</span> {top?.fullName}
                      </p>
                      <p className="truncate text-[12.5px] text-muted">
                        <span className="num">#{m.bottomSeed}</span> {bottom?.fullName}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Drawers and dialogs --------------------------------------------- */}
      <WhySeedDrawer
        entry={whySeed}
        onClose={() => setWhySeed(null)}
        playerName={whySeed ? (playerMap.get(whySeed.playerId)?.fullName ?? "") : ""}
        mode={draft?.mode ?? mode}
      />

      <MoveSeedModal
        entry={moveTarget}
        total={draft?.entries.length ?? 0}
        playerName={moveTarget ? (playerMap.get(moveTarget.playerId)?.fullName ?? "") : ""}
        onClose={() => setMoveTarget(null)}
        onConfirm={(seed, reason) => {
          if (!moveTarget) return;
          const next = new Map(overrides);
          next.set(moveTarget.playerId, {
            seed,
            by: currentUser?.name ?? "Tournament Director",
            reason,
            at: new Date().toISOString(),
          });
          setOverrides(next);
          const r = generateSeeding(pool, division, mode, { locked, overrides: next });
          setDraft(r);
          store.logAudit({
            user: currentUser?.name ?? "Demo user",
            role: store.role,
            action: "Seed position overridden",
            target: playerMap.get(moveTarget.playerId)?.playerId ?? moveTarget.playerId,
            previousValue: `Seed ${moveTarget.seed}`,
            newValue: `Seed ${seed}`,
            reason,
            device: "Desktop · Chrome",
          });
          store.toast({
            title: "Seed position changed",
            description: `${playerMap.get(moveTarget.playerId)?.fullName} moved to seed ${seed}. The reason was recorded in the audit log.`,
            tone: "success",
          });
          setMoveTarget(null);
        }}
      />

      <ValidationModal
        open={validateOpen}
        onClose={() => setValidateOpen(false)}
        validation={validation}
        divisionName={divisionName}
        lockedCount={locked.size}
        onPublish={publish}
        onLockAll={() => {
          if (!draft) return;
          setLocked(new Set(draft.entries.map((e) => e.playerId)));
          store.toast({
            title: "All seeds locked",
            description: "Regeneration will preserve every position in this division.",
            tone: "info",
          });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Metric({
  label,
  value,
  ok,
  warn,
  neutral,
}: {
  label: string;
  value: number;
  ok: boolean;
  warn?: boolean;
  neutral?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-compact px-3 py-2.5",
        neutral
          ? "bg-[rgb(var(--c-surface-soft))]"
          : ok
            ? "bg-success-050/70"
            : warn
              ? "bg-warning-050/70"
              : "bg-critical-050/70",
      )}
    >
      <p className="num text-[20px] font-extrabold text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] font-medium text-muted">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function WhySeedDrawer({
  entry,
  onClose,
  playerName,
  mode,
}: {
  entry: SeedEntry | null;
  onClose: () => void;
  playerName: string;
  mode: SeedingMode;
}) {
  if (!entry) return null;

  return (
    <Drawer
      open={!!entry}
      onClose={onClose}
      title={`Why seed ${entry.seed}?`}
      subtitle={playerName}
      width="md"
    >
      <div className="space-y-4">
        <div className="rounded-compact bg-gradient-to-br from-primary-050 to-secondary-050 p-4">
          <p className="text-[13px] font-bold text-primary-600">Summary</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{entry.reason}</p>
        </div>

        <div className="rounded-compact bg-[rgb(var(--c-surface-soft))] p-4">
          <p className="text-[13px] font-bold text-ink">How this position was reached</p>
          <ol className="mt-2.5 space-y-2">
            {entry.factors.map((f, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-primary-050 text-[11px] font-bold text-primary-600">
                  {i + 1}
                </span>
                <span className="text-[12.5px] leading-relaxed text-muted">{f}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Box label="Final seed" value={String(entry.seed)} />
          <Box label="Rating seed" value={String(entry.ratingSeed)} />
          <Box
            label="Movement"
            value={entry.shift === 0 ? "None" : `${entry.shift > 0 ? "+" : ""}${entry.shift}`}
          />
        </div>

        <p className="flex items-start gap-1.5 rounded-control bg-info-050 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#2668c9]">
          <Info className="mt-px size-3.5 shrink-0" />
          {mode === "hybrid"
            ? `Hybrid seeding may move a player at most ${HYBRID_MAX_SHIFT} places from their rating position, so the rating order remains the primary signal.`
            : "Rating-based seeding never moves a player from their rating position. Switch to hybrid seeding to separate same-organization neighbours."}
        </p>
      </div>
    </Drawer>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2.5 text-center">
      <p className="num text-[17px] font-extrabold text-ink">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MoveSeedModal({
  entry,
  total,
  playerName,
  onClose,
  onConfirm,
}: {
  entry: SeedEntry | null;
  total: number;
  playerName: string;
  onClose: () => void;
  onConfirm: (seed: number, reason: string) => void;
}) {
  const role = useStore((s) => s.role);
  const [seed, setSeed] = React.useState("");
  const [reason, setReason] = React.useState("");
  const canOverride = role === "director";

  const [last, setLast] = React.useState(entry);
  if (last !== entry) {
    setLast(entry);
    setSeed(entry ? String(entry.seed) : "");
    setReason("");
  }

  if (!entry) return null;
  const target = Number(seed);
  const valid = !Number.isNaN(target) && target >= 1 && target <= total && reason.trim().length > 3;

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={`Move ${playerName}`}
      subtitle={`Currently seed ${entry.seed} of ${total}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || !canOverride} onClick={() => onConfirm(target, reason)}>
            Apply override
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {entry.locked ? (
          <p className="flex items-start gap-2 rounded-control bg-primary-050 px-3.5 py-2.5 text-[12.5px] text-primary-600">
            <Lock className="mt-px size-3.5 shrink-0" />
            This seed is locked. Moving it replaces the locked position with your chosen seed.
          </p>
        ) : null}

        <Field label="New seed position" required>
          <Input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            inputMode="numeric"
            className="num"
            invalid={!!seed && (Number.isNaN(target) || target < 1 || target > total)}
          />
        </Field>

        {!canOverride ? (
          <PermissionDenied capability="seeding.edit" compact />
        ) : (
          <Field
            label="Override reason"
            required
            hint="Required for any manual seeding change. Recorded in the audit log against your name."
          >
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Defending champion protected from an early same-club draw."
            />
          </Field>
        )}

        <p className="rounded-control bg-warning-050 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#a76d16]">
          A manual move overrides the seeding method for this player. Every other position shifts to
          keep the sequence contiguous.
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ValidationModal({
  open,
  onClose,
  validation,
  divisionName,
  lockedCount,
  onPublish,
  onLockAll,
}: {
  open: boolean;
  onClose: () => void;
  validation: ReturnType<typeof validateSeeding> | null;
  divisionName: string;
  lockedCount: number;
  onPublish: () => void;
  onLockAll: () => void;
}) {
  if (!validation) return null;

  const rows: [string, number, boolean][] = [
    ["Players seeded", validation.playerCount, true],
    ["Duplicate seed positions", validation.duplicateSeeds, validation.duplicateSeeds === 0],
    ["Missing seed positions", validation.missingSeeds, validation.missingSeeds === 0],
    ["Same-organization adjacency", validation.sameSchoolAdjacent, validation.sameSchoolAdjacent === 0],
    ["Unrated players placed", validation.unratedPlaced, true],
    ["Director overrides", validation.overrides, true],
    ["Locked seeds", lockedCount, true],
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${divisionName} seeding validation`}
      subtitle="Confirm before the order is applied to players and used for pairing."
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Back to list
          </Button>
          <Button variant="secondary" icon={<Lock className="size-4" />} onClick={onLockAll}>
            Lock all seeds
          </Button>
          <Button
            variant="primary"
            disabled={!validation.valid}
            icon={<Send className="size-4" />}
            onClick={onPublish}
          >
            Publish Seeding
          </Button>
        </div>
      }
    >
      <ul className="space-y-2">
        {rows.map(([label, value, ok]) => (
          <li
            key={label}
            className="flex items-center justify-between rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5"
          >
            <span className="flex items-center gap-2 text-[13.5px] text-ink">
              {ok ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <AlertTriangle className="size-4 text-warning" />
              )}
              {label}
            </span>
            <span className="num text-[14px] font-bold text-ink">{value}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2">
        {validation.messages.map((m, i) => (
          <p
            key={i}
            className={cn(
              "rounded-control px-3.5 py-2.5 text-[12.5px] leading-relaxed",
              validation.valid ? "bg-success-050 text-[#12855c]" : "bg-warning-050 text-[#a76d16]",
            )}
          >
            {m}
          </p>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
        <Sparkles className="mt-px size-3.5 shrink-0" />
        Publishing writes the seed order onto every player record and makes it available to the
        Pairing Lab for building round one.
      </p>
    </Modal>
  );
}
