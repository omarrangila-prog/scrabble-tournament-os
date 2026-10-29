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
  EMPTY_MAFIA_ENTRY,
  mafiaProblems,
  mafiaReady,
  problemFor,
  type MafiaEntry,
} from "@/lib/domain/mafia";
import {
  checkProofFile,
  megabytes,
  PROOF_ACCEPT,
} from "@/lib/domain/paymentProof";

import styles from "./mafia.module.css";
import { NOIR } from "./noir";
import { Reveal } from "./Reveal";

/**
 * Signing up for Mafia Wars.
 *
 * Four questions and a receipt: name, age, mobile, and whether photographs are fine, then the
 * payment. There is no category, rating, PSA or cash question — this is not a Scrabble entry, and
 * it is paid online only, so the bank details and the receipt upload are always shown rather than
 * appearing after a tap.
 *
 * Styled in the poster's colours with inline styles and a CSS module rather than the app's theme
 * tokens, because those switch with the visitor's light or dark setting and this page must not.
 */

export type MafiaSubmission = MafiaEntry;

export function MafiaForm({
  fee,
  currency,
  paymentInstructions,
  terms,
  saving,
  error,
  onSubmit,
}: {
  fee: number;
  currency: string;
  paymentInstructions: string;
  terms: string;
  saving: boolean;
  error: string | null;
  onSubmit: (entry: MafiaSubmission) => void;
}) {
  const [entry, setEntry] = React.useState<MafiaEntry>(EMPTY_MAFIA_ENTRY);
  const [touched, setTouched] = React.useState(false);
  const [proofProblem, setProofProblem] = React.useState<string | null>(null);
  /* Remounts the file input to clear it; reading a ref in render is not allowed here. */
  const [proofNonce, setProofNonce] = React.useState(0);

  const options = { termsOffered: terms.trim() !== "" };
  const problems = mafiaProblems(entry, options);
  const ready = mafiaReady(entry, options);
  const money = `${currency} ${fee.toLocaleString("en-PK")}`;

  const change = (next: Partial<MafiaEntry>) =>
    setEntry((e) => ({ ...e, ...next }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!ready || saving) return;
    onSubmit(entry);
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
      <p
        className="mt-1.5 text-[12.5px] font-medium"
        style={{ color: "#F59A9E" }}
        role="alert"
      >
        {message}
      </p>
    ) : null;

  const field = `${styles.field} mt-2 w-full rounded-[12px] border px-4 py-3.5 text-[16px] placeholder:opacity-40`;
  const fieldStyle: React.CSSProperties = {
    background: NOIR.field,
    borderColor: NOIR.line,
    color: NOIR.cream,
  };
  /* The small spaced capitals every question is asked in. */
  const label = "block text-[11.5px] font-bold uppercase tracking-[0.16em]";
  const hint = "text-[13px] leading-relaxed";

  /*
   * A section title in two lines: the plain name of the part in small gold capitals, so nobody
   * has to decode anything, and a line of noir above it in the display serif for the mood.
   */
  const title = (numeral: string, plain: string, noir: string) => (
    <div>
      <p
        className="text-[10.5px] font-bold uppercase tracking-[0.28em]"
        style={{ color: NOIR.gold }}
      >
        {numeral} &middot; {plain}
      </p>
      <h3
        className="mt-0.5 text-[24px] font-bold leading-tight"
        style={{ color: NOIR.cream, fontFamily: NOIR.serif }}
      >
        {noir}
      </h3>
    </div>
  );

  /* A hairline with a spade in the middle, between the big parts of the form. */
  const divider = (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1" style={{ background: NOIR.line }} />
      <span style={{ color: `${NOIR.gold}99`, fontSize: 13 }}>♠</span>
      <span className="h-px flex-1" style={{ background: NOIR.line }} />
    </div>
  );

  const yesNo = (selected: boolean | null, pick: (v: boolean) => void) => (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
      {[
        { key: true, label: "Yes, that is fine" },
        { key: false, label: "No, please do not" },
      ].map((o) => {
        const on = selected === o.key;
        return (
          <button
            key={String(o.key)}
            type="button"
            onClick={() => pick(o.key)}
            aria-pressed={on}
            className={`${styles.choice} flex items-center gap-3 rounded-[12px] border px-4 py-3.5 text-left text-[15px] font-semibold`}
            style={{
              background: on ? `${NOIR.red}38` : NOIR.field,
              borderColor: on ? NOIR.redBright : NOIR.line,
              color: on ? NOIR.cream : NOIR.soft,
            }}
          >
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full border-2"
              style={{
                borderColor: on ? NOIR.redBright : `${NOIR.cream}40`,
                background: on ? NOIR.redBright : "transparent",
                color: "#fff",
              }}
            >
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {/* ---- Who you are --------------------------------------------------- */}
      <div className="space-y-4">
        {title("I", "Your details", "Who goes there?")}

        <div className="grid gap-4 sm:grid-cols-[1fr_7.5rem]">
          <div>
            <label
              htmlFor="m-name"
              className={label}
              style={{ color: NOIR.muted }}
            >
              Name
            </label>
            <input
              id="m-name"
              value={entry.fullName}
              onChange={(e) => change({ fullName: e.target.value })}
              autoComplete="name"
              placeholder="e.g. Ayesha Khan"
              className={field}
              style={fieldStyle}
            />
            {problem(problemFor(problems, "name"))}
          </div>
          <div>
            <label
              htmlFor="m-age"
              className={label}
              style={{ color: NOIR.muted }}
            >
              Age
            </label>
            <input
              id="m-age"
              value={entry.age}
              /* Digits only, three at most — a stray letter never lands. */
              onChange={(e) =>
                change({ age: e.target.value.replace(/\D/g, "").slice(0, 3) })
              }
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 21"
              className={`${field} num`}
              style={fieldStyle}
            />
            {problem(problemFor(problems, "age"))}
          </div>
        </div>

        <div>
          <label
            htmlFor="m-phone"
            className={label}
            style={{ color: NOIR.muted }}
          >
            Contact number
          </label>
          <input
            id="m-phone"
            value={entry.phone}
            onChange={(e) => change({ phone: e.target.value })}
            inputMode="tel"
            autoComplete="tel"
            placeholder="03XX XXXXXXX"
            className={`${field} num`}
            style={fieldStyle}
          />
          {problem(problemFor(problems, "phone"))}
        </div>
      </div>

      {divider}

      <Reveal>
        {/* ---- Paying: online only, so nothing to choose -------------------- */}
        <div className="space-y-3.5">
          {title("II", "Pay online", "A gentleman's fee")}
          <p className={hint} style={{ color: NOIR.soft }}>
            Transfer{" "}
            <strong style={{ color: NOIR.cream }} className="num">
              {money}
            </strong>{" "}
            to either account, then upload the screenshot below. Your place is
            held as soon as the receipt is uploaded.
          </p>

          {paymentInstructions ? (
            <div
              className="whitespace-pre-line rounded-[12px] py-3.5 pl-4 pr-4 text-[13.5px] leading-relaxed"
              style={{
                background: NOIR.field,
                color: NOIR.soft,
                border: `1px solid ${NOIR.line}`,
                borderLeft: `3px solid ${NOIR.redBright}`,
              }}
            >
              {paymentInstructions}
            </div>
          ) : null}

          <div
            className="rounded-[12px] border p-4"
            style={{ borderColor: NOIR.line }}
          >
            <span className={label} style={{ color: NOIR.muted }}>
              Upload payment proof
            </span>
            <p className={`${hint} mt-1`} style={{ color: NOIR.muted }}>
              A screenshot of the transfer, or the bank receipt. JPG, PNG or
              PDF.
            </p>

            <input
              key={proofNonce}
              id="m-proof"
              type="file"
              accept={PROOF_ACCEPT}
              onChange={(e) => pickProof(e.target.files?.[0] ?? null)}
              className="sr-only"
            />

            {entry.proofFile ? (
              <div
                className="mt-3 flex items-center gap-3 rounded-[12px] border px-3 py-2.5"
                style={{
                  background: `${NOIR.red}26`,
                  borderColor: NOIR.redBright,
                }}
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-[9px]"
                  style={{ background: NOIR.field, color: NOIR.redBright }}
                >
                  {entry.proofFile.type === "application/pdf" ? (
                    <FileText className="size-5" />
                  ) : (
                    <ImageIcon className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[14px] font-semibold"
                    style={{ color: NOIR.cream }}
                  >
                    {entry.proofFile.name}
                  </span>
                  <span
                    className="num block text-[12px]"
                    style={{ color: NOIR.muted }}
                  >
                    {megabytes(entry.proofFile.size)} MB · attached
                  </span>
                </span>
                <button
                  type="button"
                  onClick={clearProof}
                  aria-label="Remove this file"
                  className={`${styles.choice} grid size-9 shrink-0 place-items-center rounded-[9px]`}
                  style={{ color: NOIR.muted }}
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="m-proof"
                className={`${styles.drop} mt-3 flex cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border border-dashed px-4 py-5 text-[14.5px] font-semibold`}
                style={{
                  borderColor: `${NOIR.cream}38`,
                  background: NOIR.field,
                  color: NOIR.cream,
                }}
              >
                <Paperclip
                  className="size-4"
                  style={{ color: NOIR.redBright }}
                />
                Choose a file or take a photo
              </label>
            )}

            {proofProblem ? (
              <p
                className="mt-2 text-[12.5px] font-medium"
                style={{ color: "#F59A9E" }}
                role="alert"
              >
                {proofProblem}
              </p>
            ) : null}
            {proofProblem ? null : problem(problemFor(problems, "proof"))}
          </div>
        </div>
      </Reveal>

      {divider}

      <Reveal>
        {/* ---- Photographs ---------------------------------------------------- */}
        <div>
          {title("III", "Photos and video", "Smile for the camera?")}
          <p className={`${hint} mt-2`} style={{ color: NOIR.soft }}>
            I give consent for photos and videos to be taken during the event
            and posted on the event&rsquo;s social media handles.
          </p>
          {yesNo(entry.mediaConsent, (v) => change({ mediaConsent: v }))}
          {problem(problemFor(problems, "consent"))}
        </div>
      </Reveal>

      <Reveal>
        {/* ---- Cancellation, as on the Scrabble form -------------------------- */}
        {terms.trim() ? (
          <div>
            {title("IV", "Before you sign up", "The fine print")}
            <div
              className={`mt-3 whitespace-pre-line rounded-[12px] px-4 py-3.5 ${hint}`}
              style={{
                background: NOIR.field,
                color: NOIR.soft,
                border: `1px solid ${NOIR.line}`,
              }}
            >
              {terms}
            </div>
            <label className="mt-3.5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={entry.termsAccepted}
                onChange={(e) => change({ termsAccepted: e.target.checked })}
                className="mt-0.5 size-5 shrink-0"
                style={{ accentColor: NOIR.redBright }}
              />
              <span
                className="text-[14.5px] font-semibold leading-snug"
                style={{ color: NOIR.cream }}
              >
                I understand and agree, and I am happy to be contacted about
                this event
              </span>
            </label>
            {problem(problemFor(problems, "terms"))}
          </div>
        ) : null}
      </Reveal>

      {error ? (
        <p
          className="rounded-[12px] px-4 py-3 text-[13.5px] leading-relaxed"
          style={{ background: `${NOIR.red}38`, color: "#F7C0C2" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={saving}
          className={`${styles.cta} flex w-full items-center justify-center gap-2.5 rounded-[14px] px-4 py-4 text-[17px] font-bold tracking-[0.02em] text-white disabled:opacity-60`}
        >
          {saving ? (
            <Loader2 className="size-4.5 animate-spin" />
          ) : (
            <span aria-hidden>♠</span>
          )}
          {saving ? "Dealing you in…" : "Count me in"}
        </button>

        <p
          className="mt-3 text-center text-[12.5px]"
          style={{ color: NOIR.muted }}
        >
          We will confirm on the number above.
        </p>
      </div>
    </form>
  );
}
