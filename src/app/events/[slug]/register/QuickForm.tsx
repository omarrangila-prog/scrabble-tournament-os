"use client";

import * as React from "react";
import { Check, FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";

import type { PublicEvent } from "@/lib/domain/events";
import {
  checkProofFile,
  megabytes,
  PROOF_ACCEPT,
  proofRequired,
  type PaymentChoice,
} from "@/lib/domain/paymentProof";
import {
  cheaperRateHint,
  priceActivity,
  resolvePromo,
  priceRegistration,
  rateCardFor,
  rateNeedsVerification,
  type ActivityPrice,
  type PromoCode,
  type RateContext,
} from "@/lib/domain/pricing";
import {
  ageInYear,
  coversTwoPeople,
  EMPTY_DETAILS,
  EMPTY_SCRABBLE,
  needsPaintingParticipant,
  needsScrabbleParticipant,
  participantProblems,
  primaryActivity,
  primaryParticipant,
  resolveParticipants,
  type ActivityChoice,
  type ParticipantDetails,
  type ParticipantField,
  type ResolvedParticipants,
  type ScrabbleParticipant,
} from "@/lib/domain/registrationParticipants";
import { useEventCategories } from "@/lib/supabase/useEventCategories";
import { cn } from "@/lib/utils";

/**
 * Registration, on one screen.
 *
 * The form this replaces asked eighteen questions across four steps and finished with a
 * review page. This asks what the organiser actually asks for, in the order they ask it, and
 * submits from the same screen it started on.
 *
 * Everything that varies between events — the categories, the activities, the bank details,
 * the rate card, the terms somebody is agreeing to — is read from the event rather than
 * written in here, so running a different tournament is a Settings change and not a code
 * change.
 *
 * The order of the questions is the order somebody can answer them. Which activity comes
 * first, because it decides whose names are asked for; the names come next, under headings
 * that say which activity each person is doing; and the money comes after both, because the
 * ticket price depends on the first answer.
 */

export type { ActivityChoice };

export interface QuickRegistration {
  /**
   * The name the registration is filed under: the Scrabble player where there is one.
   * The roster, the pairings, the player number and the certificate all follow it.
   */
  fullName: string;
  /** Four digits, asked for directly. */
  yearOfBirth: string;
  /** Worked out from the year, for everything that already reads an age. */
  age: string;
  mobile: string;
  category: string;
  /** The category as it is written on the event, so the desk reads a name and not an id. */
  categoryLabel: string;
  /** Claimed, not verified — the desk checks it. Earns the member rate where one exists. */
  psaMember: boolean;
  /** How they said they will pay. */
  payment: PaymentChoice;
  /** The same answer as `payment`, in the shape the registration record already stores. */
  payAtVenue: boolean;
  /** The receipt, when one was required. Uploaded by the caller, not by the form. */
  proofFile: File | null;
  heardAbout: string;
  photoConsent: boolean;
  termsAccepted: boolean;
  /** Painting, Scrabble, or both — only where the event sells more than one thing. */
  activity?: ActivityChoice;
  /** How the event names that activity, e.g. "Scrabble Tournament". */
  activityLabel?: string;
  /** Who is doing what. A combo names two people, because the activities run together. */
  participants: ResolvedParticipants;
  /**
   * The price as the participant was shown it.
   *
   * Carried rather than recomputed after submission. A second calculation on the other
   * side is a second chance to disagree, and the record of what somebody owes should be
   * the number that was on their screen when they pressed Register.
   */
  quotedAmount: number;
  quotedStandardAmount: number;
  quotedRateId: string;
  quotedRateLabel: string;
  /** True when the rate rests on a claim the desk still has to see proof of. */
  quotedRateNeedsCheck: boolean;
  /** The promo code that was accepted, as the organiser wrote it. Empty when none was used. */
  promoCode: string;
  promoPercentOff: number;
}

/** How somebody found the event. Recorded so an organiser can see what actually worked. */
const HEARD_ABOUT = [
  "Instagram",
  "WhatsApp",
  "The Social / Cafe Leap",
  "At a PSA tournament",
  "Other",
];

export function QuickForm({
  event,
  saving,
  error,
  onSubmit,
}: {
  event: PublicEvent;
  saving: boolean;
  error: string | null;
  onSubmit: (registration: QuickRegistration) => void;
}) {
  const { categories, loaded } = useEventCategories(event.id);

  const activities = event.activities ?? [];
  /*
   * A single activity is not a choice. Configuring one is a way of saying "this event sells
   * a painting seat" rather than a question worth putting on a form.
   */
  const asksActivity = activities.length > 1;

  const [activity, setActivity] = React.useState<ActivityChoice | "">(
    activities.length === 1 ? activities[0].key : "",
  );
  const [scrabble, setScrabble] = React.useState<ScrabbleParticipant>(EMPTY_SCRABBLE);
  const [painting, setPainting] = React.useState<ParticipantDetails>(EMPTY_DETAILS);
  const [psaMember, setPsaMember] = React.useState<boolean | null>(null);
  const [payment, setPayment] = React.useState<PaymentChoice | null>(null);
  const [proofFile, setProofFile] = React.useState<File | null>(null);
  const [proofProblem, setProofProblem] = React.useState<string | null>(null);
  const [promoTyped, setPromoTyped] = React.useState("");
  /*
   * Whether they have finished typing the code.
   *
   * "That code is not recognised" flashed up at every keystroke of a code being typed
   * correctly — K, KS, KSA — which reads as the form arguing with somebody who is doing
   * nothing wrong. The refusal waits until they leave the field or press Register; the
   * acceptance appears the moment it matches, because that one is good news.
   */
  const [promoSettled, setPromoSettled] = React.useState(false);
  /*
   * Bumped to clear the file input.
   *
   * A file input keeps its own value, and nothing but the element itself may clear it — so
   * removing an attachment and choosing the same file again fired no change event and the
   * receipt silently did not come back. Changing the key remounts the input empty, which is
   * the one way to reset it that does not reach into the DOM during a render.
   */
  const [proofNonce, setProofNonce] = React.useState(0);
  const [heardAbout, setHeardAbout] = React.useState("");
  const [photoConsent, setPhotoConsent] = React.useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  /*
   * The playful wording on the last question belongs to The Repeat Table's workshop and
   * nowhere else. Everything structural — which activities exist, what they cost, who is
   * asked for — now comes from the event, so this is the only thing left keyed to a slug.
   */
  const workshop = event.slug === "alphabattle-cafe-leap";

  /* With no activities configured there is one thing to enter, and it is the tournament. */
  const effectiveActivity: ActivityChoice | "" = activities.length === 0 ? "scrabble" : activity;

  const wantsScrabble = needsScrabbleParticipant(effectiveActivity);
  const wantsPainting = activities.length > 0 && needsPaintingParticipant(effectiveActivity);
  const twoPeople = coversTwoPeople(effectiveActivity);
  const primary = primaryActivity(effectiveActivity);

  /* One category means no choice to make — only when Scrabble is involved. */
  const chosenCategory = wantsScrabble
    ? scrabble.category || (categories.length === 1 ? categories[0].id : "")
    : "";

  const activityRate = activities.find((a) => a.key === effectiveActivity) ?? null;

  /* ---- Pricing --------------------------------------------------------- */

  /*
   * Group rates are no longer offered.
   *
   * They were earned by ticking "I am registering with three or more", which is a claim the
   * form cannot check and the desk never had the other two names to settle. The question has
   * been removed, so a bracket that can only be reached by answering it would appear on
   * every rate card struck through, for a reason nobody can act on.
   */
  const rateCard = rateCardFor(event).filter((r) => !r.minGroupSize);

  const [pricedAt] = React.useState(() => new Date().toISOString());

  /*
   * The calendar year the event runs in.
   *
   * Age groups are drawn against the year of the tournament, not against today — a form
   * filled in on 31 December must put somebody in the same group as one filled in the
   * morning after. Falls back to this year for an event with no date recorded.
   */
  const eventYear = React.useMemo(() => {
    const parsed = new Date(event.startDate);
    return Number.isNaN(parsed.getTime()) ? new Date(pricedAt).getFullYear() : parsed.getFullYear();
  }, [event.startDate, pricedAt]);

  const rateContext: RateContext = {
    isMember: psaMember === true,
    groupSize: 1,
    at: pricedAt,
  };

  const priced = priceRegistration(rateCard, rateContext);

  /*
   * An event that sells activities prices each of them on its own brackets; everywhere else
   * the event's rate card decides. Registration is per person either way — a second entrant
   * fills the form again.
   */
  const usingActivityPrice = activities.length > 0;

  /*
   * The code, resolved before anything is priced with it.
   *
   * Declared here rather than beside the total it changes: every price below reads it, and a
   * `const` referenced above its own declaration is a dead page, not a type error — which is
   * exactly what happened, and what the browser check caught.
   */
  /*
   * Promo codes belong to the tournament, not to the painting seat.
   *
   * They are handed out through Scrabble clubs to fill the boards, and a painting ticket
   * that quietly took 30% off was giving away a workshop place on the strength of a code
   * meant for players. The box is not shown at all unless Scrabble is being entered, and the
   * code is not applied either — hiding the field alone would still honour one pasted in
   * before the activity was changed.
   */
  const promoOffered = wantsScrabble && (event.promoCodes ?? []).length > 0;
  const promoState = promoOffered
    ? resolvePromo(event.promoCodes ?? [], promoTyped, pricedAt)
    : ({ status: "none" } as const);
  const promo: PromoCode | null = promoState.status === "accepted" ? promoState.promo : null;

  /* Every activity priced, so the whole board can be shown side by side, not just the one
     chosen — somebody deciding between them is comparing two columns. */
  const activityPrices = new Map<string, ActivityPrice>(
    activities.map((a) => [
      a.key,
      priceActivity(a, {
        isMember: psaMember === true,
        at: pricedAt,
        payment,
        /* The painting column is never discounted by a tournament code. */
        promo: a.key === "painting" ? null : promo,
      }),
    ]),
  );
  const chosenPrice = activityRate ? activityPrices.get(activityRate.key) ?? null : null;

  /*
   * The lowest price each activity can actually be had for today.
   *
   * The picker is the first question, so it cannot know whether somebody is a member or how
   * they will pay — and printing the regular price there said "PKR 1,250 per person" above a
   * panel that was charging 800, which is the form contradicting itself on the one number
   * people are reading it for. Priced at the most favourable combination, which is what
   * "from" means, and it moves with the early bird closing on its own.
   */
  const activityFloors = new Map<string, number>(
    activities.map((a) => [
      a.key,
      priceActivity(a, {
        isMember: true,
        at: pricedAt,
        payment: "online",
        promo: a.key === "painting" ? null : promo,
      }).amount,
    ]),
  );

  /*
   * The membership question, and what it is worth.
   *
   * A member price is the reason a rated player fills this in at all, so where one exists it
   * is named. It used to say "Members pay PKR 800" above a ticket the answer had no effect
   * on, because the activity price ignored it — the brackets now live on the activity, so
   * the two cannot disagree.
   */
  const memberActivityRate = activityRate?.rates?.find((r) => r.id === "member") ?? null;
  const memberEventRate = wantsScrabble ? rateCard.find((r) => r.id === "member") ?? null : null;
  const memberRate = usingActivityPrice ? memberActivityRate : memberEventRate;
  const memberBody = (memberRate?.label ?? "").replace(/ member$/i, "").trim() || "PSA";

  const cheaper = usingActivityPrice
    ? null
    : cheaperRateHint(priced, rateContext, event.currency ?? "PKR");

  const quotedTotal = usingActivityPrice ? (chosenPrice?.amount ?? 0) : priced.perPerson;
  const standardAmount = usingActivityPrice
    ? (chosenPrice?.regular ?? 0)
    : rateCard.find((r) => r.id === "standard")?.amount ?? event.fee;
  const quotedRateId = usingActivityPrice
    ? `${activityRate?.key ?? ""}:${chosenPrice?.id ?? ""}`
    : priced.applied.id;
  const quotedRateLabel = usingActivityPrice
    ? [activityRate?.rateLabel, chosenPrice?.label, promo ? `${promo.code} −${promo.percentOff}%` : ""]
        .filter(Boolean)
        .join(" · ")
    : priced.applied.label;
  const quotedNeedsCheck = usingActivityPrice
    ? Boolean(chosenPrice?.needsCheck)
    : rateNeedsVerification(priced.applied);

  const money = (n: number) => `${event.currency ?? "PKR"} ${n.toLocaleString("en-PK")}`;

  /* ---- What is still missing ------------------------------------------- */

  const problems = participantProblems(
    {
      activity: (effectiveActivity || "scrabble") as ActivityChoice,
      scrabble: { ...scrabble, category: chosenCategory },
      painting,
    },
    { categoryRequired: wantsScrabble && categories.length > 0, year: eventYear },
  );
  const problemFor = (field: ParticipantField) => problems.find((p) => p.field === field)?.message;

  const activityOk = !asksActivity || activity !== "";
  const payOk = payment !== null;
  const proofOk = !proofRequired(payment) || proofFile !== null;
  const psaOk = !memberRate || psaMember !== null;
  const heardOk = heardAbout !== "";
  const consentOk = photoConsent !== null;
  const termsOk = !event.terms || termsAccepted;

  const ready =
    activityOk &&
    problems.length === 0 &&
    psaOk &&
    payOk &&
    proofOk &&
    heardOk &&
    consentOk &&
    termsOk;

  /* ---- Submitting ------------------------------------------------------ */

  const submit = () => {
    setTouched(true);
    if (!ready || saving) return;
    if (usingActivityPrice && !activityRate) return;

    const resolved = resolveParticipants({
      activity: (effectiveActivity || "scrabble") as ActivityChoice,
      scrabble: { ...scrabble, category: chosenCategory },
      painting,
    });
    const lead = primaryParticipant(resolved);

    onSubmit({
      fullName: lead.fullName,
      yearOfBirth: lead.yearOfBirth,
      /*
       * Derived here, not asked for. The form asks the reliable question and works the age
       * out, so the two can never disagree — and everything downstream that already reads an
       * age keeps working without having to learn about years.
       */
      age: String(ageInYear(lead.yearOfBirth, eventYear) ?? ""),
      mobile: lead.phone,
      category: chosenCategory,
      categoryLabel: categories.find((c) => c.id === chosenCategory)?.name ?? "",
      psaMember: psaMember === true,
      payment: payment as PaymentChoice,
      payAtVenue: payment !== "online",
      proofFile,
      heardAbout,
      photoConsent: photoConsent === true,
      termsAccepted,
      ...(activities.length > 0
        ? {
            activity: effectiveActivity as ActivityChoice,
            activityLabel: activityRate?.label ?? "",
          }
        : {}),
      participants: resolved,
      quotedAmount: quotedTotal,
      quotedStandardAmount: usingActivityPrice ? quotedTotal : standardAmount,
      quotedRateId,
      quotedRateLabel,
      quotedRateNeedsCheck: quotedNeedsCheck,
      promoCode: promo?.code ?? "",
      promoPercentOff: promo?.percentOff ?? 0,
    });
  };

  /* ---- The receipt ------------------------------------------------------ */

  const pickProof = (file: File | null) => {
    if (!file) {
      setProofFile(null);
      setProofProblem(null);
      return;
    }

    const allowed = checkProofFile({ name: file.name, type: file.type, size: file.size });
    if (!allowed.ok) {
      setProofFile(null);
      setProofProblem(allowed.message);
      return;
    }

    setProofFile(file);
    setProofProblem(null);
  };

  const clearProof = () => {
    setProofFile(null);
    setProofProblem(null);
    setProofNonce((n) => n + 1);
  };

  /* ---- Shared styling --------------------------------------------------- */

  const problem = (message: string | undefined | false, show = true) =>
    touched && show && message ? (
      <p className="mt-1 text-[12.5px] text-critical">{message}</p>
    ) : null;

  const field =
    "mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary";
  const heading = "block text-[14px] font-semibold text-ink";
  const hint = "text-[12.5px] leading-relaxed text-muted";

  const choices = (
    options: { key: string; label: string; note?: string }[],
    selected: string,
    pick: (key: string) => void,
    columns = "sm:grid-cols-2",
  ) => (
    <div className={cn("mt-1.5 grid gap-2", columns)}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => pick(o.key)}
          aria-pressed={selected === o.key}
          className={cn(
            "flex items-center gap-2.5 rounded-control border px-3.5 py-3 text-left text-[15px] font-semibold transition-colors",
            selected === o.key
              ? "border-primary bg-primary-050 text-primary"
              : "border-line bg-[rgb(var(--c-surface))] text-ink hover:bg-[rgb(var(--c-surface-soft))]",
          )}
        >
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border-2",
              selected === o.key ? "border-primary bg-primary text-white" : "border-line",
            )}
          >
            {selected === o.key ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          <span className="min-w-0">
            <span className="block">{o.label}</span>
            {o.note ? (
              <span className="block text-[12px] font-medium opacity-80">{o.note}</span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );

  const yesNo = (selected: boolean | null, pick: (v: boolean) => void, yes = "Yes", no = "No") =>
    choices(
      [
        { key: "yes", label: yes },
        { key: "no", label: no },
      ],
      selected === null ? "" : selected ? "yes" : "no",
      (k) => pick(k === "yes"),
    );

  /*
   * One person's details. Used for both participants, so the Scrabble player and the
   * painter are asked the same things in the same order and neither can drift.
   */
  const personFields = (
    idPrefix: string,
    value: ParticipantDetails,
    change: (next: Partial<ParticipantDetails>) => void,
    phoneRequired: boolean,
    nameProblem: string | undefined,
    bornProblem: string | undefined,
    phoneProblem: string | undefined,
  ) => (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-name`} className={heading}>
          Full name
        </label>
        <input
          id={`${idPrefix}-name`}
          value={value.fullName}
          onChange={(e) => change({ fullName: e.target.value })}
          autoComplete={idPrefix === "scrabble" ? "name" : "off"}
          placeholder="e.g. Ayesha Khan"
          className={field}
        />
        {problem(nameProblem)}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-born`} className={heading}>
            Year of birth
          </label>
          <input
            id={`${idPrefix}-born`}
            value={value.yearOfBirth}
            /* Digits only, four of them — a stray letter or a fifth digit never lands. */
            onChange={(e) => change({ yearOfBirth: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="e.g. 1998"
            className={cn(field, "num")}
          />
          {/*
            The age it works out to, shown back.
            A year is easy to mistype by a decade and hard to check by eye; the age is the
            thing somebody actually knows, so reading it back is what catches 1988 typed for
            1998 before it puts them in the wrong group.
          */}
          {ageInYear(value.yearOfBirth, eventYear) !== null ? (
            <p className={cn(hint, "mt-1")}>
              {ageInYear(value.yearOfBirth, eventYear)} years old in {eventYear}.
            </p>
          ) : null}
          {problem(bornProblem)}
        </div>

        <div>
          <label htmlFor={`${idPrefix}-phone`} className={heading}>
            Cell number{" "}
            {phoneRequired ? null : (
              <span className="font-medium text-muted">(only if different)</span>
            )}
          </label>
          <input
            id={`${idPrefix}-phone`}
            value={value.phone}
            onChange={(e) => change({ phone: e.target.value })}
            inputMode="tel"
            autoComplete={phoneRequired ? "tel" : "off"}
            placeholder="03xx xxxxxxx"
            className={cn(field, "num")}
          />
          {problem(phoneProblem)}
        </div>
      </div>

      {phoneRequired ? (
        <p className={hint}>This is where we send the player number.</p>
      ) : null}
    </div>
  );

  const sectionCard = "rounded-control border border-line bg-[rgb(var(--c-surface))] p-3.5 sm:p-4";
  const sectionTitle = "text-[13px] font-bold uppercase tracking-[0.1em] text-primary";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
      noValidate
    >
      {/* ---- Which activity ------------------------------------------- */}
      {asksActivity ? (
        <div>
          <span className={heading}>Which activity are you signing up for?</span>
          {choices(
            activities.map((a) => ({
              key: a.key,
              label: a.label,
              /*
               * What it can be had for, and what the ticket covers where that is not obvious.
               * "from" whenever the brackets can take it below the regular price, so the
               * picker never advertises a number the panel underneath contradicts.
               */
              note: [
                (activityFloors.get(a.key) ?? a.price) < a.price
                  ? `from ${money(activityFloors.get(a.key) ?? a.price)}`
                  : `${money(a.price)} per person`,
                a.note,
              ]
                .filter(Boolean)
                .join(" · "),
            })),
            activity,
            (k) => setActivity(k as ActivityChoice),
            "sm:grid-cols-1",
          )}
          {problem("Please choose an activity.", !activityOk)}
        </div>
      ) : null}

      {/* ---- Who is taking part ---------------------------------------- */}
      {effectiveActivity === "" ? (
        <p className={cn(hint, "rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3")}>
          Choose an activity above and we will ask who is taking part.
        </p>
      ) : (
        <div className="space-y-3">
          {twoPeople ? (
            <>
              <span className={heading}>Participant details</span>
              {/*
                Said before the fields rather than as an error after them.
                The combo is a pair ticket: the tournament and the workshop run at the same
                hour in the same room, so one person cannot take both halves — and somebody
                who reaches the second set of name fields not expecting them will otherwise
                type the same name twice and only find out at the door.
              */}
              <p className={cn(hint, "rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3")}>
                Both activities run at the same time, so this ticket is for{" "}
                <span className="font-semibold text-ink">two people</span> — one plays Scrabble
                and the other paints.
              </p>
              {problem(problemFor("samePerson"))}
            </>
          ) : null}

          {wantsScrabble ? (
            <div className={sectionCard}>
              <p className={sectionTitle}>
                {twoPeople ? "Who is playing Scrabble?" : "Your details"}
              </p>
              <div className="mt-3">
                {personFields(
                  "scrabble",
                  scrabble,
                  (next) => setScrabble((s) => ({ ...s, ...next })),
                  primary === "scrabble",
                  problemFor("scrabbleName"),
                  problemFor("scrabbleYearOfBirth"),
                  problemFor("scrabblePhone"),
                )}
              </div>

              <div className="mt-4">
                <span className={heading}>Scrabble category</span>
                <p className={hint}>
                  The management reserves the right to change your category depending on your
                  first game.
                </p>
                {!loaded ? (
                  <div className="mt-1.5 h-12 animate-pulse rounded-control bg-[rgb(var(--c-surface-soft))]" />
                ) : (
                  choices(
                    categories.map((c) => ({ key: c.id, label: c.name })),
                    chosenCategory,
                    (id) => setScrabble((s) => ({ ...s, category: id })),
                    "sm:grid-cols-1",
                  )
                )}
                {problem(problemFor("scrabbleCategory"))}
              </div>
            </div>
          ) : null}

          {wantsPainting ? (
            <div className={sectionCard}>
              <p className={sectionTitle}>{twoPeople ? "Who is painting?" : "Your details"}</p>
              <div className="mt-3">
                {personFields(
                  "painting",
                  painting,
                  (next) => setPainting((p) => ({ ...p, ...next })),
                  primary === "painting",
                  problemFor("paintingName"),
                  problemFor("paintingYearOfBirth"),
                  problemFor("paintingPhone"),
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ---- Membership ------------------------------------------------ */}
      {memberRate ? (
        <div>
          <span className={heading}>Are you a {memberBody} member?</span>
          <p className={hint}>
            Members pay {money(memberRate.amount)}. Bring your membership so the desk can check
            it.
          </p>
          {yesNo(psaMember, setPsaMember)}
          {problem("Please answer yes or no.", !psaOk)}
        </div>
      ) : null}

      {/* ---- How they will pay, which is part of the price ---------------- */}
      <div>
        <span className={heading}>How will you pay?</span>
        {/*
          Asked before the total, because it is one of the things that decides the total.
          Paying now is cheaper than settling at the desk, so this cannot sit underneath a
          price it changes — somebody would read their total, scroll past it, and find the
          number had moved behind them.
        */}
        <p className={hint}>Paying online now costs less than settling at the desk.</p>
        {choices(
          [
            { key: "online", label: "Online payment", note: "Bank transfer or EasyPaisa" },
            { key: "cash", label: "Cash on site", note: "Arrive 20 minutes early" },
          ],
          payment ?? "",
          (k) => {
            setPayment(k as PaymentChoice);
            /* A receipt attached and then switched to cash is a file nobody asked for. */
            if (k !== "online") clearProof();
          },
        )}
        {problem("Please choose how you will pay.", !payOk)}
      </div>

      {/* ---- What it costs, once both answers are in ---------------------- */}
      {usingActivityPrice ? (
        <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-3">
          <p className="text-center text-[14px] font-semibold text-ink">Ticket price</p>

          {/*
            Both activities side by side, each with its own brackets.
            The tournament is tiered and the painting seat is not, so one shared list could
            only show the two as if they were the same kind of thing. Two columns at every
            width — each is a short list of names and amounts, and stacking them on a phone
            would put the two prices somebody is comparing a scroll apart.
          */}
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-3">
            {activities.map((a) => {
              const price = activityPrices.get(a.key);
              const chosen = a.key === effectiveActivity;

              return (
                <div
                  key={a.key}
                  className={cn(
                    "rounded-control border px-2.5 py-2.5 text-center",
                    chosen
                      ? "border-primary bg-primary-050"
                      : "border-line bg-[rgb(var(--c-surface))]",
                  )}
                >
                  <p
                    className={cn(
                      "text-[12px] font-bold uppercase tracking-[0.08em]",
                      chosen ? "text-primary" : "text-muted",
                    )}
                  >
                    {a.rateLabel}
                  </p>

                  <ul className="mt-1.5 space-y-1.5">
                    {(price?.tiers ?? []).map(({ rate, available, reason, applied }) => (
                      <li key={rate.id}>
                        <span
                          className={cn(
                            "block text-[11.5px] leading-tight",
                            applied ? "font-semibold text-ink" : "text-muted",
                          )}
                        >
                          {rate.label}
                        </span>
                        <span
                          className={cn(
                            "num block text-[13px] leading-tight",
                            applied
                              ? "font-bold text-primary"
                              : available
                                ? "font-semibold text-ink"
                                : "text-faint",
                          )}
                        >
                          {money(rate.amount)}
                        </span>
                        {/*
                          Why a bracket is out of reach, where the reason is something
                          somebody can act on. The walk-in price is the one that matters: it
                          is on the list precisely so registering now looks cheaper than
                          turning up, and it is never what this form charges.
                        */}
                        {!available && reason && chosen ? (
                          <span className="block text-[10.5px] leading-tight text-faint">
                            {reason}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {a.includes ? (
                    <p className="mt-2 border-t border-line pt-1.5 text-[10.5px] leading-snug text-muted">
                      {a.includes}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/*
            The code, inside the price panel.
            It belongs where the number it changes is, not in a row of its own further down:
            somebody typing a code is watching for the total to move, and a field placed
            anywhere else makes them hunt for the proof that it worked.
          */}
          {promoOffered ? (
            <div className="mt-2.5 border-t border-line pt-2.5">
              <label htmlFor="q-promo" className="block text-center text-[12.5px] font-semibold text-ink">
                Promo code
              </label>
              <input
                id="q-promo"
                value={promoTyped}
                onChange={(e) => {
                  /* Upper-cased as they type, so a code never fails for being lower case. */
                  setPromoTyped(e.target.value.toUpperCase().replace(/\s+/g, ""));
                  setPromoSettled(false);
                }}
                onBlur={() => setPromoSettled(true)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="If you have one"
                className={cn(
                  field,
                  "mx-auto max-w-[16rem] text-center tracking-[0.12em]",
                  promoState.status === "accepted" ? "border-success" : "",
                )}
              />

              {promoState.status === "accepted" ? (
                <p className="mt-1.5 text-center text-[12.5px] font-semibold text-success">
                  {promoState.promo.label} applied.
                </p>
              ) : null}

              {/*
                Held back until they have stopped typing or pressed Register — see
                `promoSettled`. A half-typed code is not a wrong code.
              */}
              {(promoSettled || touched) &&
              (promoState.status === "unknown" || promoState.status === "expired") ? (
                <p className="mt-1.5 text-center text-[12.5px] text-critical">
                  {promoState.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2.5 border-t border-line pt-2.5 text-center">
            {activityRate && chosenPrice ? (
              <>
                <p className="text-[14px] font-semibold text-ink">
                  You pay <span className="num text-primary">{money(quotedTotal)}</span>
                  {" — "}
                  {quotedRateLabel}
                </p>
                {/*
                  What the code took off, said in money.
                  A percentage is a claim; the rupees are the thing somebody checks against
                  what they are about to transfer.
                */}
                {chosenPrice.promo ? (
                  <p className="mt-0.5 text-[12.5px] font-semibold text-success">
                    {chosenPrice.promo.code} saved you{" "}
                    <span className="num">{money(chosenPrice.beforePromo - chosenPrice.amount)}</span>
                    {" — was "}
                    <span className="num line-through">{money(chosenPrice.beforePromo)}</span>
                  </p>
                ) : null}
                {chosenPrice.needsCheck ? (
                  <p className={cn("mt-0.5", hint)}>
                    The desk will check your membership at check-in. If it does not hold, the
                    regular {money(chosenPrice.regular)} applies.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] text-muted">Choose an activity to see your total.</p>
            )}
          </div>

          {event.feeDetails ? (
            <div className={cn("mt-2 whitespace-pre-line border-t border-line pt-2", hint)}>
              {event.feeDetails}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-3">
          <p className="text-[14px] font-semibold text-ink">Registration fees</p>

          <ul className="mt-2 space-y-1.5">
            {rateCard.map((rate) => {
              const applied = rate.id === priced.applied.id;
              const blocked = priced.unavailable.find((u) => u.rate.id === rate.id);
              return (
                <li key={rate.id} className={cn("text-[13px]", applied ? "text-ink" : "text-muted")}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("min-w-0", applied ? "font-semibold" : "")}>{rate.label}</span>
                    <span
                      className={cn(
                        "num shrink-0",
                        applied ? "font-semibold text-primary" : blocked ? "line-through" : "",
                      )}
                    >
                      {money(rate.amount)}
                    </span>
                  </span>
                  {blocked ? (
                    <span className="block text-[12px] leading-snug">{blocked.reason}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-2.5 border-t border-line pt-2.5">
            <p className="text-[14px] font-semibold text-ink">
              You pay <span className="num text-primary">{money(priced.perPerson)}</span> —{" "}
              {priced.applied.label}
            </p>
            {rateNeedsVerification(priced.applied) ? (
              <p className={cn("mt-0.5", hint)}>
                The desk will check this at check-in. If it does not hold, the regular{" "}
                {money(standardAmount)} applies.
              </p>
            ) : null}
            {cheaper ? <p className={cn("mt-0.5", hint)}>{cheaper}</p> : null}
          </div>

          {event.feeDetails ? (
            <div className={cn("mt-2 whitespace-pre-line border-t border-line pt-2", hint)}>
              {event.feeDetails}
            </div>
          ) : null}
        </div>
      )}

      <div>
        {payment === "online" ? (
          <div className="mt-2.5 space-y-2.5">
            {event.paymentInstructions ? (
              <div className="whitespace-pre-line rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] leading-relaxed text-ink">
                {event.paymentInstructions}
              </div>
            ) : null}

            {/*
              The receipt, asked for at the moment it exists.
              Somebody who has just transferred the money has the screenshot in their hand;
              asking for it later means asking for it on WhatsApp, which is how every online
              payment at the last event was actually settled.
            */}
            <div className="rounded-control border border-line p-3.5">
              <span className={heading}>Upload payment proof</span>
              <p className={hint}>
                A screenshot of the transfer, or the bank receipt. JPG, PNG or PDF.
              </p>

              <input
                key={proofNonce}
                id="q-proof"
                type="file"
                accept={PROOF_ACCEPT}
                onChange={(e) => pickProof(e.target.files?.[0] ?? null)}
                className="sr-only"
              />

              {proofFile ? (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-control border border-primary bg-primary-050 px-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white text-primary">
                    {proofFile.type === "application/pdf" ? (
                      <FileText className="size-4.5" />
                    ) : (
                      <ImageIcon className="size-4.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {proofFile.name}
                    </span>
                    <span className="num block text-[12px] text-muted">
                      {megabytes(proofFile.size)} MB · attached
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={clearProof}
                    aria-label="Remove this file"
                    className="tap-target grid size-9 shrink-0 place-items-center rounded-control text-muted hover:text-critical"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="q-proof"
                  className="mt-2.5 flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-4 text-[14px] font-semibold text-ink"
                >
                  <Paperclip className="size-4 text-primary" />
                  Choose a file or take a photo
                </label>
              )}

              {proofProblem ? (
                <p className="mt-1.5 text-[12.5px] text-critical">{proofProblem}</p>
              ) : null}
              {problem("Please attach your payment proof.", !proofOk && !proofProblem)}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---- The last few ---------------------------------------------- */}
      <div>
        <span className={heading}>How did you hear about the event?</span>
        {choices(
          HEARD_ABOUT.map((h) => ({ key: h, label: h })),
          heardAbout,
          setHeardAbout,
          "sm:grid-cols-1",
        )}
        {problem("Please tell us how you heard about it.", !heardOk)}
      </div>

      <div>
        {workshop ? (
          <>
            <span className={heading}>LAST ONE, I SWEAR!</span>
            <p className={hint}>
              I will be taking pictures and videos during the workshop for The Repeat Table&rsquo;s
              social media. Are you okay with being included?
            </p>
            {yesNo(photoConsent, setPhotoConsent, "Easy scenes!", "Let me be camera shy in peace")}
            {problem("Please choose one.", !consentOk)}
          </>
        ) : (
          <>
            <span className={heading}>Photos and video</span>
            <p className={hint}>
              I give consent for photos and videos to be taken during the event and posted on the
              event&rsquo;s social media handles.
            </p>
            {yesNo(photoConsent, setPhotoConsent, "Yes, that is fine", "No, please do not")}
            {problem("Please answer yes or no.", !consentOk)}
          </>
        )}
      </div>

      {event.terms ? (
        <div>
          <span className={heading}>Before you register</span>
          <div
            className={cn(
              "mt-1.5 whitespace-pre-line rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3",
              hint,
            )}
          >
            {event.terms}
          </div>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="text-[14px] font-semibold text-ink">
              I understand and agree, and I am happy to be contacted about this event
            </span>
          </label>
          {problem("Please confirm you have read this.", !termsAccepted)}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[13px] leading-relaxed text-critical">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-control bg-primary px-4 py-3.5 text-[16px] font-bold text-white transition-opacity disabled:opacity-60"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        {saving ? "Sending…" : "Register"}
      </button>

      <p className="text-center text-[12px] text-muted">
        We will send your player number to your cell.
      </p>
    </form>
  );
}
