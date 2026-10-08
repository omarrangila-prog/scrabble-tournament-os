"use client";

import * as React from "react";
import { Check, FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";

import {
  checkProofFile,
  megabytes,
  PROOF_ACCEPT,
} from "@/lib/domain/paymentProof";
import { ageInYear } from "@/lib/domain/registrationParticipants";
import {
  EMPTY_SIGNUP,
  isMinor,
  problemFor,
  signupReady,
  TRAINING_FEE,
  trainingProblems,
  type TrainingPayment,
  type TrainingSignup,
} from "@/lib/domain/training";
import { cn } from "@/lib/utils";

/**
 * Signing up for coaching.
 *
 * Shorter than the tournament form, because a lesson needs less: who is coming, how old they
 * are, who to ring, when they can attend, and how they are paying. There is no division, no
 * activity choice, no promo code and no player number — a trainee is not an entrant, and
 * offering them any of that would be asking a question the answer to which changes nothing.
 *
 * The one piece of real conditional logic is age. The guardian fields appear only once the
 * year of birth says the trainee is a child, and they are hidden rather than merely optional
 * for an adult: a parent registering an eight-year-old must give a number somebody answers,
 * and a thirty-year-old must not be asked for their mother's.
 */

export interface TrainingSubmission extends TrainingSignup {
  /** Worked out from the year, so nothing downstream has to parse one. */
  age: string;
  /** True when the trainee is under 18, as the guardian fields were shown for. */
  minor: boolean;
}

export function TrainingForm({
  fee,
  currency,
  slots,
  paymentInstructions,
  terms,
  saving,
  error,
  onSubmit,
}: {
  fee: number;
  currency: string;
  slots: string[];
  paymentInstructions: string;
  terms: string;
  saving: boolean;
  error: string | null;
  onSubmit: (signup: TrainingSubmission) => void;
}) {
  const [signup, setSignup] = React.useState<TrainingSignup>(EMPTY_SIGNUP);
  const [touched, setTouched] = React.useState(false);
  const [proofProblem, setProofProblem] = React.useState<string | null>(null);
  /*
   * Used as the file input's `key` so clearing a file remounts it empty.
   *
   * A ref would be the obvious way to reset `input.value`, and it is what the tournament form
   * used to do — the React Compiler refuses to build it, because reading a ref during render
   * is not safe under its assumptions. Remounting is both legal and simpler.
   */
  const [proofNonce, setProofNonce] = React.useState(0);

  /* The year an age is measured against: the calendar year the sessions run in. */
  const year = new Date().getFullYear();

  const minor = isMinor(signup.yearOfBirth, year);
  const age = ageInYear(signup.yearOfBirth, year);
  const slotRequired = slots.length > 0;

  const problems = trainingProblems(signup, { year, slotRequired });
  const ready = signupReady(signup, { year, slotRequired });

  const change = (next: Partial<TrainingSignup>) => setSignup((s) => ({ ...s, ...next }));

  const money = (n: number) => `${currency} ${n.toLocaleString("en-PK")}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!ready || saving) return;

    onSubmit({
      ...signup,
      fullName: signup.fullName.trim(),
      phone: signup.phone.trim(),
      guardianName: signup.guardianName.trim(),
      guardianPhone: signup.guardianPhone.trim(),
      experience: signup.experience.trim(),
      age: String(age ?? ""),
      minor: minor === true,
    });
  };

  /* ---- The receipt ------------------------------------------------------ */

  const pickProof = (file: File | null) => {
    if (!file) {
      change({ proofFile: null });
      setProofProblem(null);
      return;
    }

    const allowed = checkProofFile({ name: file.name, type: file.type, size: file.size });
    if (!allowed.ok) {
      change({ proofFile: null });
      setProofProblem(allowed.message);
      return;
    }

    change({ proofFile: file });
    setProofProblem(null);
  };

  const clearProof = () => {
    change({ proofFile: null });
    setProofProblem(null);
    setProofNonce((n) => n + 1);
  };

  /* ---- Shared styling --------------------------------------------------- */

  const problem = (message: string | undefined) =>
    touched && message ? <p className="mt-1 text-[12.5px] text-critical">{message}</p> : null;

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

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {/* ---- Who is coming --------------------------------------------- */}
      <div>
        <label htmlFor="t-name" className={heading}>
          Trainee&rsquo;s full name
        </label>
        <input
          id="t-name"
          value={signup.fullName}
          onChange={(e) => change({ fullName: e.target.value })}
          autoComplete="name"
          placeholder="e.g. Ayesha Khan"
          className={field}
        />
        {problem(problemFor(problems, "fullName"))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="t-born" className={heading}>
            Year of birth
          </label>
          <input
            id="t-born"
            value={signup.yearOfBirth}
            /* Digits only, four of them — a stray letter or a fifth digit never lands. */
            onChange={(e) =>
              change({ yearOfBirth: e.target.value.replace(/\D/g, "").slice(0, 4) })
            }
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="e.g. 2014"
            className={cn(field, "num")}
          />
          {/*
            The age it works out to, read back.
            A year is easy to mistype by a decade and hard to check by eye, and here it also
            decides whether a parent is asked for — so showing the age is what catches it.
          */}
          {age !== null ? (
            <p className={cn(hint, "mt-1")}>
              {age} years old in {year}.{minor ? " We will ask for a parent below." : ""}
            </p>
          ) : null}
          {problem(problemFor(problems, "yearOfBirth"))}
        </div>

        <div>
          <label htmlFor="t-phone" className={heading}>
            Mobile number
            {minor === true ? (
              <span className="font-medium text-muted"> (the trainee&rsquo;s own, if any)</span>
            ) : null}
          </label>
          <input
            id="t-phone"
            value={signup.phone}
            onChange={(e) => change({ phone: e.target.value })}
            inputMode="tel"
            autoComplete="tel"
            placeholder="03XX XXXXXXX"
            className={cn(field, "num")}
          />
          {minor === true ? (
            <p className={cn(hint, "mt-1")}>Optional. Leave it blank for a young child.</p>
          ) : null}
          {problem(problemFor(problems, "phone"))}
        </div>
      </div>

      {/* ---- The parent, only for a child ------------------------------ */}
      {minor === true ? (
        <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] p-3.5">
          <span className={heading}>Parent or guardian</span>
          <p className={hint}>
            {signup.fullName.trim() || "The trainee"} is under 18, so we need an adult we can
            reach about the sessions.
          </p>

          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="t-guardian" className={heading}>
                Parent&rsquo;s full name
              </label>
              <input
                id="t-guardian"
                value={signup.guardianName}
                onChange={(e) => change({ guardianName: e.target.value })}
                autoComplete="off"
                placeholder="e.g. Sana Khan"
                className={field}
              />
              {problem(problemFor(problems, "guardianName"))}
            </div>

            <div>
              <label htmlFor="t-guardian-phone" className={heading}>
                Parent&rsquo;s mobile number
              </label>
              <input
                id="t-guardian-phone"
                value={signup.guardianPhone}
                onChange={(e) => change({ guardianPhone: e.target.value })}
                inputMode="tel"
                autoComplete="off"
                placeholder="03XX XXXXXXX"
                className={cn(field, "num")}
              />
              {problem(problemFor(problems, "guardianPhone"))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- When ------------------------------------------------------ */}
      {slotRequired ? (
        <div>
          <span className={heading}>Which sessions can you attend?</span>
          {choices(
            slots.map((s) => ({ key: s, label: s })),
            signup.preferredSlot,
            (key) => change({ preferredSlot: key }),
            "sm:grid-cols-1",
          )}
          {problem(problemFor(problems, "preferredSlot"))}
        </div>
      ) : null}

      {/* ---- Experience ------------------------------------------------ */}
      <div>
        <label htmlFor="t-experience" className={heading}>
          Have you played Scrabble before?
          <span className="font-medium text-muted"> (optional)</span>
        </label>
        <p className={hint}>
          Anything helps — complete beginner, plays at home, played at school. It decides which
          group the coach puts you in.
        </p>
        <textarea
          id="t-experience"
          value={signup.experience}
          onChange={(e) => change({ experience: e.target.value })}
          rows={3}
          placeholder="e.g. Plays at home with family, never in a tournament"
          className={cn(field, "resize-y")}
        />
      </div>

      {/* ---- Money ----------------------------------------------------- */}
      <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Fee</p>
        <p className="mt-0.5 text-[22px] font-bold text-primary">
          <span className="num">{money(fee)}</span>
        </p>
        <p className={hint}>per person</p>
      </div>

      <div>
        <span className={heading}>How will you pay?</span>
        {choices(
          [
            { key: "cash", label: "Cash at the first session" },
            { key: "online", label: "Pay online now", note: "Bank transfer or EasyPaisa" },
          ],
          signup.payment,
          (key) => change({ payment: key as TrainingPayment }),
        )}
      </div>

      {signup.payment === "online" ? (
        <div className="space-y-2.5">
          {paymentInstructions ? (
            <div className="whitespace-pre-line rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] leading-relaxed text-ink">
              {paymentInstructions}
            </div>
          ) : null}

          {/*
            The receipt, asked for at the moment it exists.
            Somebody who has just transferred the money has the screenshot in their hand;
            asking later means asking on WhatsApp.
          */}
          <div className="rounded-control border border-line p-3.5">
            <span className={heading}>Upload payment proof</span>
            <p className={hint}>
              A screenshot of the transfer, or the bank receipt. JPG, PNG or PDF.
            </p>

            <input
              key={proofNonce}
              id="t-proof"
              type="file"
              accept={PROOF_ACCEPT}
              onChange={(e) => pickProof(e.target.files?.[0] ?? null)}
              className="sr-only"
            />

            {signup.proofFile ? (
              <div className="mt-2.5 flex items-center gap-2.5 rounded-control border border-primary bg-primary-050 px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white text-primary">
                  {signup.proofFile.type === "application/pdf" ? (
                    <FileText className="size-4.5" />
                  ) : (
                    <ImageIcon className="size-4.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {signup.proofFile.name}
                  </span>
                  <span className="num block text-[12px] text-muted">
                    {megabytes(signup.proofFile.size)} MB · attached
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
                htmlFor="t-proof"
                className="mt-2.5 flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-4 text-[14px] font-semibold text-ink"
              >
                <Paperclip className="size-4 text-primary" />
                Choose a file or take a photo
              </label>
            )}

            {proofProblem ? (
              <p className="mt-1.5 text-[12.5px] text-critical">{proofProblem}</p>
            ) : null}
            {proofProblem ? null : problem(problemFor(problems, "proof"))}
          </div>
        </div>
      ) : null}

      {/* ---- Terms ----------------------------------------------------- */}
      {terms ? (
        <div>
          <span className={heading}>Before you sign up</span>
          <div
            className={cn(
              "mt-1.5 whitespace-pre-line rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3",
              hint,
            )}
          >
            {terms}
          </div>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={signup.termsAccepted}
              onChange={(e) => change({ termsAccepted: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="text-[14px] font-semibold text-ink">
              I understand and agree, and I am happy to be contacted about the sessions
            </span>
          </label>
          {problem(problemFor(problems, "terms"))}
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
        {saving ? "Sending…" : "Sign up for training"}
      </button>

      <p className="text-center text-[12px] text-muted">
        We will confirm your place on the number above.
      </p>
    </form>
  );
}

export { TRAINING_FEE };
