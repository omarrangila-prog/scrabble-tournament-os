"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  Dices,
  UserRound,
  ArrowRight,
  Check,
  Copy,
  Music,
  Save,
  Upload,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { PublicEvent } from "@/lib/domain/events";
import {
  BundleEvent,
  BUNDLE_DISCOUNT_PERCENT,
  affiliationWording,
  BUNDLE_MIN_EVENTS,
  CampaignReduction,
  describeBundle,
  GameOnRegistration,
  paymentInstructions,
  quoteBundle,
  quoteFee,
  validateRegistration,
} from "@/lib/domain/gameOn";
import {
  INTEREST_LABEL,
  InterestAnswer,
  MembershipStatus,
  ParticipationTrack,
  playsBoardGames,
  playsScrabble,
  TRACK_LABEL,
} from "@/lib/firebase/schema";
import {
  cheaperRateHint,
  describeRate,
  priceRegistration as priceByRate,
} from "@/lib/domain/pricing";
import { CATEGORY_LABEL, PlayerCategory } from "@/lib/domain/identity";
import { cn, formatDate } from "@/lib/utils";

const STEPS = [
  {
    id: "about",
    title: "About you",
    blurb: "Who you are and how we reach you.",
    icon: UserRound,
  },
  {
    id: "experience",
    title: "Choose your experience",
    blurb: "What you would like to join.",
    icon: Dices,
  },
  {
    id: "payment",
    title: "Payment",
    blurb: "Your fee, and how to pay it.",
    icon: Wallet,
  },
  {
    id: "review",
    title: "Review",
    blurb: "Check everything before submitting.",
    icon: ClipboardCheck,
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const TRACK_BLURB: Record<ParticipationTrack, string> = {
  board_games: "Casual board games, new people, no competition.",
  speed_scrabble: "The Speed Scrabble competition.",
  both: "Board games and the Speed Scrabble competition.",
};

/**
 * GAME ON! registration.
 *
 * Four short steps on a phone, not one long page. The second step is the one
 * that matters: what a participant chooses there decides which questions they
 * are asked afterwards and which parts of the evening apply to them, so nobody
 * is made to answer about Scrabble seeding to attend a board-game night.
 */
export function GameOnForm({
  event,
  onSubmit,
  campaign,
  onCampaignCode,
  otherEvents = [],
}: {
  event: PublicEvent;
  onSubmit: (registration: GameOnRegistration) => void;
  campaign?: CampaignReduction;
  onCampaignCode?: (code: string) => void;
  /** Other events on offer, for the multi-event bundle. */
  otherEvents?: BundleEvent[];
}) {
  const [step, setStep] = React.useState(0);
  const [reg, setReg] = React.useState<Partial<GameOnRegistration>>(() => {
    const offered = event.participationTracks ?? [];
    return {
      membershipStatus: "not-claimed" as MembershipStatus,
      communicationConsent: false,
      // A one-track event has nothing to choose, so it is chosen already.
      ...(offered.length === 1 ? { track: offered[0] as ParticipationTrack } : {}),
    };
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [codeInput, setCodeInput] = React.useState("");
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  /*
   * The event that was opened is always selected and cannot be removed —
   * unticking the event whose link you followed would leave the form with no
   * subject at all.
   */
  const [selectedEventIds, setSelectedEventIds] = React.useState<string[]>([event.id]);

  const draftKey = `game-on-draft-${event.id}`;

  // Restore once, in a state initialiser rather than an effect, so the form
  // comes up already filled instead of flashing empty.
  const [restored] = React.useState(() => {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as Partial<GameOnRegistration>) : null;
    } catch {
      return null;
    }
  });

  const [initialised, setInitialised] = React.useState(false);
  if (!initialised && restored) {
    setInitialised(true);
    setReg((r) => ({ ...r, ...restored }));
  }

  // Autosave after typing stops. The membership proof file is excluded: a file
  // cannot be restored from a string, and implying otherwise would leave
  // someone believing they had uploaded proof when they had not.
  React.useEffect(() => {
    if (Object.keys(reg).length <= 2) return;
    const id = window.setTimeout(() => {
      try {
        // Neither file survives a reload, so neither is implied to have.
        const { membershipProofFileName: _proof, receiptFileName: _receipt, ...rest } = reg;
        void _proof;
        void _receipt;
        localStorage.setItem(draftKey, JSON.stringify(rest));
        setSavedAt(new Date().toISOString());
      } catch {
        // A full quota must not break the form.
      }
    }, 700);
    return () => window.clearTimeout(id);
  }, [reg, draftKey]);

  const set = <K extends keyof GameOnRegistration>(key: K, value: GameOnRegistration[K]) => {
    setReg((r) => ({ ...r, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const { label: affiliationLabel, hint: affiliationHint } = affiliationWording(
    event.participationTracks,
  );

  /*
   * What this event actually offers.
   *
   * A one-track event asks nothing: there is no choice to make, so the track is
   * set for them. Asking "what would you like to join?" with a single option is
   * a question with a predetermined answer.
   */
  const availableTracks = (event.participationTracks ?? [
    "board_games",
    "speed_scrabble",
    "both",
  ]) as ParticipationTrack[];

  const onlyTrack = availableTracks.length === 1 ? availableTracks[0] : null;

  /*
   * Playing levels the event actually runs. Masters sits above Advanced and
   * neither August event fields it, so offering it invites a preference the
   * organizer cannot honour.
   */
  const levelOptions = (event.divisions?.length
    ? event.divisions
    : (Object.keys(CATEGORY_LABEL) as PlayerCategory[])) as PlayerCategory[];

  /*
   * The membership question is driven by the event's own member rate rather
   * than hardcoded. The two August events discount for different bodies —
   * Alliance Française for one, the Pakistan Scrabble Association for the
   * other — and a form naming the wrong one asks people to prove a membership
   * that earns them nothing. An event with no member rate shows no question.
   */
  const memberRate = event.rates?.find((r) => r.id === "member") ?? null;
  const memberBody = memberRate?.label.replace(/ member$/i, "") ?? "";
  const memberQuestion = memberRate
    ? `Are you ${/^[aeiou]/i.test(memberBody) ? "an" : "a"} ${memberBody} member?`
    : "";

  const rateResult = event.rates?.length
    ? priceByRate(event.rates, {
        isMember: reg.membershipStatus !== "not-claimed",
        groupSize: Math.max(1, (reg.accompanyingCount ?? 0) + 1),
        at: new Date().toISOString(),
      })
    : null;

  const quote = rateResult
    ? quoteFee(
        // The rate already reflects membership, so the older discount must not
        // be applied on top of it.
        "not-claimed",
        campaign,
        rateResult.perPerson,
        event.currency,
      )
    : quoteFee(reg.membershipStatus ?? "not-claimed", campaign, event.fee, event.currency);

  const money = (n: number) => `${event.currency} ${n.toLocaleString("en-PK")}`;

  const allEvents: BundleEvent[] = [
    { id: event.id, name: event.name, date: formatDate(event.startDate), fee: event.fee },
    ...otherEvents,
  ];

  const bundle = quoteBundle(
    allEvents.filter((e) => selectedEventIds.includes(e.id)),
    allEvents,
  );

  /*
   * The added events, priced into the panel below. The opened event is excluded
   * because its fee is already the base of `quote`.
   */
  const addedEvents = bundle.selected.filter((e) => e.id !== event.id);

  const toggleEvent = (id: string) => {
    if (id === event.id) return;
    setSelectedEventIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  };

  const instructions = paymentInstructions(
    event.paymentMethods,
    event.bankDetails,
    event.walletDetails,
  );

  /*
   * The receipt is required exactly when the upload is shown — that is, when
   * the event has an account to pay into. Same condition, so nobody is blocked
   * by a field they were never offered.
   */
  const requireReceipt = instructions.some((i) => i.accountNumber !== "—");

  /** Only blocks on problems belonging to the step being left. */
  const stepFields: Record<StepId, string[]> = {
    about: ["fullName", "email", "mobile", "city", "area"],
    experience: ["track", "requestedLevel"],
    payment: ["membershipNumber", "receiptFileName"],
    review: [],
  };

  const next = () => {
    const relevant = stepFields[STEPS[step].id];
    const problems = validateRegistration(reg, { requireReceipt }).filter((p) => relevant.includes(p.field));
    if (problems.length) {
      setErrors(Object.fromEntries(problems.map((p) => [p.field, p.message])));
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    const problems = validateRegistration(reg, { requireReceipt });
    if (problems.length) {
      setErrors(Object.fromEntries(problems.map((p) => [p.field, p.message])));
      // Send them back to the earliest step that still has a problem.
      const firstBad = STEPS.findIndex((s) =>
        stepFields[s.id].some((f) => problems.some((p) => p.field === f)),
      );
      if (firstBad >= 0) setStep(firstBad);
      return;
    }
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Nothing to do — a stale draft is harmless.
    }
    /*
     * The selection travels with the registration so the recorded amount matches
     * the quote. Without it the organizer would see one event's fee for someone
     * who signed up for two.
     */
    onSubmit({
      ...(reg as GameOnRegistration),
      selectedEventIds,
      bundleTotal: Math.max(
        0,
        quote.payable + addedEvents.reduce((s, e) => s + e.fee, 0) - bundle.bundleOff,
      ),
    });
  };

  const track = reg.track;
  const isReview = STEPS[step].id === "review";

  return (
    <div className="mx-auto w-full max-w-[600px]">
      {/* Progress ---------------------------------------------------------- */}
      <nav aria-label="Progress">
        <ol className="flex items-start gap-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            const StepIcon = s.icon;

            return (
              <React.Fragment key={s.id}>
                <li className="flex shrink-0 flex-col items-center gap-1.5">
                  <motion.span
                    aria-current={current ? "step" : undefined}
                    animate={current ? { scale: 1.06 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 26 }}
                    className={cn(
                      "grid size-10 place-items-center rounded-full transition-colors",
                      current
                        ? "bg-[#2F5D3A] text-white shadow-[0_6px_16px_rgba(47,93,58,0.3)]"
                        : done
                          ? "bg-[#C89B3C] text-white"
                          : "bg-[rgb(var(--c-line))] text-muted",
                    )}
                  >
                    {done ? (
                      <Check className="size-4.5" strokeWidth={3} />
                    ) : (
                      <StepIcon className="size-4.5" />
                    )}
                  </motion.span>

                  {/* Named on wider screens; the icon carries it on a phone. */}
                  <span
                    className={cn(
                      "hidden max-w-[92px] text-center text-[10.5px] font-semibold leading-tight sm:block",
                      current ? "text-[#2F5D3A]" : done ? "text-muted" : "text-faint",
                    )}
                  >
                    {s.title}
                  </span>
                </li>

                {i < STEPS.length - 1 ? (
                  <li className="mt-5 h-0.5 flex-1 overflow-hidden rounded-full bg-[rgb(var(--c-line))]">
                    <motion.span
                      className="block h-full rounded-full bg-[#C89B3C]"
                      initial={false}
                      animate={{ width: done ? "100%" : "0%" }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                    />
                  </li>
                ) : null}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>

      <p className="mt-3 text-center text-[12px] font-medium text-muted sm:hidden">
        Step {step + 1} of {STEPS.length} · {STEPS[step].title}
      </p>

      <Card className="mt-5 overflow-hidden">
        {/* Step heading, tinted so each step feels like its own place. */}
        <div
          className="flex items-start gap-3 border-b border-line p-5"
          style={{ background: "linear-gradient(180deg, rgba(47,93,58,0.05), transparent)" }}
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-control"
            style={{ background: "rgba(47,93,58,0.1)", color: "#2F5D3A" }}
          >
            {React.createElement(STEPS[step].icon, { className: "size-4.5" })}
          </span>
          <span className="min-w-0">
            <p className="text-[16.5px] font-bold text-ink">{STEPS[step].title}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              {STEPS[step].blurb}
            </p>
          </span>
        </div>

        <motion.div
          key={STEPS[step].id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="space-y-4 p-5"
        >
          {/* ---- Step 1: About you ---------------------------------------- */}
          {STEPS[step].id === "about" ? (
            <>
              <Field label="Full name" required error={errors.fullName}>
                <Input
                  autoFocus
                  value={reg.fullName ?? ""}
                  onChange={(e) => set("fullName", e.target.value)}
                  placeholder="As you would like it on your certificate"
                  invalid={!!errors.fullName}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email address" required error={errors.email}>
                  <Input
                    type="email"
                    value={reg.email ?? ""}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="you@example.com"
                    invalid={!!errors.email}
                  />
                </Field>
                <Field label="Mobile number" required error={errors.mobile}>
                  <Input
                    type="tel"
                    value={reg.mobile ?? ""}
                    onChange={(e) => set("mobile", e.target.value)}
                    placeholder="0300 1234567"
                    invalid={!!errors.mobile}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date of birth">
                  <Input
                    type="date"
                    value={reg.dateOfBirth ?? ""}
                    onChange={(e) => set("dateOfBirth", e.target.value)}
                  />
                </Field>
                <Field label="City" required error={errors.city}>
                  <Input
                    value={reg.city ?? ""}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Karachi"
                    invalid={!!errors.city}
                  />
                </Field>
              </div>

              {/*
                * Area within the city. The organizer uses this to see where
                * entrants travel from, which a city field alone cannot show when
                * almost everyone answers "Karachi".
                */}
              <Field
                label="Area of residence"
                required
                error={errors.area}
                hint="Which part of the city you travel from."
              >
                <Input
                  value={reg.area ?? ""}
                  onChange={(e) => set("area", e.target.value)}
                  placeholder="e.g. Clifton, D.H.A., Gulshan, P.E.C.H.S."
                  invalid={!!errors.area}
                />
              </Field>

              <Field label={affiliationLabel} hint={affiliationHint}>
                <Input
                  value={reg.affiliation ?? ""}
                  onChange={(e) => set("affiliation", e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {/* ---- Step 2: Experience --------------------------------------- */}
          {STEPS[step].id === "experience" ? (
            <>
              {/* Which events ------------------------------------------- */}
              {otherEvents.length ? (
                <Field
                  label="Which events would you like to join?"
                  hint={`Register for ${BUNDLE_MIN_EVENTS} or more and take ${BUNDLE_DISCOUNT_PERCENT}% off.`}
                >
                  <div className="space-y-2">
                    {allEvents.map((e) => {
                      const on = selectedEventIds.includes(e.id);
                      const isThisEvent = e.id === event.id;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          disabled={isThisEvent}
                          onClick={() => toggleEvent(e.id)}
                          aria-pressed={on}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-feature border p-3.5 text-left transition-all",
                            on
                              ? "border-[#C89B3C] bg-[#C89B3C]/10"
                              : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
                            isThisEvent && "cursor-default",
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-5 shrink-0 place-items-center rounded border-2 transition-colors",
                              on ? "border-[#C89B3C] bg-[#C89B3C] text-white" : "border-line",
                            )}
                          >
                            {on ? <Check className="size-3" strokeWidth={3} /> : null}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-bold text-ink">
                              {e.name}
                            </span>
                            <span className="block text-[11.5px] text-muted">
                              {e.date}
                              {isThisEvent ? " · the event you opened" : ""}
                            </span>
                          </span>

                          <span className="num shrink-0 text-[12.5px] font-semibold text-muted">
                            {money(e.fee)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : null}

              {/* Bundle nudge --------------------------------------------- */}
              {otherEvents.length ? (
                <motion.p
                  key={bundle.qualifies ? "earned" : "nudge"}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex items-start gap-2 rounded-control px-3.5 py-3 text-[12.5px] leading-relaxed",
                    bundle.qualifies
                      ? "bg-[#2F5D3A]/10 text-[#2F5D3A]"
                      : "bg-[#C89B3C]/12 text-[#8A6A1F]",
                  )}
                >
                  <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                  {describeBundle(bundle, event.currency)}
                </motion.p>
              ) : null}

              {onlyTrack ? null : (
              <Field
                label={`What would you like to join at ${event.name}?`}
                required
                error={errors.track}
              >
                <div className="space-y-2">
                  {/*
                    * The event's own tracks, not a hardcoded list. The 23 August
                    * form was offering Social Board Games and "Both" at a
                    * Scrabble-only event, under the heading "at GAME ON!".
                    */}
                  {availableTracks.map(
                    (t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set("track", t)}
                        aria-pressed={track === t}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-feature border p-3.5 text-left transition-colors",
                          track === t
                            ? "border-[#2F5D3A] bg-[#2F5D3A]/5"
                            : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                            track === t
                              ? "border-[#2F5D3A] bg-[#2F5D3A] text-white"
                              : "border-line",
                          )}
                        >
                          {track === t ? <Check className="size-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-ink">
                              {TRACK_LABEL[t]}
                            </span>
                            {t === "both" ? (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
                                style={{ background: "#C89B3C22", color: "#8A6A1F" }}
                              >
                                Most popular
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
                            {TRACK_BLURB[t]}
                          </span>
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </Field>
              )}

              {/* Board-game questions, only when they apply. */}
              {track && playsBoardGames(track) ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3.5 rounded-feature bg-[rgb(var(--c-surface-soft))] p-4"
                >
                  <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
                    <Users className="size-3.5" />
                    Board games
                  </p>

                  <Field label="Have you played modern board games before?">
                    <Select
                      value={reg.playedModernBoardGames === undefined ? "" : String(reg.playedModernBoardGames)}
                      onChange={(e) => set("playedModernBoardGames", e.target.value === "true")}
                    >
                      <option value="">Select…</option>
                      <option value="true">Yes</option>
                      <option value="false">No, this would be my first time</option>
                    </Select>
                  </Field>

                  <Field label="Are you coming alone or with friends?">
                    <Select
                      value={reg.attendingWith ?? ""}
                      onChange={(e) =>
                        set("attendingWith", e.target.value as "alone" | "with-friends")
                      }
                    >
                      <option value="">Select…</option>
                      <option value="alone">On my own</option>
                      <option value="with-friends">With friends</option>
                    </Select>
                  </Field>

                  {reg.attendingWith === "with-friends" ? (
                    <Field label="How many are coming with you?" hint="They register separately.">
                      <Input
                        type="number"
                        className="num"
                        value={reg.accompanyingCount ?? ""}
                        onChange={(e) =>
                          set("accompanyingCount", Math.max(0, Number(e.target.value)))
                        }
                      />
                    </Field>
                  ) : null}

                  <Field label="Games you enjoy" hint="Optional — helps us pick what to bring.">
                    <Input
                      value={reg.favouriteGames ?? ""}
                      onChange={(e) => set("favouriteGames", e.target.value)}
                      placeholder="e.g. Catan, Codenames"
                    />
                  </Field>
                </motion.div>
              ) : null}

              {/* Scrabble questions, only when they apply. */}
              {track && playsScrabble(track) ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3.5 rounded-feature bg-[rgb(var(--c-surface-soft))] p-4"
                >
                  <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
                    Speed Scrabble
                  </p>

                  <Field label="Have you played competitive Scrabble before?">
                    <Select
                      value={reg.playedCompetitiveScrabble === undefined ? "" : String(reg.playedCompetitiveScrabble)}
                      onChange={(e) => set("playedCompetitiveScrabble", e.target.value === "true")}
                    >
                      <option value="">Select…</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Select>
                  </Field>

                  <Field label="Have you attended a previous AlphaBattle event?">
                    <Select
                      value={reg.attendedPreviousEvent === undefined ? "" : String(reg.attendedPreviousEvent)}
                      onChange={(e) => set("attendedPreviousEvent", e.target.value === "true")}
                    >
                      <option value="">Select…</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Select>
                  </Field>

                  <Field
                    label="Preferred playing level"
                    required
                    error={errors.requestedLevel}
                    hint="Your selected level is a preference. Final placement may be reviewed using verified history, rating and organizer approval."
                  >
                    <Select
                      value={reg.requestedLevel ?? ""}
                      onChange={(e) => set("requestedLevel", e.target.value as PlayerCategory)}
                    >
                      <option value="">Choose a level…</option>
                      {/*
                        * The event's own divisions. Listing every category
                        * offered Masters at an event that does not run one.
                        */}
                      {levelOptions.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Previous tournament experience" hint="Optional.">
                    <Textarea
                      rows={2}
                      value={reg.previousTournaments ?? ""}
                      onChange={(e) => set("previousTournaments", e.target.value)}
                    />
                  </Field>

                  <Field label="Typical game score" hint="Optional — helps with seeding.">
                    <Input
                      type="number"
                      className="num"
                      value={reg.typicalScore ?? ""}
                      onChange={(e) => set("typicalScore", Math.max(0, Number(e.target.value)))}
                      placeholder="e.g. 350"
                    />
                  </Field>
                </motion.div>
              ) : null}
            </>
          ) : null}

          {/* ---- Step 3: Membership and payment ---------------------------- */}
          {STEPS[step].id === "payment" ? (
            <>
              {memberRate ? (
                <Field label={memberQuestion}>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "discount-requested" as MembershipStatus, label: "Yes" },
                      { value: "not-claimed" as MembershipStatus, label: "No" },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => set("membershipStatus", o.value)}
                        className={cn(
                          "rounded-control border px-3 py-3 text-[13.5px] font-semibold transition-colors",
                          reg.membershipStatus === o.value
                            ? "border-[#2F5D3A] bg-[#2F5D3A]/5 text-[#2F5D3A]"
                            : "border-line bg-[rgb(var(--c-surface-strong))] text-muted",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </Field>
              ) : null}

              {/*
                * No membership number, name or proof is collected.
                *
                * The organizer does not want them: three extra fields to claim a
                * discount is more friction than the discount is worth, and it
                * asks people to hand over documents to save PKR 300. The claim
                * is taken at face value here and checked against the association
                * list before the payment is verified.
                */}

              {onCampaignCode ? (
                <Field label="Promotion code" hint="Optional.">
                  <div className="flex gap-2">
                    <Input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      className="num uppercase"
                      placeholder="Optional"
                    />
                    <Button variant="secondary" onClick={() => onCampaignCode(codeInput)}>
                      Apply
                    </Button>
                  </div>
                </Field>
              ) : null}

              {rateResult ? (
                <div className="rounded-feature bg-[#2F5D3A]/8 p-4">
                  <p className="flex items-start gap-2 text-[13px] font-semibold" style={{ color: "#2F5D3A" }}>
                    <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                    {describeRate(rateResult, event.currency)}
                  </p>

                  {/* What they would need to do to pay less, when it is reachable. */}
                  {cheaperRateHint(rateResult, {
                    isMember: reg.membershipStatus !== "not-claimed",
                    groupSize: Math.max(1, (reg.accompanyingCount ?? 0) + 1),
                    at: new Date().toISOString(),
                  }) ? (
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                      {cheaperRateHint(rateResult, {
                        isMember: reg.membershipStatus !== "not-claimed",
                        groupSize: Math.max(1, (reg.accompanyingCount ?? 0) + 1),
                        at: new Date().toISOString(),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <FeePanel quote={quote} money={money} extra={addedEvents} extraOff={bundle.bundleOff} />

              {/* How to pay ------------------------------------------------ */}
              {instructions.length ? (
                <div className="rounded-feature border border-[#C89B3C]/40 bg-[#C89B3C]/8 p-4">
                  <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
                    <Wallet className="size-4" style={{ color: "#8A6A1F" }} />
                    How to pay
                  </p>

                  <div className="mt-3 space-y-2.5">
                    {instructions.map((inst) => (
                      <div
                        key={inst.method}
                        className="rounded-control border border-line bg-white/70 p-3.5"
                      >
                        <p className="text-[12.5px] font-bold" style={{ color: "#2F5D3A" }}>
                          {inst.method}
                        </p>

                        {inst.accountNumber !== "—" ? (
                          <dl className="mt-1.5 space-y-1">
                            {inst.bank ? (
                              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <dt className="shrink-0 text-[11.5px] text-muted">Bank</dt>
                                <dd className="min-w-0 text-[12.5px] font-semibold text-ink sm:text-right">
                                  {inst.bank}
                                </dd>
                              </div>
                            ) : null}
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                              <dt className="shrink-0 text-[11.5px] text-muted">Account title</dt>
                              <dd className="min-w-0 text-[12.5px] font-semibold text-ink sm:text-right">
                                {inst.accountTitle}
                              </dd>
                            </div>
                            {/*
                              * Stacks on a narrow screen. The account number and
                              * IBAN together are a long string, and side-by-side
                              * with its label it either squeezes the label out or
                              * overflows the card on a small phone.
                              */}
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                              <dt className="shrink-0 text-[11.5px] text-muted">
                                {inst.method === "Bank transfer" ? "Account number" : "Number"}
                              </dt>
                              <dd className="flex min-w-0 items-start gap-1.5 sm:justify-end">
                                <span className="num min-w-0 break-all text-[12.5px] font-semibold text-ink sm:text-right">
                                  {inst.accountNumber}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Copy ${inst.method} number`}
                                  onClick={() => {
                                    navigator.clipboard?.writeText(inst.accountNumber);
                                    setCopied(inst.method);
                                    window.setTimeout(() => setCopied(null), 1600);
                                  }}
                                  // 20px was too small to hit reliably on a
                                  // phone, and this is the control people use to
                                  // copy an IBAN.
                                  className="grid size-11 shrink-0 place-items-center rounded-control text-faint transition-colors hover:bg-[rgb(var(--c-line))] hover:text-ink"
                                >
                                  {copied === inst.method ? (
                                    <Check className="size-3" />
                                  ) : (
                                    <Copy className="size-3" />
                                  )}
                                </button>
                              </dd>
                            </div>
                          </dl>
                        ) : null}

                        {inst.note ? (
                          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                            {inst.note}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {/*
                    * No exact figure is quoted here. Participants pay different
                    * amounts — member, family and early-bird rates, bundles, and
                    * people paying for someone else — so naming one number would
                    * be wrong for most of them.
                    */}
                  <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "#8A6A1F" }}>
                    Keep your transfer receipt — you will need to upload it on this
                    step.
                  </p>
                </div>
              ) : (
                <p className="flex items-start gap-2 rounded-control bg-warning-050 px-3.5 py-3 text-[12.5px] leading-relaxed text-[#a76d16]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Payment details are being finalised. You can still register — the organizer will
                  send you payment instructions.
                </p>
              )}

              {/* Receipt ---------------------------------------------------- */}
              {instructions.some((i) => i.accountNumber !== "—") ? (
                <Field
                  label="Payment screenshot"
                  required
                  hint="A photo or screenshot of your transfer confirmation."
                  error={errors.receiptFileName}
                >
                  <label
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-2 rounded-feature border-2 border-dashed px-4 py-6 text-center transition-colors",
                      reg.receiptFileName
                        ? "border-[#2F5D3A] bg-[#2F5D3A]/5"
                        : "border-line hover:bg-[rgb(var(--c-surface-soft))]",
                    )}
                  >
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="sr-only"
                      onChange={(e) => set("receiptFileName", e.target.files?.[0]?.name ?? "")}
                    />
                    {reg.receiptFileName ? (
                      <>
                        <Check className="size-5" style={{ color: "#2F5D3A" }} />
                        <span className="text-[13px] font-semibold text-ink">
                          {reg.receiptFileName}
                        </span>
                        <span className="text-[11.5px] text-muted">Tap to replace</span>
                      </>
                    ) : (
                      <>
                        <Upload className="size-5 text-muted" />
                        <span className="text-[13px] font-semibold text-ink">
                          Upload your payment screenshot
                        </span>
                        <span className="text-[11.5px] text-muted">
                          Required to complete your registration
                        </span>
                      </>
                    )}
                  </label>
                </Field>
              ) : null}
            </>
          ) : null}

          {/* ---- Step 4: Review -------------------------------------------- */}
          {isReview ? (
            <>
              <ReviewBlock
                event={event}
                reg={reg}
                onEdit={(i) => setStep(i)}
                money={money}
                quote={quote}
                addedEvents={addedEvents}
                bundleOff={bundle.bundleOff}
              />

              {/* Jamming Session — a separate event, and a separate consent. */}
              <div className="rounded-feature border border-[#C89B3C]/40 bg-[#C89B3C]/10 p-4">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#8A6A1F]">
                  Keep the vibe going
                </p>
                <p className="mt-1 flex items-center gap-2 text-[15px] font-extrabold text-ink">
                  <Music className="size-4" />
                  Exclusive Jamming Session · 23 August
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  Enjoy music, creative energy and meeting new people? We are planning an exclusive
                  Jamming Session on 23 August. Register your interest now and be among the first to
                  receive the complete details and a priority invitation.
                </p>

                <Field label="Would you like to attend?" className="mt-3">
                  <div className="space-y-1.5">
                    {(Object.keys(INTEREST_LABEL) as InterestAnswer[]).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => set("jammingSessionInterest", a)}
                        className={cn(
                          "w-full rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
                          reg.jammingSessionInterest === a
                            ? "border-[#C89B3C] bg-[#C89B3C]/15 text-ink"
                            : "border-line bg-[rgb(var(--c-surface-strong))] text-muted",
                        )}
                      >
                        {INTEREST_LABEL[a]}
                      </button>
                    ))}
                  </div>
                </Field>

                <p className="mt-2 text-[11px] text-faint">
                  This does not affect your GAME ON! registration, and does not register you for a
                  paid event.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={reg.communicationConsent ?? false}
                  onChange={(e) => set("communicationConsent", e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-[#2F5D3A]"
                />
                <span className="text-[12.5px] leading-relaxed text-muted">
                  I agree to the event terms, and to being contacted about this event. You can ask
                  to stop at any time.
                </span>
              </label>
            </>
          ) : null}
        </motion.div>

        {/* Navigation --------------------------------------------------- */}
        <div className="flex items-center justify-between gap-2 border-t border-line bg-[rgb(var(--c-surface-soft))] p-4">
          <Button
            variant="secondary"
            icon={<ArrowLeft className="size-4" />}
            disabled={step === 0}
            onClick={back}
          >
            Back
          </Button>

          {isReview ? (
            <Button
              variant="primary"
              size="lg"
              className="border-0"
              style={{ background: "#2F5D3A", color: "white" }}
              onClick={submit}
            >
              Submit registration
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              className="border-0"
              style={{ background: "#2F5D3A", color: "white" }}
              onClick={next}
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </Card>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-faint">
        <Save className="size-3.5" />
        {savedAt
          ? "Saved on this device. You can close this page and come back."
          : "Your answers save automatically as you type."}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What the participant owes.
 *
 * `extra` carries the other events they added. Without it the panel showed only
 * the opened event's fee while the bundle line above promised a combined total —
 * so someone registering for both was quoted, and recorded as owing, one event.
 */
function FeePanel({
  quote,
  money,
  extra = [],
  extraOff = 0,
}: {
  quote: ReturnType<typeof quoteFee>;
  money: (n: number) => string;
  extra?: { name: string; date: string; fee: number }[];
  extraOff?: number;
}) {
  const total = Math.max(0, quote.payable + extra.reduce((s, e) => s + e.fee, 0) - extraOff);
  return (
    <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        What you owe
      </p>

      <div className="mt-2 space-y-1.5">
        {quote.lines.map((line, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-muted">
              {line.label}
              {line.provisional ? (
                <Badge tone="warning" className="ml-2">
                  Pending check
                </Badge>
              ) : null}
            </span>
            <span
              className={cn(
                "num shrink-0 text-[13.5px] font-semibold",
                line.amount < 0 ? "text-[#2F5D3A]" : "text-ink",
              )}
            >
              {line.amount < 0 ? "− " : ""}
              {money(Math.abs(line.amount))}
            </span>
          </div>
        ))}

        {extra.map((e) => (
          <div key={e.name} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-[13px] text-muted">
              {e.name} <span className="text-faint">· {e.date}</span>
            </span>
            <span className="num shrink-0 text-[13.5px] font-semibold text-ink">
              {money(e.fee)}
            </span>
          </div>
        ))}

        {extraOff > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-muted">
              Multi-event discount ({BUNDLE_DISCOUNT_PERCENT}%)
            </span>
            <span className="num shrink-0 text-[13.5px] font-semibold text-[#2F5D3A]">
              − {money(extraOff)}
            </span>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="text-[14px] font-bold text-ink">Amount due</span>
          <span className="num text-[18px] font-extrabold text-ink">{money(total)}</span>
        </div>
      </div>

      {quote.awaitingVerification ? (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-[#8A6A1F]">
          Your member discount is shown here and confirmed once we have checked your membership
          number. If it cannot be verified, the full fee applies.
        </p>
      ) : null}
    </div>
  );
}

function ReviewBlock({
  event,
  reg,
  onEdit,
  money,
  quote,
  addedEvents,
  bundleOff,
}: {
  event: PublicEvent;
  reg: Partial<GameOnRegistration>;
  onEdit: (step: number) => void;
  money: (n: number) => string;
  quote: ReturnType<typeof quoteFee>;
  /** Other events they added, so the review total matches the quote. */
  addedEvents: BundleEvent[];
  bundleOff: number;
}) {
  const rows: [string, string][] = [
    ["Name", reg.fullName ?? "—"],
    ["Email", reg.email ?? "—"],
    ["Mobile", reg.mobile ?? "—"],
    ["City", reg.city ?? "—"],
    ["Area", reg.area ?? "—"],
  ];

  if (reg.track) rows.push(["Joining", TRACK_LABEL[reg.track]]);
  if (reg.track && playsScrabble(reg.track) && reg.requestedLevel)
    rows.push(["Preferred level", CATEGORY_LABEL[reg.requestedLevel]]);

  return (
    <div className="space-y-3">
      <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-bold text-ink">Your details</p>
          <button
            onClick={() => onEdit(0)}
            className="text-[12px] font-semibold text-[#2F5D3A] underline-offset-2 hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="mt-2 space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <dt className="shrink-0 text-[12px] text-muted">{label}</dt>
              <dd className="min-w-0 break-words text-[12.5px] font-medium text-ink sm:text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-feature bg-[rgb(var(--c-surface-soft))] p-4">
        <p className="text-[13px] font-bold text-ink">The event</p>
        <dl className="mt-2 space-y-1.5">
          {[
            ["Date", formatDate(event.startDate)],
            ["Time", event.timeDisplay ?? event.startTime],
            ["Venue", `${event.venueName}, ${event.city}`],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <dt className="shrink-0 text-[12px] text-muted">{label}</dt>
              <dd className="min-w-0 break-words text-[12.5px] font-medium text-ink sm:text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <FeePanel quote={quote} money={money} extra={addedEvents} extraOff={bundleOff} />
    </div>
  );
}
