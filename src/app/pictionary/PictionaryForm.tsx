"use client";

import * as React from "react";
import {
  Check,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";

import {
  checkProofFile,
  megabytes,
  PROOF_ACCEPT,
} from "@/lib/domain/paymentProof";
import {
  EMPTY_ENTRY,
  MIN_TEAM_SIZE,
  entryReady,
  namedPlayers,
  pictionaryProblems,
  problemFor,
  teamTotal,
  type PictionaryEntry,
} from "@/lib/domain/pictionary";
import { cn } from "@/lib/utils";

/**
 * Entering a team.
 *
 * One form for the whole team, filled in by the captain: the team's name, who is playing, the
 * captain's number, and how the team is paying. What the team owes is worked out live from the
 * number of players named, so nobody has to do the sum — and so the amount they transfer is
 * the amount the organisers expect.
 *
 * No category, rating or PSA question: a team is not a Scrabble entrant, and asking would be
 * collecting answers that change nothing.
 */

export type PictionarySubmission = PictionaryEntry;

export function PictionaryForm({
  fee,
  currency,
  maxSize,
  paymentInstructions,
  terms,
  saving,
  error,
  onSubmit,
}: {
  fee: number;
  currency: string;
  maxSize: number;
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

  const options = { termsOffered: terms.trim() !== "", maxSize };
  const problems = pictionaryProblems(entry, options);
  const ready = entryReady(entry, options);

  const named = namedPlayers(entry).length;
  const total = teamTotal(named, fee);
  const money = (n: number) => `${currency} ${n.toLocaleString("en-PK")}`;

  const change = (next: Partial<PictionaryEntry>) =>
    setEntry((e) => ({ ...e, ...next }));

  const setPlayer = (index: number, value: string) =>
    setEntry((e) => ({
      ...e,
      players: e.players.map((p, i) => (i === index ? value : p)),
    }));
  const addPlayer = () =>
    setEntry((e) =>
      e.players.length >= maxSize ? e : { ...e, players: [...e.players, ""] },
    );
  const removePlayer = (index: number) =>
    setEntry((e) => ({
      ...e,
      players: e.players.filter((_, i) => i !== index),
    }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!ready || saving) return;
    onSubmit({
      ...entry,
      teamName: entry.teamName.trim(),
      captainPhone: entry.captainPhone.trim(),
      players: namedPlayers(entry),
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
    items: { key: string; label: string; note?: string }[],
    selected: string,
    pick: (key: string) => void,
  ) => (
    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
      {items.map((o) => (
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
      {/* ---- The team ---------------------------------------------------- */}
      <div>
        <label htmlFor="p-team" className={heading}>
          Team name
        </label>
        <input
          id="p-team"
          value={entry.teamName}
          onChange={(e) => change({ teamName: e.target.value })}
          autoComplete="off"
          placeholder="e.g. Chalk Dust"
          className={field}
        />
        {problem(problemFor(problems, "teamName"))}
      </div>

      {/* ---- The players ------------------------------------------------- */}
      <div>
        <span className={heading}>Players</span>
        <p className={hint}>
          Up to {maxSize} per team, at least {MIN_TEAM_SIZE}. The first name is
          the team captain, who we will ring.
        </p>

        <div className="mt-1.5 space-y-2">
          {entry.players.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setPlayer(i, e.target.value)}
                aria-label={
                  i === 0 ? "Captain's full name" : `Player ${i + 1} full name`
                }
                autoComplete={i === 0 ? "name" : "off"}
                placeholder={
                  i === 0
                    ? "Captain's full name"
                    : `Player ${i + 1}'s full name`
                }
                className={cn(field, "mt-0")}
              />
              {i >= MIN_TEAM_SIZE ? (
                <button
                  type="button"
                  onClick={() => removePlayer(i)}
                  aria-label={`Remove player ${i + 1}`}
                  className="tap-target grid size-11 shrink-0 place-items-center rounded-control text-muted hover:text-critical"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {entry.players.length < maxSize ? (
          <button
            type="button"
            onClick={addPlayer}
            className="mt-2 inline-flex items-center gap-1.5 rounded-control px-1 py-1.5 text-[14px] font-semibold text-primary"
          >
            <Plus className="size-4" />
            Add a player
          </button>
        ) : null}

        {problem(
          problemFor(problems, "captain") ?? problemFor(problems, "players"),
        )}
      </div>

      <div>
        <label htmlFor="p-phone" className={heading}>
          Captain&rsquo;s mobile number
        </label>
        <input
          id="p-phone"
          value={entry.captainPhone}
          onChange={(e) => change({ captainPhone: e.target.value })}
          inputMode="tel"
          autoComplete="tel"
          placeholder="03XX XXXXXXX"
          className={cn(field, "num")}
        />
        {problem(problemFor(problems, "phone"))}
      </div>

      {/* ---- What the team owes ------------------------------------------ */}
      <div className="rounded-control border border-line bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          Your team pays
        </p>
        <p className="mt-0.5 text-[22px] font-bold text-primary">
          <span className="num">{money(total)}</span>
        </p>
        <p className={hint}>
          {named === 0
            ? `${money(fee)} per player`
            : `${named} player${named === 1 ? "" : "s"} × ${money(fee)}`}
        </p>
      </div>

      {/* ---- How ----------------------------------------------------------- */}
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
          place is held for your team until then.
        </p>
      )}

      {/* ---- Terms ------------------------------------------------------- */}
      {terms.trim() ? (
        <div>
          <span className={heading}>Before you register</span>
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
        {saving ? "Sending…" : "Register our team"}
      </button>

      <p className="text-center text-[12px] text-muted">
        We will confirm on the captain&rsquo;s number.
      </p>
    </form>
  );
}
