/**
 * GAME ON! registration rules.
 *
 * This event is two events sharing a room: a social board-game floor and a
 * Speed Scrabble competition. A participant may join either or both, and that
 * one answer decides which operational modules apply to them for the rest of
 * the evening.
 *
 * Getting it wrong is not cosmetic. Putting a board-game attendee into the
 * Scrabble pool seats an empty chair at a board and stalls a round; leaving a
 * Scrabble entrant out of it means they travel to the venue and are not paired.
 */

import {
  InterestAnswer,
  MembershipStatus,
  ParticipationTrack,
  membershipConfirmed,
  playsBoardGames,
  playsScrabble,
} from "../firebase/schema";
import { PlayerCategory } from "./identity";

/* -------------------------------------------------------------------------- */
/* Fee                                                                         */
/* -------------------------------------------------------------------------- */

/** What the poster states. Everything else about money is organizer-configured. */
export const GAME_ON_FEE = 1200;
export const GAME_ON_CURRENCY = "PKR";
export const AFK_DISCOUNT_PERCENT = 10;

export interface FeeLine {
  label: string;
  /** Negative for a reduction. */
  amount: number;
  kind: "fee" | "member" | "campaign";
  /** True while the reduction is claimed but not yet verified. */
  provisional?: boolean;
}

export interface FeeQuote {
  baseFee: number;
  lines: FeeLine[];
  totalOff: number;
  payable: number;
  currency: string;
  /** True when some reduction still depends on a check. */
  awaitingVerification: boolean;
}

export interface CampaignReduction {
  code: string;
  label: string;
  percentOff: number;
  amountOff: number;
}

/**
 * Quotes the fee for one registration.
 *
 * The member discount is shown from the moment it is claimed, because a
 * participant deciding whether to register needs to see the price they will
 * actually pay. It is marked provisional until the membership number is
 * checked, so the organizer never mistakes a claim for confirmed revenue.
 *
 * Reductions come off the base fee rather than compounding, and the total is
 * clamped at the fee: a promotion can make entry free but never owe money back.
 */
export function quoteFee(
  membership: MembershipStatus,
  campaign?: CampaignReduction,
  baseFee = GAME_ON_FEE,
  currency = GAME_ON_CURRENCY,
): FeeQuote {
  const fee = Math.max(0, baseFee);
  const lines: FeeLine[] = [{ label: "Registration", amount: fee, kind: "fee" }];
  let totalOff = 0;
  let awaitingVerification = false;

  const claimsMembership = membership !== "not-claimed" && membership !== "proof-rejected";

  if (claimsMembership) {
    const off = Math.round((fee * AFK_DISCOUNT_PERCENT) / 100);
    const confirmed = membershipConfirmed(membership);
    lines.push({
      label: `Alliance Française member discount (${AFK_DISCOUNT_PERCENT}%)`,
      amount: -off,
      kind: "member",
      provisional: !confirmed,
    });
    totalOff += off;
    if (!confirmed) awaitingVerification = true;
  }

  if (campaign) {
    const pct = Math.min(100, Math.max(0, campaign.percentOff));
    const off = Math.round((fee * pct) / 100) + Math.max(0, campaign.amountOff);
    if (off > 0) {
      lines.push({
        label: `${campaign.label} (${campaign.code})`,
        amount: -off,
        kind: "campaign",
      });
      totalOff += off;
    }
  }

  totalOff = Math.min(totalOff, fee);

  return {
    baseFee: fee,
    lines,
    totalOff,
    payable: fee - totalOff,
    currency,
    awaitingVerification,
  };
}

/** The verified member fee, for display on the public page. */
export function memberFee(baseFee = GAME_ON_FEE): number {
  return baseFee - Math.round((baseFee * AFK_DISCOUNT_PERCENT) / 100);
}

/* -------------------------------------------------------------------------- */
/* Registration record                                                         */
/* -------------------------------------------------------------------------- */

/** What a participant tells us, plus what the organizer decides afterwards. */
export interface GameOnRegistration {
  track: ParticipationTrack;

  fullName: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  city: string;
  affiliation?: string;

  /**
   * Every event they are registering for, including the one they opened.
   *
   * Needed so the recorded amount matches what they were quoted: without it the
   * organizer sees one event's fee for someone who signed up for two.
   */
  selectedEventIds?: string[];
  /** Combined amount owed across those events, after the bundle discount. */
  bundleTotal?: number;

