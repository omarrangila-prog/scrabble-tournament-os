"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import type { PublicEvent } from "@/lib/domain/events";
import {
  cheaperRateHint,
  priceRegistration,
  rateCardFor,
  rateNeedsVerification,
  type RateContext,
} from "@/lib/domain/pricing";
import { useEventCategories } from "@/lib/supabase/useEventCategories";
import { cn } from "@/lib/utils";

/**
 * Registration, on one screen.
 *
 * The form this replaces asked eighteen questions across four steps and finished with a
 * review page. This asks what the organiser actually asks for, in the order they ask it, and
 * submits from the same screen it started on.
 *
 * Everything that varies between events — the categories, the bank details, the rate card,
 * the terms somebody is agreeing to — is read from the event rather than written in here, so
 * running a different tournament is a Settings change and not a code change.
 */

export type ActivityChoice = "painting" | "scrabble" | "both";

export interface QuickRegistration {
  fullName: string;
  age: string;
  mobile: string;
  category: string;
  /** Claimed, not verified — the desk checks it. Earns the member rate where one exists. */
  psaMember: boolean;
  /** Three or more registering together, where the event offers a rate for it. */
  groupOfThree: boolean;
  /** Who they are registering with, so the desk can match the group up. */
  groupName: string;
  payAtVenue: boolean;
  heardAbout: string;
  photoConsent: boolean;
  termsAccepted: boolean;
  /** Painting, Scrabble, or the combo — Cafe Leap workshop form only. */
  activity?: ActivityChoice;
  /** The chair choice as labelled on the form — Cafe Leap workshop form only. */
  chairs?: string;
  /** Free text when chairs is "Other". */
  chairsOther?: string;
  /** How many people the quote is for — Cafe Leap workshop form only. */
  chairCount?: number;
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
}

/** How somebody found the event. Recorded so an organiser can see what actually worked. */
const HEARD_ABOUT = [
  "Instagram",
  "WhatsApp",
  "The Social / Cafe Leap",
  "At a PSA tournament",
  "Other",
];

const ACTIVITIES: { key: ActivityChoice; label: string; perPerson: number; rateLabel: string }[] = [
  { key: "painting", label: "Painting", perPerson: 1000, rateLabel: "Paint" },
  { key: "scrabble", label: "Scrabble Tournament", perPerson: 1000, rateLabel: "Scrabble" },
  { key: "both", label: "BOTH!", perPerson: 1800, rateLabel: "Combo Deal" },
];

