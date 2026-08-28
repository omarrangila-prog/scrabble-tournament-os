"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import type { PublicEvent } from "@/lib/domain/events";
import { useEventCategories } from "@/lib/supabase/useEventCategories";
import { cn } from "@/lib/utils";

/**
 * Registration, in about a minute.
 *
 * The form this replaces asked eighteen questions across four steps — date of birth, city,
 * area of residence, which board games you enjoy, whether you have played modern board games
 * before, your typical game score, your previous tournaments — and then a review page before
 * you could submit. Almost none of it is needed to enter somebody in a tournament, and every
 * question is another chance to close the tab.
 *
 * Four questions, one screen, one button. Everything asked here is something the tournament
 * genuinely cannot run without:
 *
 *   a name, because the board sheet has to say who is playing;
 *   a mobile, because that is how the day actually reaches people — WhatsApp works today and
 *     email needs a verified sender that this deployment does not have;
 *   a category, because it decides who they are paired against;
 *   how they intend to pay, because the desk needs to know what to expect.
 *
 * Email is offered and optional. It is the only field here that nothing depends on, and a
 * participant who would rather not give one should not be stopped from entering.
 *
 * The categories come from the event itself, so an organiser who adds an Under-12 section in
 * Settings sees it appear here without anybody touching this file.
 */

export interface QuickRegistration {
  fullName: string;
  mobile: string;
  email: string;
  category: string;
  payAtVenue: boolean;
}

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
  const [mobile, setMobile] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [payAtVenue, setPayAtVenue] = React.useState(true);
  const [touched, setTouched] = React.useState(false);

  /*
   * Preselected once the list arrives, so the commonest case — one category, or simply the
   * first — is one fewer tap. Chosen during render from the loaded list rather than copied
   * into state by an effect, which would be a second copy to keep in step.
   */
  const chosen = category || (categories.length === 1 ? categories[0].id : "");

  const nameOk = fullName.trim().length >= 2;
  /* Pakistani mobiles are 11 digits (03xx xxxxxxx); accepting 10 lets a dropped leading
     zero through rather than rejecting somebody over a formatting habit. */
  const digits = mobile.replace(/\D/g, "");
  const mobileOk = digits.length >= 10;
  const categoryOk = chosen !== "";
  const ready = nameOk && mobileOk && categoryOk;

  const submit = () => {
    setTouched(true);
    if (!ready || saving) return;
    onSubmit({
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      email: email.trim(),
      category: chosen,
      payAtVenue,
    });
  };

  const problem = (show: boolean, message: string) =>
    touched && show ? <p className="mt-1 text-[12.5px] text-critical">{message}</p> : null;

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
        <label htmlFor="q-name" className="block text-[14px] font-semibold text-ink">
          Your name
        </label>
        <input
          id="q-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          placeholder="e.g. Ayesha Khan"
          className="mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary"
        />
        {problem(!nameOk, "Please give the name you want on the board sheet.")}
      </div>

      <div>
        <label htmlFor="q-mobile" className="block text-[14px] font-semibold text-ink">
          Mobile number
        </label>
        <p className="text-[12.5px] text-muted">This is how we send your player number.</p>
        <input
          id="q-mobile"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="03xx xxxxxxx"
          className="num mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary"
        />
        {problem(!mobileOk, "Please give a mobile number we can reach you on.")}
      </div>

      <div>
        <span className="block text-[14px] font-semibold text-ink">Which category?</span>
        {!loaded ? (
          <div className="mt-1.5 h-12 animate-pulse rounded-control bg-[rgb(var(--c-surface-soft))]" />
        ) : (
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={chosen === c.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-control border px-3.5 py-3 text-left text-[15px] font-semibold transition-colors",
                  chosen === c.id
                    ? "border-primary bg-primary-050 text-primary"
                    : "border-line bg-[rgb(var(--c-surface))] text-ink hover:bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border-2",
                    chosen === c.id ? "border-primary bg-primary text-white" : "border-line",
                  )}
                >
                  {chosen === c.id ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                {c.name}
              </button>
            ))}
          </div>
        )}
        {problem(!categoryOk, "Please choose a category.")}
      </div>

      <div>
        <span className="block text-[14px] font-semibold text-ink">How will you pay?</span>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {[
            { id: true, label: "Cash at the venue" },
            { id: false, label: "I have already paid" },
          ].map((option) => (
            <button
              key={String(option.id)}
              type="button"
              onClick={() => setPayAtVenue(option.id)}
              aria-pressed={payAtVenue === option.id}
              className={cn(
                "rounded-control border px-3.5 py-3 text-left text-[15px] font-semibold transition-colors",
                payAtVenue === option.id
                  ? "border-primary bg-primary-050 text-primary"
                  : "border-line bg-[rgb(var(--c-surface))] text-ink hover:bg-[rgb(var(--c-surface-soft))]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {event.fee > 0 ? (
          <p className="mt-1.5 text-[12.5px] text-muted">
            Entry is {event.currency ?? "PKR"} {event.fee.toLocaleString("en-PK")}. The desk will
            confirm it when you arrive.
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="q-email" className="block text-[14px] font-semibold text-ink">
          Email <span className="font-normal text-muted">— optional</span>
        </label>
        <input
          id="q-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1.5 w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[16px] outline-none focus:border-primary"
        />
      </div>

      {error ? (
        <p className="rounded-control bg-critical-050 px-3.5 py-3 text-[13px] leading-relaxed text-critical">
          {error}
        </p>
      ) : null}

      {/*
       * Never disabled on incomplete answers. A button that cannot be pressed does not say
       * which question is unanswered — pressing it does, next to the question itself.
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
        One minute, four questions. We will send your player number to your mobile.
      </p>
    </form>
  );
}
