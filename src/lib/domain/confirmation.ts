/**
 * What a participant is shown about their own registration, and how the money is worded.
 *
 * The wording matters more than it looks. "Paid" against a cash-at-venue entry tells somebody
 * they owe nothing when they owe eight hundred rupees, and they find out at the door. So each
 * payment state says what is true of it and nothing more, and a missing amount says it is not
 * known rather than quietly reading as zero.
 */

export interface ConfirmationPlayer {
  number: string;
  name: string;
  age: string;
  mobile: string;
  email: string;
  area: string;
  division: string;
  psa: string;
  mediaConsent: string;
  amount: number | null;
  paymentStatus: string;
  paymentMethod: string;
  confirmedAt: string | null;
  correction: string;
  isYou: boolean;
}

export interface MoneyLines {
  /** "Payment Status" / "Registration Type" — whichever applies. */
  label: string;
  value: string;
  /** "Amount Paid" / "Amount Due" / "Amount Recorded". */
  amountLabel: string;
  amountValue: string;
  tone: "paid" | "due" | "checking";
}

const money = (amount: number | null) =>
  amount === null ? null : `PKR ${amount.toLocaleString("en-PK")}`;

/**
 * The payment, in words a participant can act on.
 *
 * Zero is only free when the organizer granted it. A zero sitting under "needs review" means
 * nobody has worked out what this person owes, and telling them the entry is free would be a
 * promise the desk has to break.
 */
export function moneyLines(p: {
  amount: number | null;
  paymentStatus: string;
}): MoneyLines {
  const amount = money(p.amount);

  switch (p.paymentStatus) {
    case "verified":
      return {
        label: "Payment Status",
        value: "Paid and Verified",
        amountLabel: "Amount Paid",
        amountValue: amount ?? "Recorded",
        tone: "paid",
      };

    case "complimentary":
      return {
        label: "Registration Type",
        value: "Complimentary Pass",
        amountLabel: "Amount Due",
        amountValue: "PKR 0",
        tone: "paid",
      };

    case "cash-at-venue":
      return {
        label: "Payment Method",
        value: "Cash at Venue",
        amountLabel: "Amount Due",
        amountValue: amount ?? "To Be Confirmed",
        tone: "due",
      };

    case "review-required":
    case "receipt-uploaded":
    case "processing":
      return {
        label: "Payment Status",
        value: "Under Review",
        amountLabel: "Amount Recorded",
        /* Zero here is not a free entry — it is an amount nobody has established. */
        amountValue: p.amount ? (amount as string) : "To Be Confirmed",
        tone: "checking",
      };

    default:
      return {
        label: "Payment Status",
        value: "Payment Pending",
        amountLabel: "Amount Due",
        amountValue: amount ?? "To Be Confirmed",
        tone: "due",
      };
  }
}

const DIVISION: Record<string, string> = {
  beginner: "Beginner",
  recreational: "Recreational",
  advanced: "Advanced",
};

export function divisionLabel(raw: string): string {
  return DIVISION[raw] ?? (raw ? raw[0].toUpperCase() + raw.slice(1) : "");
}

/** A mobile number in the shape people read it: 0300 1234567. */
export function prettyMobile(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : raw;
}

export interface CardRow {
  label: string;
  value: string;
}

/**
 * The rows to print, with the empty ones left out entirely.
 *
 * A blank "Age" line invites somebody to wonder what happened to it; no line says the
 * registration simply never asked. Nothing here invents a value it does not hold.
 */
export function cardRows(p: ConfirmationPlayer): CardRow[] {
  const m = moneyLines(p);

  const rows: (CardRow | null)[] = [
    { label: "Player Number", value: p.number },
    { label: "Name", value: p.name },
    p.age ? { label: "Age", value: p.age } : null,
    p.division ? { label: "Category", value: divisionLabel(p.division) } : null,
    p.mobile ? { label: "Mobile", value: prettyMobile(p.mobile) } : null,
    p.email ? { label: "Email", value: p.email } : null,
    p.area ? { label: "Area", value: p.area } : null,
    p.psa ? { label: "PSA Player", value: p.psa } : null,
    { label: m.label, value: m.value },
    { label: m.amountLabel, value: m.amountValue },
    p.paymentMethod && p.paymentStatus === "verified"
      ? { label: "Payment Method", value: p.paymentMethod }
      : null,
    p.mediaConsent ? { label: "Media Consent", value: p.mediaConsent } : null,
  ];

  return rows.filter((row): row is CardRow => row !== null && row.value !== "");
}

/**
 * The event, said the same way everywhere it appears.
 *
 * Passed in rather than hardcoded. These strings used to be constants naming the 23 August
 * event, so every confirmation message — email, WhatsApp, and the page they link to — stated
 * that event's name, date, time and venue regardless of which event the registration was
 * actually for.
 */
export interface EventFacts {
  name: string;
  /** Already formatted for reading, not an ISO date. */
  date: string;
  time: string;
  venue: string;
}