  /* Board-game answers, asked only of that track. */
  playedModernBoardGames?: boolean;
  attendingWith?: "alone" | "with-friends";
  accompanyingCount?: number;
  favouriteGames?: string;

  /* Scrabble answers, asked only of that track. */
  playedCompetitiveScrabble?: boolean;
  attendedPreviousEvent?: boolean;
  hasVerifiedRating?: boolean;
  requestedLevel?: PlayerCategory;
  previousTournaments?: string;
  typicalScore?: number;

  /**
   * The uploaded payment screenshot, by filename.
   *
   * Deliberately not part of the autosaved draft: a file cannot be restored
   * from a string, and implying it was saved would leave someone believing they
   * had uploaded proof of payment when they had not.
   */
  receiptFileName?: string;

  /* Membership. */
  membershipStatus: MembershipStatus;
  membershipNumber?: string;
  membershipName?: string;
  membershipProofFileName?: string;

  /* Future interest, stored separately from the registration itself. */
  jammingSessionInterest?: InterestAnswer;
  communicationConsent: boolean;
}

/* -------------------------------------------------------------------------- */
/* Which modules apply                                                         */
/* -------------------------------------------------------------------------- */

export interface ApplicableModules {
  /** Seeding, pairings, score entry, standings. */
  scrabbleOperations: boolean;
  /** Game-zone assignment and social floor management. */
  boardGameFloor: boolean;
  /** Everyone: check-in, attendance, communication. */
  attendance: boolean;
}

/** What this participant needs from the operational side. */
export function modulesFor(track: ParticipationTrack): ApplicableModules {
  return {
    scrabbleOperations: playsScrabble(track),
    boardGameFloor: playsBoardGames(track),
    attendance: true,
  };
}

/**
 * What a participant is told to do on arrival.
 *
 * Someone entering both is sent to Scrabble first: pairings are time-bound and
 * the board-game floor is not, so the instruction that has a deadline leads.
 */
