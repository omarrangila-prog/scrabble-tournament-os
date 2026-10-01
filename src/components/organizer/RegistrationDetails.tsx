"use client";

import * as React from "react";
import { ExternalLink, FileText, ImageIcon, Loader2 } from "lucide-react";

import { participantLines } from "@/lib/domain/registrationParticipants";
import { answer, paymentProof, type OrganizerRegistration } from "@/lib/supabase/organizer";
import { openPaymentProof } from "@/lib/supabase/paymentProof";
import { cn } from "@/lib/utils";

/**
 * What a registration is actually for, on the staff screens.
 *
 * A combo ticket can cover two people — one plays Scrabble, one paints — and until now the
 * desk saw one name and had no way to tell which of the two in front of them was on the board
 * sheet. These two small pieces are used on the desk, the registration list and the payment
 * queue so all three say the same thing about the same registration.
 */

/**
 * "Scrabble: Ahmed Khan — Beginner" / "Painting: Sara Khan".
 *
 * Renders nothing for a registration from an ordinary tournament, where there is one activity
 * and the name at the top of the card has already said everything there is to say.
 */
export function ParticipantLines({
  reg,
  className,
  showPayment = false,
}: {
  reg: OrganizerRegistration;
  className?: string;
  /**
   * Whether to name how they said they would pay.
   *
   * On for the desk, where a volunteer is deciding whether to hold their hand out, and off
   * on the payment screens, which already say it in their own column.
   */
  showPayment?: boolean;
}) {
  const lines = participantLines({
    activity: answer(reg, "activity"),
    scrabbleName: answer(reg, "scrabbleName"),
    scrabbleCategory: answer(reg, "scrabbleCategory"),
    paintingName: answer(reg, "paintingName"),
  });

  /*
   * One line that only repeats the name already on the card is noise. Two lines — or one
   * naming both activities — is the thing worth showing.
   */
  const paymentChoice = showPayment ? answer(reg, "paymentChoice") : undefined;
  /* A reduced amount with nothing explaining it is the thing a desk cannot check. */
  const promo = answer(reg, "promoCode");

  const worthShowing =
    lines.length > 1 || (lines.length === 1 && lines[0].startsWith("Scrabble + Painting"));

  if (!worthShowing && !paymentChoice && !promo) return null;

  const activity = answer(reg, "activity");

  return (
    <div className={cn("space-y-0.5", className)}>
      {activity ? (
        <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-primary">
          {activity}
        </p>
      ) : null}
      {worthShowing
        ? lines.map((line) => (
            <p key={line} className="text-[12.5px] leading-snug text-ink">
              {line}
            </p>
          ))
        : null}
      {paymentChoice ? (
        <p className="text-[12.5px] leading-snug text-muted">Payment: {paymentChoice}</p>
      ) : null}
      {promo ? (
        <p className="text-[12.5px] leading-snug text-muted">
          Promo code: <span className="font-semibold text-ink">{promo}</span>
          {answer(reg, "promoPercentOff") ? ` (−${answer(reg, "promoPercentOff")}%)` : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Opens the receipt, in a tab, through a link that expires.
 *
 * The bucket is private, so there is no URL to put in an `href` — a signed one is asked for
 * at the moment of the press. That is also why this reports a failure instead of opening a
 * blank tab: a staff session that has lapsed is the usual reason, and "sign in again" is
 * something the person can act on.
 */
export function PaymentProofButton({
  reg,
  className,
  onProblem,
}: {
  reg: OrganizerRegistration;
  className?: string;
  onProblem?: (message: string) => void;
}) {
  const proof = paymentProof(reg);
  if (!proof) return null;

  return (
    <ProofOpenButton
      path={proof.path}
      fileName={proof.fileName}
      contentType={proof.contentType}
      className={className}
      onProblem={onProblem}
    />
  );
}

/**
 * The same button, for a screen that already holds the proof rather than the registration.
 *
 * The receipt review modal works from a submission, not a roster row, and duplicating the
 * signing and the failure message there is how two screens end up disagreeing about what
 * "could not open" means.
 */
export function ProofOpenButton({
  path,
  fileName,
  contentType,
  label = "View receipt",
  className,
  onProblem,
}: {
  path: string;
  fileName: string;
  contentType?: string;
  label?: string;
  className?: string;
  onProblem?: (message: string) => void;
}) {
  const [opening, setOpening] = React.useState(false);

  const isPdf = contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

  const open = async () => {
    setOpening(true);
    const result = await openPaymentProof(path);
    setOpening(false);
    if (!result.ok && result.message) onProblem?.(result.message);
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={opening}
      title={fileName}
      className={cn(
        "tap-target inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-60",
        className,
      )}
    >
      {opening ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isPdf ? (
        <FileText className="size-3.5" />
      ) : (
        <ImageIcon className="size-3.5" />
      )}
      {label}
      {opening ? null : <ExternalLink className="size-3 opacity-60" />}
    </button>
  );
}
