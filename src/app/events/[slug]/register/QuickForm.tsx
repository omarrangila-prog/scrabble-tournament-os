"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import type { PublicEvent } from "@/lib/domain/events";
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

export interface QuickRegistration {
  fullName: string;
  age: string;
  mobile: string;
  category: string;
  playsPsaRanking: boolean;
  payAtVenue: boolean;
  heardAbout: string;
  photoConsent: boolean;
  termsAccepted: boolean;
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

  const [fullName, setFullName] = React.useState("");
  const [age, setAge] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [playsPsaRanking, setPlaysPsaRanking] = React.useState<boolean | null>(null);
  const [payAtVenue, setPayAtVenue] = React.useState<boolean | null>(null);
  const [heardAbout, setHeardAbout] = React.useState("");
  const [photoConsent, setPhotoConsent] = React.useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  /* One category means no choice to make. */
  const chosen = category || (categories.length === 1 ? categories[0].id : "");

  const nameOk = fullName.trim().length >= 2;
  /* Pakistani mobiles are 11 digits; 10 lets a dropped leading zero through rather than
     rejecting somebody over a formatting habit. */
  const mobileOk = mobile.replace(/\D/g, "").length >= 10;
  const ageNumber = Number(age);
  const ageOk = age.trim() !== "" && Number.isFinite(ageNumber) && ageNumber >= 3 && ageNumber <= 110;
  const categoryOk = chosen !== "";
  const psaOk = playsPsaRanking !== null;
  const payOk = payAtVenue !== null;
  const heardOk = heardAbout !== "";
  const consentOk = photoConsent !== null;

  const ready =
    nameOk && ageOk && mobileOk && categoryOk && psaOk && payOk && heardOk && consentOk &&
    termsAccepted;

  const submit = () => {
    setTouched(true);
    if (!ready || saving) return;
    onSubmit({
      fullName: fullName.trim(),
      age: age.trim(),
      mobile: mobile.trim(),
      category: chosen,
      playsPsaRanking: playsPsaRanking === true,
      payAtVenue: payAtVenue === true,
      heardAbout,
      photoConsent: photoConsent === true,
      termsAccepted,
    });
  };

  const problem = (show: boolean, message: string) =>
    touched && show ? <p className="mt-1 text-[12.5px] text-critical">{message}</p> : null;

  const field = "mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary";
  const heading = "block text-[14px] font-semibold text-ink";

  /** A row of choices that behave as one answer. */
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

      <div>
        <span className={heading}>Do you play in the PSA ranking tournaments?</span>
        {yesNo(playsPsaRanking, setPlaysPsaRanking)}
        {problem(!psaOk, "Please answer yes or no.")}
      </div>

      {/*
        The rates as advertised, shown rather than computed. Which bracket applies depends on
        membership, group size and the date — none of which this form asks — so the desk
        settles it. Printed here so nobody arrives without knowing what they owe, and placed
        above the payment question because the amount changes how somebody chooses to pay.
      */}
      {event.feeDetails ? (
        <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-3">
          <p className="text-[14px] font-semibold text-ink">Registration fees</p>
          <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted">
            {event.feeDetails}
          </div>
        </div>
      ) : null}

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

        {/*
          Shown only once online payment is chosen. The account details are the organiser's,
          read from the event, so a different tournament banks somewhere else without this
          file changing.
        */}
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
        <span className={heading}>
          Photos and video
        </span>
        <p className="text-[12.5px] leading-relaxed text-muted">
          I give consent for photos and videos to be taken during the event and posted on the
          event&rsquo;s social media handles.
        </p>
        {yesNo(photoConsent, setPhotoConsent, "Yes, that is fine", "No, please do not")}
        {problem(!consentOk, "Please answer yes or no.")}
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
              className="mt-0.5 size-5 shrink-0 accent-[rgb(var(--c-primary))]"
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

      {/*
       * Never disabled on unanswered questions. A button that cannot be pressed does not say
       * which question is missing — pressing it does, beside the question itself.
       */}
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