export function arrivalInstruction(track: ParticipationTrack): string {
  if (playsScrabble(track))
    return "Your first pairing will appear here once the round is published.";
  return "Visit the welcome desk for your game-zone assignment.";
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface RegistrationProblem {
  field: string;
  message: string;
}

/**
 * Checks a registration before submission.
 *
 * Only asks about what applies: a board-game attendee is never told they must
 * choose a Scrabble level, because they were never shown the question.
 *
 * `requireReceipt` follows the same principle. The upload is mandatory, but
 * only when the event can actually be paid — an event with no receiving
 * account shows no upload field, and demanding a screenshot nobody can produce
 * would block registration with an error the participant cannot clear.
 */
export function validateRegistration(
  reg: Partial<GameOnRegistration>,
  options: { requireReceipt?: boolean } = {},
): RegistrationProblem[] {
  const problems: RegistrationProblem[] = [];
  const need = (field: string, value: unknown, message: string) => {
    if (value === undefined || value === null || String(value).trim() === "")
      problems.push({ field, message });
  };

  need("track", reg.track, "Choose what you would like to join.");
  need("fullName", reg.fullName, "Your name is needed for the participant list.");
  need("email", reg.email, "We send your confirmation here.");
  need("mobile", reg.mobile, "We use this to reach you on the day.");
  need("city", reg.city, "City is required.");

  if (reg.track && playsScrabble(reg.track)) {
    need("requestedLevel", reg.requestedLevel, "Choose your preferred playing level.");
  }

  if (
    reg.membershipStatus &&
    reg.membershipStatus !== "not-claimed" &&
    !reg.membershipNumber?.trim()
  ) {
    problems.push({
      field: "membershipNumber",
      message: "Your membership number is needed to verify the discount.",
    });
  }

  /*
   * The payment screenshot is required. Without it a registration arrives with
   * no evidence of payment at all, and the organizer is left chasing people
   * individually to find out who has actually paid.
   *
   * This is a claim, not proof: the screenshot still has to be checked against
   * the account before the payment counts as verified. Requiring it only means
   * every entry carries something to check.
   */
  if (options.requireReceipt) {
    need(
      "receiptFileName",
      reg.receiptFileName,
      "Upload your payment screenshot to complete your registration.",
    );
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Counting                                                                    */
/* -------------------------------------------------------------------------- */

export interface TrackCounts {
  total: number;
  boardGamesOnly: number;
  scrabbleOnly: number;
  both: number;
  /** Everyone on the social floor, including those doing both. */
  boardGameFloor: number;
  /** Everyone in the Scrabble pool, including those doing both. */
  scrabblePool: number;
}

/**
 * Counts participants by track.
 *
 * Reports the exclusive splits and the two operational totals separately.
 * Presenting only the exclusive counts would tell a director 40 people are in
 * board games when 55 are actually on the floor, and they would set out the
 * wrong number of tables.
 */
export function countTracks(tracks: ParticipationTrack[]): TrackCounts {
  const boardGamesOnly = tracks.filter((t) => t === "board_games").length;
  const scrabbleOnly = tracks.filter((t) => t === "speed_scrabble").length;
  const both = tracks.filter((t) => t === "both").length;

  return {
    total: tracks.length,
    boardGamesOnly,
    scrabbleOnly,
    both,
    boardGameFloor: boardGamesOnly + both,
    scrabblePool: scrabbleOnly + both,
  };
}

/* -------------------------------------------------------------------------- */
/* Setup readiness                                                             */
/* -------------------------------------------------------------------------- */

export interface SetupItem {
  id: string;
  label: string;
  done: boolean;
  /** Why it matters, shown when the item is outstanding. */
  hint?: string;
  /** True when registration cannot open until this is supplied. */
  blocking: boolean;
}

export interface SetupInput {
  hasPaymentMethod: boolean;
  hasReceivingAccount: boolean;
  capacity: number;
  rounds: number;
  roundMinutes: number;
  registrationClosesAt?: string;
  contactEmail?: string;
  scrabbleEntrants: number;
}

/**
 * What still has to be decided before registration can open.
 *
 * The poster confirms the event, not how it is run. Everything below is
 * genuinely unknown rather than merely unfilled, so the checklist names each
 * gap instead of the software choosing a plausible value — a public page
 * quoting an invented deadline, or a payment step pointing at a previous
 * event's account, does real damage.
 *
 * Only two items block. A missing capacity or round count is worth flagging but
 * should not stop people registering; a missing payment account means money
 * goes nowhere, and an event nobody can pay for is not open.
 */
export function setupChecklist(input: SetupInput): SetupItem[] {
  const items: SetupItem[] = [
    {
      id: "payment-method",
      label: "Payment method chosen",
      done: input.hasPaymentMethod,
      hint: "Participants cannot pay until at least one method is active.",
      blocking: true,
    },
    {
      id: "receiving-account",
      label: "Receiving account entered",
      done: input.hasReceivingAccount,
      hint: "Without this the payment step has nowhere to send money.",
      blocking: true,
    },
    {
      id: "deadline",
      label: input.registrationClosesAt
        ? "Registration deadline set"
        : "Registration deadline not set",
      done: Boolean(input.registrationClosesAt),
      hint: "Registration stays open until you close it by hand.",
      blocking: false,
    },
    {
      id: "capacity",
      label: input.capacity > 0 ? `Capacity set to ${input.capacity}` : "Capacity not set",
      done: input.capacity > 0,
      hint: "Without a limit, entries are accepted until you close registration.",
      blocking: false,
    },
    {
      id: "contact",
      label: "Contact address for participants",
      done: Boolean(input.contactEmail?.trim()),
      hint: "Shown on the public page and used for confirmation emails.",
      blocking: false,
    },
  ];

  /*
   * Format only matters once somebody has entered Speed Scrabble. Asking an
   * organizer to fix a round count before a single competitor has registered
   * is noise.
   */
  if (input.scrabbleEntrants > 0) {
    items.push(
      {
        id: "rounds",
        label: input.rounds > 0 ? `${input.rounds} rounds` : "Number of rounds not set",
        done: input.rounds > 0,
        hint: `${input.scrabbleEntrants} people have entered Speed Scrabble. Pairing needs a round count.`,
        blocking: false,
      },
      {
        id: "round-length",
        label:
          input.roundMinutes > 0
            ? `${input.roundMinutes} minutes per round`
            : "Round duration not set",
        done: input.roundMinutes > 0,
        hint: "The round timer needs a length before play begins.",
        blocking: false,
      },
    );
  }

  return items;
}

/** Whether registration may be opened, and what stands in the way. */
export function canOpenRegistration(items: SetupItem[]): {
  ready: boolean;
  reason: string;
} {
  const blockers = items.filter((i) => i.blocking && !i.done);

  if (blockers.length === 0)
    return { ready: true, reason: "Everything needed to open registration is in place." };

  return {
    ready: false,
    reason:
      blockers.length === 1
        ? `${blockers[0].label} is still needed.`
        : `${blockers.length} details are still needed before registration can open.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Multi-event bundles                                                         */
/* -------------------------------------------------------------------------- */

/** Percentage off when someone registers for two or more events together. */
export const BUNDLE_DISCOUNT_PERCENT = 15;
export const BUNDLE_MIN_EVENTS = 2;

export interface BundleEvent {
  id: string;
  name: string;
  date: string;
  fee: number;
}

export interface BundleQuote {
  /** Events the participant selected, in the order shown. */
  selected: BundleEvent[];
  /** Combined fee before any reduction. */
  subtotal: number;
  /** Value of the multi-event reduction. Zero below the threshold. */
  bundleOff: number;
  /** True once the discount applies. */
  qualifies: boolean;
  /** What one more event would save, for the nudge. Zero when already earned. */
  nextTierSaving: number;
}

/**
 * Prices a multi-event selection.
 *
 * The reduction is a share of the combined fee rather than a free event, so
 * adding a cheaper event never reduces the total — an offer that punishes the
 * participant for taking it would be worse than no offer.
 *
 * `nextTierSaving` exists so the form can show what one more event is worth
 * without the participant having to work it out.
 */
export function quoteBundle(
  selected: BundleEvent[],
  available: BundleEvent[] = [],
  discountPercent = BUNDLE_DISCOUNT_PERCENT,
): BundleQuote {
  const subtotal = selected.reduce((sum, e) => sum + Math.max(0, e.fee), 0);
  const qualifies = selected.length >= BUNDLE_MIN_EVENTS;
  const pct = Math.min(100, Math.max(0, discountPercent));

  const bundleOff = qualifies ? Math.round((subtotal * pct) / 100) : 0;

  /*
   * What adding one more event would save. Below the threshold that is the
   * whole discount becoming available; at or above it, only the share of the
   * extra event's own fee — anything else would overstate the offer.
   */
  let nextTierSaving = 0;
  if (available.length > selected.length) {
    const cheapestUnselected = available
      .filter((e) => !selected.some((s) => s.id === e.id))
      .reduce((min, e) => (min === null || e.fee < min.fee ? e : min), null as BundleEvent | null);

    if (cheapestUnselected) {
      const nextSubtotal = subtotal + cheapestUnselected.fee;
      const nextOff = Math.round((nextSubtotal * pct) / 100);
      nextTierSaving = Math.max(0, nextOff - bundleOff);
    }
  }

  return { selected, subtotal, bundleOff, qualifies, nextTierSaving };
}

/** One line explaining the bundle position, for the form. */
export function describeBundle(quote: BundleQuote, currency = GAME_ON_CURRENCY): string {
  const money = (n: number) => `${currency} ${n.toLocaleString("en-PK")}`;

  if (quote.selected.length === 0) return "Choose at least one event.";

  if (quote.qualifies)
    return `Early Bird discount applied — ${money(quote.bundleOff)} off ${quote.selected.length} events.`;

  if (quote.nextTierSaving > 0)
    return `Add one more event and save ${money(quote.nextTierSaving)} with the Early Bird discount.`;

  return "Early Bird discount applies when you register for two or more events.";
}

/* -------------------------------------------------------------------------- */
/* Payment instructions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Wording for the optional affiliation field.
 *
 * A competition drops "community" and says nothing about seating: the pairing
 * engine uses affiliation to keep clubmates *apart* (`avoidSameClub`), so
 * offering to seat them together describes the opposite of what happens. A
 * social board-game evening does group people, so it keeps both.
 */
export function affiliationWording(tracks: string[] | undefined): {
  label: string;
  hint: string;
} {
  const competitionOnly = tracks?.length === 1 && tracks[0] === "speed_scrabble";

  return competitionOnly
    ? { label: "School, university or company", hint: "Optional." }
    : {
        label: "School, university, company or community",
        hint: "Optional — helps us seat people together.",
      };
}

export interface PaymentInstruction {
  method: string;
  /** Name the money should be sent to. */
  accountTitle: string;
  /** Account number, IBAN or mobile number. */
  accountNumber: string;
  /**
   * Institution and branch, for a bank transfer.
   *
   * Kept separate rather than folded into the title: a transfer form asks for
   * the bank by name, and dropping it leaves the participant holding an
   * account number with no idea where to send it.
   */
  bank?: string;
  /** Anything else the participant needs, e.g. a reference to quote. */
  note?: string;
}

/**
 * Turns configured account details into instructions a participant can follow.
 *
 * Returns nothing when the organizer has not supplied details. A payment step
 * showing an empty account number is worse than one saying details are coming:
 * somebody will send money to whatever they can find.
 */
export function paymentInstructions(
  methods: string[],
  bankDetails: string,
  walletDetails: string,
): PaymentInstruction[] {
  const out: PaymentInstruction[] = [];

  /*
   * "Bank · Title · Number · IBAN · Branch" — the bank and any branch are kept
   * rather than dropped. Taking parts[1] as the title and discarding the rest
   * left the form showing an account number with no bank name against it,
   * which is not enough to make a transfer.
   */
  const parse = (
    raw: string,
  ): { title: string; number: string; bank?: string } | null => {
    const parts = raw.split("·").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;

    if (parts.length >= 3) {
      const [bank, title, ...rest] = parts;
      // A trailing "… Branch" belongs with the bank, not the account number.
      const branchAt = rest.findIndex((p) => /branch$/i.test(p));
      const branch = branchAt >= 0 ? rest.splice(branchAt, 1)[0] : "";
      return {
        title,
        number: rest.join(" · "),
        bank: branch ? `${bank} · ${branch}` : bank,
      };
    }

    if (parts.length === 2) return { title: parts[0], number: parts[1] };

    const m = raw.match(/^(.+?)\s*\((.+)\)$/);
    if (m) return { title: m[2].trim(), number: m[1].trim() };
    return { title: "", number: raw.trim() };
  };

  if (methods.includes("bank-transfer") && bankDetails.trim()) {
    const p = parse(bankDetails);
    if (p)
      out.push({
        method: "Bank transfer",
        accountTitle: p.title || "See account details",
        accountNumber: p.number,
        bank: p.bank,
        // No amount named: rates, bundles and group payments all differ.
        note: "Transfer to this account, then upload your receipt below.",
      });
  }

  const wallet = walletDetails.trim();
  if (wallet) {
    const p = parse(wallet);
    for (const m of ["easypaisa", "jazzcash"] as const) {
      if (!methods.includes(m)) continue;
      out.push({
        method: m === "easypaisa" ? "EasyPaisa" : "JazzCash",
        accountTitle: p?.title || "See account details",
        accountNumber: p?.number ?? wallet,
        note: "Send to this number, then upload your confirmation screenshot.",
      });
    }
  }

  if (methods.includes("cash")) {
    out.push({
      method: "Cash at the venue",
      accountTitle: "Welcome desk",
      accountNumber: "—",
      note: "Pay when you arrive. No upload needed.",
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Receipt handling                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Whether uploading a receipt marks the payment verified without a human check.
 *
 * The organizer chose this deliberately, against a recommendation, to make
 * registration complete in one step. The consequence is recorded here rather
 * than buried: **any** uploaded file marks the payment as received, including a
 * blank image or a screenshot of somebody else's transfer. Paid and unpaid
 * entrants become indistinguishable in the records.
 *
 * The duplicate and amount checks still run and still flag, so a reviewer can
 * find the suspicious ones afterwards — but nothing is held back at the point
 * of upload.
 *
 * Set to false to restore review-before-verified.
 */
export const AUTO_VERIFY_ON_UPLOAD = true;

/** The payment status a freshly uploaded receipt produces. */
export function statusAfterUpload(hasReceipt: boolean, paysCash: boolean): string {
  if (paysCash) return "cash-at-venue";
  if (!hasReceipt) return "not-submitted";
  return AUTO_VERIFY_ON_UPLOAD ? "verified" : "receipt-uploaded";
}
