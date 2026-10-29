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

import { NOIR } from "./noir";

/**
 * Signing up for Mafia Wars.
 *
 * Four questions and a receipt: name, age, mobile, and whether photographs are fine, then the
 * payment. There is no category, rating, PSA or cash question — this is not a Scrabble entry, and
 * it is paid online only, so the bank details and the receipt upload are always shown rather than
 * appearing after a tap.
 *
 * Styled in the poster's colours with inline styles rather than the app's theme tokens, because
 * those switch with the visitor's light or dark setting and this page must not.
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
      <p className="mt-1 text-[12.5px]" style={{ color: "#F08A8E" }}>
        {message}
      </p>
    ) : null;

  const field =
    "mt-1.5 w-full rounded-[10px] border px-3.5 py-3 text-[16px] outline-none placeholder:opacity-45 focus:border-[#D23A3F]";
  const fieldStyle: React.CSSProperties = {
    background: NOIR.field,
    borderColor: NOIR.line,
    color: NOIR.cream,
  };
  const heading = "block text-[14px] font-semibold";
  const hint = "text-[12.5px] leading-relaxed";

  const yesNo = (selected: boolean | null, pick: (v: boolean) => void) => (
    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
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
            className="flex items-center gap-2.5 rounded-[10px] border px-3.5 py-3 text-left text-[15px] font-semibold transition-colors"
            style={{
              background: on ? `${NOIR.red}33` : NOIR.field,
              borderColor: on ? NOIR.redBright : NOIR.line,
              color: on ? NOIR.cream : NOIR.soft,
            }}
          >
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full border-2"
              style={{
                borderColor: on ? NOIR.redBright : NOIR.line,
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
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div>
          <label
            htmlFor="m-name"
            className={heading}
            style={{ color: NOIR.cream }}
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
            className={heading}
            style={{ color: NOIR.cream }}
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
          className={heading}
          style={{ color: NOIR.cream }}
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

      {/* ---- What it costs ------------------------------------------------- */}
      <div
        className="rounded-[10px] border px-3.5 py-3 text-center"
        style={{ background: NOIR.field, borderColor: NOIR.line }}
      >
        <p
          className="text-[12.5px] font-semibold uppercase tracking-wide"
          style={{ color: NOIR.muted }}
        >
          You pay
        </p>
        <p
          className="mt-0.5 text-[24px] font-bold"
          style={{ color: NOIR.redBright }}
        >
          <span className="num">{money}</span>
        </p>
        <p className={hint} style={{ color: NOIR.muted }}>
          food included
        </p>
      </div>

      {/* ---- Paying: online only, so nothing to choose -------------------- */}
      <div className="space-y-2.5">
        <span className={heading} style={{ color: NOIR.cream }}>
          Pay online
        </span>
        <p className={hint} style={{ color: NOIR.muted }}>
          Transfer {money} to either account, then upload the screenshot below.
          Your place is held as soon as the receipt is uploaded.
        </p>

        {paymentInstructions ? (
          <div
            className="whitespace-pre-line rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed"
            style={{
              background: NOIR.field,
              color: NOIR.soft,
              border: `1px solid ${NOIR.line}`,
            }}
          >
            {paymentInstructions}
          </div>
        ) : null}

        <div
          className="rounded-[10px] border p-3.5"
          style={{ borderColor: NOIR.line }}
        >
          <span className={heading} style={{ color: NOIR.cream }}>
            Upload payment proof
          </span>
          <p className={hint} style={{ color: NOIR.muted }}>
            A screenshot of the transfer, or the bank receipt. JPG, PNG or PDF.
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
              className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5"
              style={{
                background: `${NOIR.red}22`,
                borderColor: NOIR.redBright,
              }}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[8px]"
                style={{ background: NOIR.field, color: NOIR.redBright }}
              >
                {entry.proofFile.type === "application/pdf" ? (
                  <FileText className="size-4.5" />
                ) : (
                  <ImageIcon className="size-4.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13.5px] font-semibold"
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
                className="grid size-9 shrink-0 place-items-center rounded-[8px]"
                style={{ color: NOIR.muted }}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="m-proof"
              className="mt-2.5 flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed px-3.5 py-4 text-[14px] font-semibold"
              style={{
                borderColor: NOIR.line,
                background: NOIR.field,
                color: NOIR.cream,
              }}
            >
              <Paperclip className="size-4" style={{ color: NOIR.redBright }} />
              Choose a file or take a photo
            </label>
          )}

          {proofProblem ? (
            <p className="mt-1.5 text-[12.5px]" style={{ color: "#F08A8E" }}>
              {proofProblem}
            </p>
          ) : null}
          {proofProblem ? null : problem(problemFor(problems, "proof"))}
        </div>
      </div>

      {/* ---- Photographs ---------------------------------------------------- */}
      <div>
        <span className={heading} style={{ color: NOIR.cream }}>
          Photos and video
        </span>
        <p className={hint} style={{ color: NOIR.muted }}>
          I give consent for photos and videos to be taken during the event and
          posted on the event&rsquo;s social media handles.
        </p>
        {yesNo(entry.mediaConsent, (v) => change({ mediaConsent: v }))}
        {problem(problemFor(problems, "consent"))}
      </div>

      {/* ---- Cancellation, as on the Scrabble form -------------------------- */}
      {terms.trim() ? (
        <div>
          <span className={heading} style={{ color: NOIR.cream }}>
            Before you sign up
          </span>
          <div
            className={`mt-1.5 whitespace-pre-line rounded-[10px] px-3.5 py-3 ${hint}`}
            style={{
              background: NOIR.field,
              color: NOIR.soft,
              border: `1px solid ${NOIR.line}`,
            }}
          >
            {terms}
          </div>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={entry.termsAccepted}
              onChange={(e) => change({ termsAccepted: e.target.checked })}
              className="mt-0.5 size-5 shrink-0"
              style={{ accentColor: NOIR.redBright }}
            />
            <span
              className="text-[14px] font-semibold"
              style={{ color: NOIR.cream }}
            >
              I understand and agree, and I am happy to be contacted about this
              event
            </span>
          </label>
          {problem(problemFor(problems, "terms"))}
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed"
          style={{ background: `${NOIR.red}33`, color: "#F5B3B6" }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5 text-[16px] font-bold text-white transition-opacity disabled:opacity-60"
        style={{ background: NOIR.red }}
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        {saving ? "Sending…" : "Count me in"}
      </button>

      <p className="text-center text-[12px]" style={{ color: NOIR.muted }}>
        We will confirm on the number above.
      </p>
    </form>
  );
}
