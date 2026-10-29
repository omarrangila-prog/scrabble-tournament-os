"use client";

import * as React from "react";
import {
  Check,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";

import {
  checkProofFile,
  megabytes,
  PROOF_ACCEPT,
} from "@/lib/domain/paymentProof";
import {
  EMPTY_ENTRY,
  entryReady,
  entryTotal,
  fits,
  pictionaryProblems,
  playersFor,
  problemFor,
  type EntryType,
  type PictionaryEntry,
  type PictionaryRules,
} from "@/lib/domain/pictionary";
import { cn } from "@/lib/utils";

/**
 * Signing up, alone or as a pair.
 *
 * The first choice is the price: one person at one rate, or two people at a single price for
 * both. Everything below follows from it — one set of name and age, or two. The mobile number and
 * email are the registrant's, because one person rings and one inbox gets the confirmation.
 *
 * No category, rating or PSA question: this is not a Scrabble entry, and asking would be
 * collecting answers that change nothing. Lunch is included in both options, so it is not a choice.
 */

export type PictionarySubmission = PictionaryEntry;

export function PictionaryForm({
  rules,
  currency,
  spotsLeft,
  paymentInstructions,
  terms,
  saving,
  error,
  onSubmit,
}: {
  rules: PictionaryRules;
  currency: string;
  /** Spots remaining, or null when unknown. A pair is not offered when only one is left. */
  spotsLeft: number | null;
  paymentInstructions: string;
  terms: string;
  saving: boolean;
  error: string | null;
  onSubmit: (entry: PictionarySubmission) => void;
}) {
  const [entry, setEntry] = React.useState<PictionaryEntry>(EMPTY_ENTRY);
  const [touched, setTouched] = React.useState(false);
  const [proofProblem, setProofProblem] = React.useState<string | null>(null);
  /* Remounts the file input to clear it; reading a ref in render is not allowed here. */
  const [proofNonce, setProofNonce] = React.useState(0);

  const problems = pictionaryProblems(entry, rules);
  const ready = entryReady(entry, rules);

  const total = entryTotal(entry.type, rules);
  const money = (n: number) => `${currency} ${n.toLocaleString("en-PK")}`;

  const change = (next: Partial<PictionaryEntry>) =>
    setEntry((e) => ({ ...e, ...next }));

  const chooseType = (type: EntryType) =>
    setEntry((e) => ({ ...e, type, players: playersFor(type, e.players) }));

  const setPlayer = (
    index: number,
    next: Partial<{ name: string; age: string }>,
  ) =>
    setEntry((e) => ({
      ...e,
      players: e.players.map((p, i) => (i === index ? { ...p, ...next } : p)),
    }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!ready || saving) return;
    onSubmit({
      ...entry,
      players: entry.players.map((p) => ({
        name: p.name.trim().replace(/\s+/g, " "),
        age: p.age.trim(),
      })),
      phone: entry.phone.trim(),
      email: entry.email.trim(),
    });
  };

  const pickProof = (file: File | null) => {
    if (!file) {
      change({ proofFile: null });
      setProofProblem(null);
      return;
    }
    const allowed = checkProofFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
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

  const problem = (message: string | undefined) =>
    touched && message ? (
      <p className="mt-1 text-[12.5px] text-critical">{message}</p>
    ) : null;

  const field =
    "mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary";
  const heading = "block text-[14px] font-semibold text-ink";
  const hint = "text-[12.5px] leading-relaxed text-muted";

  const choices = (
    items: { key: string; label: string; note?: string; disabled?: boolean }[],
    selected: string,
    pick: (key: string) => void,
  ) => (
    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
      {items.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={o.disabled}
          onClick={() => pick(o.key)}
          aria-pressed={selected === o.key}
          className={cn(
            "flex items-center gap-2.5 rounded-control border px-3.5 py-3 text-left text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            selected === o.key
              ? "border-primary bg-primary-050 text-primary"
              : "border-line bg-[rgb(var(--c-surface))] text-ink hover:bg-[rgb(var(--c-surface-soft))]",
          )}
        >
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border-2",
              selected === o.key
                ? "border-primary bg-primary text-white"
                : "border-line",
            )}
          >
            {selected === o.key ? (
              <Check className="size-3" strokeWidth={3} />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block">{o.label}</span>
            {o.note ? (
              <span className="block text-[12px] font-medium opacity-80">
                {o.note}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {/* ---- How you are signing up --------------------------------------- */}
      <div>
        <span className={heading}>How are you signing up?</span>
        <p className={hint}>Lunch is included either way.</p>
        {choices(
          [
            {
              key: "individual",
              label: "Individual",
              note: `${money(rules.individualFee)} per person`,
              disabled: !fits("individual", spotsLeft),
            },
            {
              key: "team",
              label: "Team of 2",
              note: `${money(rules.teamFee)} for both`,
              disabled: !fits("team", spotsLeft),
            },
          ],
          entry.type,
          (k) => chooseType(k as EntryType),
        )}
        {spotsLeft === 1 ? (
          <p className={cn(hint, "mt-1")}>
            Only one spot is left, so only an individual place is open.
          </p>
        ) : null}
      </div>

      {/* ---- Who is playing ------------------------------------------------- */}
      {entry.players.map((p, i) => (
        <div
          key={i}
          className={
            entry.type === "team"
              ? "rounded-control border border-line p-3.5"
              : ""
          }
        >
          {entry.type === "team" ? (
            <span className={cn(heading, "mb-1")}>
              {i === 0 ? "First player" : "Second player"}
            </span>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor={`p-name-${i}`} className={heading}>
                Name
              </label>
              <input
                id={`p-name-${i}`}
                value={p.name}
                onChange={(e) => setPlayer(i, { name: e.target.value })}
                autoComplete={i === 0 ? "name" : "off"}
                placeholder="e.g. Ayesha Khan"
                className={field}
              />
              {problem(problemFor(problems, "name", i))}
            </div>
            <div>
              <label htmlFor={`p-age-${i}`} className={heading}>
                Age
              </label>
              <input
                id={`p-age-${i}`}
                value={p.age}
                /* Digits only, three at most — a stray letter never lands. */
                onChange={(e) =>
                  setPlayer(i, {
                    age: e.target.value.replace(/\D/g, "").slice(0, 3),
                  })
                }
                inputMode="numeric"
                autoComplete="off"
                placeholder={`${rules.ageMin}–${rules.ageMax}`}
                className={cn(field, "num")}
              />
              {problem(problemFor(problems, "age", i))}
            </div>
          </div>
        </div>
      ))}
      <p className={cn(hint, "-mt-2")}>
        Open to players aged {rules.ageMin} to {rules.ageMax}.
      </p>

      {/* ---- How to reach you ----------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="p-phone" className={heading}>
            Phone number
          </label>
          <input
            id="p-phone"
            value={entry.phone}
            onChange={(e) => change({ phone: e.target.value })}
            inputMode="tel"
            autoComplete="tel"
            placeholder="03XX XXXXXXX"
            className={cn(field, "num")}
          />
          {problem(problemFor(problems, "phone"))}
        </div>
        <div>
          <label htmlFor="p-email" className={heading}>
            Email
          </label>
          <input
            id="p-email"
            type="email"
            value={entry.email}
            onChange={(e) => change({ email: e.target.value })}
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@example.com"
            className={field}
          />
          {problem(problemFor(problems, "email"))}
        </div>
      </div>
      {entry.type === "team" ? (
        <p className={cn(hint, "-mt-3")}>
          One phone number and email for the pair is enough.
        </p>
      ) : null}

      {/* ---- What you pay ---------------------------------------------------- */}
      <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          You pay
        </p>
        <p className="mt-0.5 text-[22px] font-bold text-primary">
          <span className="num">{money(total)}</span>
        </p>
        <p className={hint}>
          {entry.type === "team" ? "for both players" : "for one player"} ·
          lunch included
        </p>
      </div>

      <div>
        <span className={heading}>How will you pay?</span>
        {choices(
          [
            {
              key: "online",
              label: "Online payment",
              note: "Bank transfer or EasyPaisa",
            },
            {
              key: "cash",
              label: "Cash on site",
              note: "Pay at the desk on the day",
            },
          ],
          entry.payment,
          (k) => {
            change({ payment: k as PictionaryEntry["payment"] });
            /* A receipt attached and then switched to cash is a file nobody asked for. */
            if (k !== "online") clearProof();
          },
        )}
      </div>

      {entry.payment === "online" ? (
        <div className="space-y-2.5">
          <p className={hint}>
            Transfer {money(total)}, then upload the screenshot below. Your
            place is held as soon as the receipt is uploaded.
          </p>
          {paymentInstructions ? (
            <div className="whitespace-pre-line rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] leading-relaxed text-ink">
              {paymentInstructions}
            </div>
          ) : null}

          <div className="rounded-control border border-line p-3.5">
            <span className={heading}>Upload payment proof</span>
            <p className={hint}>
              A screenshot of the transfer, or the bank receipt. JPG, PNG or
              PDF.
            </p>

            <input
              key={proofNonce}
              id="p-proof"
              type="file"
              accept={PROOF_ACCEPT}
              onChange={(e) => pickProof(e.target.files?.[0] ?? null)}
              className="sr-only"
            />

            {entry.proofFile ? (
              <div className="mt-2.5 flex items-center gap-2.5 rounded-control border border-primary bg-primary-050 px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white text-primary">
                  {entry.proofFile.type === "application/pdf" ? (
                    <FileText className="size-4.5" />
                  ) : (
                    <ImageIcon className="size-4.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {entry.proofFile.name}
                  </span>
                  <span className="num block text-[12px] text-muted">
                    {megabytes(entry.proofFile.size)} MB · attached
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
                htmlFor="p-proof"
                className="mt-2.5 flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-4 text-[14px] font-semibold text-ink"
              >
                <Paperclip className="size-4 text-primary" />
                Choose a file or take a photo
              </label>
            )}

            {proofProblem ? (
              <p className="mt-1.5 text-[12.5px] text-critical">
                {proofProblem}
              </p>
            ) : null}
            {proofProblem ? null : problem(problemFor(problems, "proof"))}
          </div>
        </div>
      ) : (
        <p className={hint}>
          Bring {money(total)} in cash and pay at the desk when you arrive. Your
          spot is held until then.
        </p>
      )}

      {/* ---- Terms ------------------------------------------------------- */}
      {rules.termsOffered ? (
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
              checked={entry.termsAccepted}
              onChange={(e) => change({ termsAccepted: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="text-[14px] font-semibold text-ink">
              I understand and agree, and I am happy to be contacted about this
              event
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
        {saving
          ? "Sending…"
          : entry.type === "team"
            ? "Sign up our team"
            : "Sign me up"}
      </button>

      <p className="text-center text-[12px] text-muted">
        We will confirm on the phone number above.
      </p>
    </form>
  );
}