const CHAIR_OPTIONS = [
  { key: "1", label: "Just for me", count: 1 as number | null },
  { key: "2", label: "2 chairs", count: 2 as number | null },
  { key: "3", label: "3 chairs", count: 3 as number | null },
  { key: "4+", label: "4 or more chairs", count: null },
  { key: "other", label: "Other", count: null },
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

  const [fullName, setFullName] = React.useState("");
  const [age, setAge] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [activity, setActivity] = React.useState<ActivityChoice | "">("");
  const [chairs, setChairs] = React.useState("");
  const [chairsOther, setChairsOther] = React.useState("");
  const [chairCountInput, setChairCountInput] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [psaMember, setPsaMember] = React.useState<boolean | null>(null);
  const [groupOfThree, setGroupOfThree] = React.useState<boolean | null>(null);
  const [groupName, setGroupName] = React.useState("");
  const [payAtVenue, setPayAtVenue] = React.useState<boolean | null>(null);
  const [heardAbout, setHeardAbout] = React.useState("");
  const [photoConsent, setPhotoConsent] = React.useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  /*
   * The Repeat Table workshop questions (activity, chairs, photo wording) belong on
   * Cafe Leap only. Other events keep the Scrabble registration form as it was.
   */
  const workshop = event.slug === "alphabattle-cafe-leap";

  const needsScrabble = !workshop || activity === "scrabble" || activity === "both";

  /* One category means no choice to make — only when Scrabble is involved. */
  const chosen =
    needsScrabble
      ? category || (categories.length === 1 ? categories[0].id : "")
      : "";

  const activityRate = ACTIVITIES.find((a) => a.key === activity) ?? null;

  const chairsNeedsCount = chairs === "4+" || chairs === "other";
  const fixedChairCount = CHAIR_OPTIONS.find((c) => c.key === chairs)?.count ?? null;
  const parsedChairCount = Number(chairCountInput);
  const chairCount = chairsNeedsCount
    ? Number.isFinite(parsedChairCount) && parsedChairCount >= (chairs === "4+" ? 4 : 1)
      ? Math.floor(parsedChairCount)
      : 0
    : fixedChairCount ?? 0;

  const rateCard = rateCardFor(event);
  const memberRate = needsScrabble ? rateCard.find((r) => r.id === "member") ?? null : null;
  const memberBody = (memberRate?.label ?? "").replace(/ member$/i, "").trim() || "PSA";
  const groupRate = needsScrabble
    ? rateCard.find((r) => r.minGroupSize && r.minGroupSize > 1) ?? null
    : null;

  const [pricedAt] = React.useState(() => new Date().toISOString());

  const rateContext: RateContext = {
    isMember: psaMember === true,
    groupSize: groupOfThree === true && groupRate?.minGroupSize ? groupRate.minGroupSize : 1,
    at: pricedAt,
  };

  const priced = priceRegistration(rateCard, rateContext);
  const cheaper = needsScrabble
    ? cheaperRateHint(priced, rateContext, event.currency ?? "PKR")
    : null;

  /*
   * Cafe Leap: ticket = activity × chairs.
   * Everywhere else: the event rate card, as before.
   */
  const perPerson = workshop ? (activityRate?.perPerson ?? 0) : priced.perPerson;
  const quotedTotal = workshop ? perPerson * Math.max(0, chairCount) : priced.perPerson;
  const standardAmount = rateCard.find((r) => r.id === "standard")?.amount ?? event.fee;
  const quotedRateId = workshop ? (activityRate?.key ?? "") : priced.applied.id;
  const quotedRateLabel = workshop
    ? activityRate && chairCount > 0
      ? `${activityRate.rateLabel} × ${chairCount} ${chairCount === 1 ? "chair" : "chairs"}`
      : activityRate?.rateLabel ?? ""
    : priced.applied.label;
  const quotedNeedsCheck = workshop ? false : rateNeedsVerification(priced.applied);

  const money = (n: number) => `${event.currency ?? "PKR"} ${n.toLocaleString("en-PK")}`;

  const nameOk = fullName.trim().length >= 2;
  const mobileOk = mobile.replace(/\D/g, "").length >= 10;
  const ageNumber = Number(age);
  const ageOk = age.trim() !== "" && Number.isFinite(ageNumber) && ageNumber >= 3 && ageNumber <= 110;
  const activityOk = !workshop || activity !== "";
  const chairsOk = !workshop || chairs !== "";
  const chairsOtherOk = !workshop || chairs !== "other" || chairsOther.trim().length >= 2;
  const chairCountOk =
    !workshop ||
    (chairCount > 0 && (!chairsNeedsCount || (chairs === "4+" ? chairCount >= 4 : chairCount >= 1)));
  const categoryOk = !needsScrabble || chosen !== "";
  const psaOk = !memberRate || psaMember !== null;
  const groupOk = !groupRate || groupOfThree !== null;
  const groupNameOk =
    !groupRate || groupOfThree !== true || groupName.trim().length >= 2;
  const payOk = payAtVenue !== null;
  const heardOk = heardAbout !== "";
  const consentOk = photoConsent !== null;
  const termsOk = !event.terms || termsAccepted;

  const ready =
    nameOk &&
    ageOk &&
    mobileOk &&
    activityOk &&
    chairsOk &&
    chairsOtherOk &&
    chairCountOk &&
    categoryOk &&
    psaOk &&
    groupOk &&
    groupNameOk &&
    payOk &&
    heardOk &&
    consentOk &&
    termsOk;

  const submit = () => {
    setTouched(true);
    if (!ready || saving) return;
    if (workshop && !activityRate) return;
    onSubmit({
      fullName: fullName.trim(),
      age: age.trim(),
      mobile: mobile.trim(),
      category: chosen,
      psaMember: psaMember === true,
      groupOfThree: groupOfThree === true,
      groupName: groupName.trim(),
      payAtVenue: payAtVenue === true,
      heardAbout,
      photoConsent: photoConsent === true,
      termsAccepted,
      ...(workshop
        ? {
            activity: activity as ActivityChoice,
            chairs: CHAIR_OPTIONS.find((c) => c.key === chairs)?.label ?? chairs,
            chairsOther: chairs === "other" ? chairsOther.trim() : "",
            chairCount,
          }
        : {}),
      quotedAmount: quotedTotal,
      quotedStandardAmount: workshop ? quotedTotal : standardAmount,
      quotedRateId,
      quotedRateLabel,
      quotedRateNeedsCheck: quotedNeedsCheck,
    });
  };

  const problem = (show: boolean, message: string) =>
    touched && show ? <p className="mt-1 text-[12.5px] text-critical">{message}</p> : null;

  const field = "mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary";
  const heading = "block text-[14px] font-semibold text-ink";

  const choices = (
    options: { key: string; label: string }[],
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
          <span className="min-w-0">{o.label}</span>
        </button>
      ))}
    </div>
  );

  const yesNo = (
    selected: boolean | null,
    pick: (v: boolean) => void,
    yes = "Yes",
    no = "No",
  ) =>
    choices(
      [
        { key: "yes", label: yes },
        { key: "no", label: no },
      ],
      selected === null ? "" : selected ? "yes" : "no",
      (k) => pick(k === "yes"),
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
      noValidate
    >
      <div>
        <label htmlFor="q-name" className={heading}>
          Your name
        </label>
        <input
          id="q-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          placeholder="e.g. Ayesha Khan"
          className={field}
        />
        {problem(!nameOk, "Please give the name you want on the board sheet.")}
      </div>

      <div>
        <label htmlFor="q-age" className={heading}>
          Your age
        </label>
        <input
          id="q-age"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 24"
          className={cn(field, "num")}
        />
        {problem(!ageOk, "Please give your age.")}
      </div>

      <div>
        <label htmlFor="q-mobile" className={heading}>
          Your cell number
        </label>
        <p className="text-[12.5px] text-muted">This is how we send your player number.</p>
        <input
          id="q-mobile"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="03xx xxxxxxx"
          className={cn(field, "num")}
        />
        {problem(!mobileOk, "Please give a cell number we can reach you on.")}
      </div>

      {workshop ? (
        <div>
          <span className={heading}>Which activity are you signing up for?</span>
          {choices(
            ACTIVITIES.map((a) => ({ key: a.key, label: a.label })),
            activity,
            (k) => setActivity(k as ActivityChoice),
            "sm:grid-cols-1",
          )}
          <div className="mt-2.5 space-y-1 rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
            <p>Paint: PKR 1000 per person</p>
            <p>Scrabble: PKR 1000 per person</p>
            <p>Combo Deal: PKR 1800 per person</p>
            <p className="pt-1 text-ink">
              This ticket price is inclusive of all art materials, tea, &amp; snacks.
            </p>
          </div>
          {problem(!activityOk, "Please choose an activity.")}
        </div>
      ) : null}

      {workshop ? (
        <div>
          <span className={heading}>How many chairs should we save?</span>
          {choices(
            CHAIR_OPTIONS.map((c) => ({ key: c.key, label: c.label })),
            chairs,
            (k) => {
              setChairs(k);
              if (k !== "other") setChairsOther("");
              if (k !== "4+" && k !== "other") setChairCountInput("");
            },
            "sm:grid-cols-1",
          )}
          {problem(!chairsOk, "Please tell us how many chairs to save.")}

          {chairs === "other" ? (
            <>
              <input
                value={chairsOther}
                onChange={(e) => setChairsOther(e.target.value)}
                placeholder="Please specify"
                aria-label="Other chair arrangement"
                className={field}
              />
              {problem(!chairsOtherOk, "Please say what you need.")}
            </>
          ) : null}

          {chairsNeedsCount ? (
            <>
              <label htmlFor="q-chair-count" className={cn(heading, "mt-3")}>
                How many people is that?
              </label>
              <input
                id="q-chair-count"
                value={chairCountInput}
                onChange={(e) => setChairCountInput(e.target.value)}
                inputMode="numeric"
                placeholder={chairs === "4+" ? "e.g. 5" : "e.g. 2"}
                className={cn(field, "num")}
              />
              {problem(
                !chairCountOk,
                chairs === "4+"
                  ? "Please enter 4 or more."
                  : "Please enter how many people to quote for.",
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {needsScrabble ? (
        <div>
          <span className={heading}>Your skill category</span>
          <p className="text-[12.5px] leading-relaxed text-muted">
            The management reserves the right to change your category depending on your first game.
          </p>
          {!loaded ? (
            <div className="mt-1.5 h-12 animate-pulse rounded-control bg-[rgb(var(--c-surface-soft))]" />
          ) : (
            choices(
              categories.map((c) => ({ key: c.id, label: c.name })),
              chosen,
              setCategory,
              "sm:grid-cols-1",
            )
          )}
          {problem(!categoryOk, "Please choose a category.")}
        </div>
      ) : null}

      {memberRate ? (
        <div>
          <span className={heading}>Are you a {memberBody} member?</span>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Members pay {money(memberRate.amount)}. Bring your membership so the desk can check it.
          </p>
          {yesNo(psaMember, setPsaMember)}
          {problem(!psaOk, "Please answer yes or no.")}
        </div>
      ) : null}

      {groupRate ? (
        <div>
          <span className={heading}>
            Are you registering with a group of {groupRate.minGroupSize} or more?
          </span>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Groups pay {money(groupRate.amount)} each. Everyone in the group registers
            separately and the desk settles the group at check-in.
          </p>
          {yesNo(groupOfThree, setGroupOfThree)}
          {problem(!groupOk, "Please answer yes or no.")}

          {groupOfThree === true ? (
            <>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Who are you registering with?"
                aria-label="Who you are registering with"
                className={field}
              />
              {problem(!groupNameOk, "Name the group so the desk can match you.")}
            </>
          ) : null}
        </div>
      ) : null}

      {workshop ? (
        <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-3">
          <p className="text-[14px] font-semibold text-ink">Ticket price</p>

          <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
            {ACTIVITIES.map((a) => {
              const applied = a.key === activity;
              return (
                <li key={a.key} className={cn(applied ? "text-ink" : "")}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("min-w-0", applied ? "font-semibold" : "")}>
                      {a.rateLabel}
                    </span>
                    <span className={cn("num shrink-0", applied ? "font-semibold text-primary" : "")}>
                      {money(a.perPerson)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-2.5 border-t border-line pt-2.5">
            {activityRate && chairCount > 0 ? (
              <p className="text-[14px] font-semibold text-ink">
                You pay <span className="num text-primary">{money(quotedTotal)}</span>
                {" — "}
                {quotedRateLabel}
              </p>
            ) : (
              <p className="text-[13px] text-muted">
                Choose an activity and how many chairs to see your total.
              </p>
            )}
          </div>

          <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted">
            Inclusive of all art materials, tea, &amp; snacks.
          </p>

          {event.feeDetails ? (
            <div className="mt-2 whitespace-pre-line border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted">
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
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                The desk will check this at check-in. If it does not hold, the regular{" "}
                {money(standardAmount)} applies.
              </p>
            ) : null}
            {cheaper ? (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{cheaper}</p>
            ) : null}
          </div>

          {event.feeDetails ? (
            <div className="mt-2 whitespace-pre-line border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted">
              {event.feeDetails}
            </div>
          ) : null}
        </div>
      )}

      <div>
        <span className={heading}>Payment method</span>
        {choices(
          [
            { key: "online", label: "Pay online" },
            { key: "cash", label: "Pay cash — arrive 20 minutes early" },
          ],
          payAtVenue === null ? "" : payAtVenue ? "cash" : "online",
          (k) => setPayAtVenue(k === "cash"),
        )}
        {problem(!payOk, "Please choose how you will pay.")}

        {payAtVenue === false && event.paymentInstructions ? (
          <div className="mt-2.5 whitespace-pre-line rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] leading-relaxed text-ink">
            {event.paymentInstructions}
          </div>
        ) : null}
      </div>

      <div>
        <span className={heading}>How did you hear about the event?</span>
        {choices(
          HEARD_ABOUT.map((h) => ({ key: h, label: h })),
          heardAbout,
          setHeardAbout,
          "sm:grid-cols-1",
        )}
        {problem(!heardOk, "Please tell us how you heard about it.")}
      </div>

      <div>
        {workshop ? (
          <>
            <span className={heading}>LAST ONE, I SWEAR!</span>
            <p className="text-[12.5px] leading-relaxed text-muted">
              I will be taking pictures and videos during the workshop for The Repeat Table&rsquo;s
              social media. Are you okay with being included?
            </p>
            {yesNo(photoConsent, setPhotoConsent, "Easy scenes!", "Let me be camera shy in peace")}
            {problem(!consentOk, "Please choose one.")}
          </>
        ) : (
          <>
            <span className={heading}>Photos and video</span>
            <p className="text-[12.5px] leading-relaxed text-muted">
              I give consent for photos and videos to be taken during the event and posted on the
              event&rsquo;s social media handles.
            </p>
            {yesNo(photoConsent, setPhotoConsent, "Yes, that is fine", "No, please do not")}
            {problem(!consentOk, "Please answer yes or no.")}
          </>
        )}
      </div>

      {event.terms ? (
        <div>
          <span className={heading}>Before you register</span>
          <div className="mt-1.5 whitespace-pre-line rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
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
          {problem(!termsAccepted, "Please confirm you have read this.")}
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
