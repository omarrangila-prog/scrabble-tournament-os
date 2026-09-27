/**
 * The check-in report.
 *
 * Who was expected, who arrived, and who did not — the document an organiser wants at the
 * end of the day and, more often, while the day is still running: a volunteer with a printed
 * copy can work the door when the wifi drops.
 *
 * Built here as data and rendered somewhere else, once per format. The alternative — three
 * functions each assembling their own idea of the report — is how a PDF and a spreadsheet of
 * the same event end up disagreeing about how many people came.
 *
 * Nothing is counted twice and nothing is invented: a registration with no recorded arrival
 * is "not arrived", which is a different statement from "did not play". People play who never
 * reached the check-in screen, and the report says what this system knows rather than what
 * happened in the room.
 */

export interface CheckInSource {
  playerNumber: string | null;
  fullName: string;
  mobile: string;
  division: string;
  paymentStatus: string;
  amountDue: number | null;
  currency: string;
  checkedInAt: string | null;
  checkInMethod: string | null;
  /** The six digits they read out at the door. */
  checkInCode: string | null;
  /** The uploaded receipt's own name, so a payment can be tied to a file. */
  receiptFileName: string | null;
  /* The rest is for the full list, which exists so this report loses nothing the old
     registrations export carried. None of it is needed to work the door. */
  email: string;
  area: string;
  activity: string;
  scrabbleName: string;
  paintingName: string;
  registrationStatus: string;
}

export interface CheckInRow {
  playerNumber: string;
  name: string;
  mobile: string;
  division: string;
  /** The stored id, kept so the report can order by skill rather than by spelling. */
  divisionId: string;
  payment: string;
  amount: string;
  receipt: string;
  code: string;
  arrived: boolean;
  arrivedAt: string;
  method: string;
  /** Carried through for the full list only. */
  source: CheckInSource;
}

export interface DivisionTally {
  division: string;
  registered: number;
  checkedIn: number;
  notArrived: number;
}

export interface CheckInReport {
  eventName: string;
  eventDate: string;
  generatedAt: string;
  registered: number;
  checkedIn: number;
  notArrived: number;
  /** Whole percent, or null when nobody is registered and the figure would be invented. */
  turnout: number | null;
  byDivision: DivisionTally[];
  rows: CheckInRow[];
}

const DIVISION_LABEL: Record<string, string> = {
  beginner: "Beginner",
  recreational: "Recreational",
  advanced: "Masters / Advanced",
  masters: "Masters",
};

/**
 * Where a division sits, so the report lists them the way every other screen does.
 *
 * Skill order, not alphabetical: the wall, the standings and the pairing screens all run
 * Beginner, Recreational, Advanced, and a report that ran Beginner, Masters, Recreational
 * would be the one document in the building that disagreed. Anything unconfigured sorts
 * after the known ones rather than being dropped.
 */
const DIVISION_ORDER = ["beginner", "recreational", "advanced", "masters"];

export function divisionRank(id: string): number {
  const at = DIVISION_ORDER.indexOf((id ?? "").trim().toLowerCase());
  return at === -1 ? DIVISION_ORDER.length : at;
}

/** The division as somebody reads it, falling back to whatever was stored. */
export function divisionLabel(id: string): string {
  const key = (id ?? "").trim().toLowerCase();
  if (!key) return "Not set";
  return DIVISION_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** "Paid", "Cash owed", "Receipt to check" — the desk's words, not the database's. */
export function paymentLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Paid";
    case "complimentary":
      return "Complimentary";
    case "cash-at-venue":
      return "Cash owed";
    case "receipt-uploaded":
    case "processing":
    case "review-required":
      return "Receipt to check";
    case "not-submitted":
      return "Unpaid";
    default:
      return status.replace(/-/g, " ");
  }
}

/** "14:32" in the event's own timezone, or "" when nothing was recorded. */
export function arrivalTime(iso: string | null, timeZone = "Asia/Karachi"): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

const METHOD_LABEL: Record<string, string> = {
  personal_link: "Own link",
  venue_qr: "Venue QR",
  staff_manual: "By the desk",
};

export function methodLabel(method: string | null): string {
  if (!method) return "";
  return METHOD_LABEL[method] ?? method.replace(/_/g, " ");
}

/**
 * Builds the report.
 *
 * Ordered by division and then by name, because the question asked of it is "is this person
 * here" and the person is looked up by name. Sorting by arrival time instead would put the
 * report in the order the day happened, which nobody searches by.
 */
export function buildCheckInReport(
  source: CheckInSource[],
  meta: { eventName: string; eventDate: string; generatedAt: string; timeZone?: string },
): CheckInReport {
  const rows: CheckInRow[] = source
    .map((s) => ({
      playerNumber: s.playerNumber ?? "",
      name: s.fullName,
      mobile: s.mobile,
      division: divisionLabel(s.division),
      divisionId: (s.division ?? "").trim().toLowerCase(),
      payment: paymentLabel(s.paymentStatus),
      /* An amount nobody has established is blank, never a zero that claims nothing is owed. */
      amount: s.amountDue === null ? "" : `${s.currency || "PKR"} ${s.amountDue.toLocaleString("en-PK")}`,
      receipt: s.receiptFileName ?? "",
      code: s.checkInCode ?? "",
      arrived: Boolean(s.checkedInAt),
      arrivedAt: arrivalTime(s.checkedInAt, meta.timeZone),
      method: methodLabel(s.checkInMethod),
      source: s,
    }))
    .sort(
      (a, b) =>
        divisionRank(a.divisionId) - divisionRank(b.divisionId) ||
        a.division.localeCompare(b.division) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );

  /* Built by walking the rows, which are already in the order the report shows them, so the
     tallies come out in the same order without being sorted a second time. */
  const tallies = new Map<string, DivisionTally>();
  for (const row of rows) {
    const tally = tallies.get(row.division) ?? {
      division: row.division,
      registered: 0,
      checkedIn: 0,
      notArrived: 0,
    };
    tally.registered += 1;
    if (row.arrived) tally.checkedIn += 1;
    else tally.notArrived += 1;
    tallies.set(row.division, tally);
  }

  const checkedIn = rows.filter((r) => r.arrived).length;

  return {
    eventName: meta.eventName,
    eventDate: meta.eventDate,
    generatedAt: meta.generatedAt,
    registered: rows.length,
    checkedIn,
    notArrived: rows.length - checkedIn,
    /* No registrations means no turnout, not nought per cent. */
    turnout: rows.length === 0 ? null : Math.round((checkedIn / rows.length) * 100),
    byDivision: [...tallies.values()],
    rows,
  };
}

/* -------------------------------------------------------------------------- */
/* The table, shared by every format                                           */
/* -------------------------------------------------------------------------- */

export const CHECK_IN_COLUMNS = [
  "Player",
  "Name",
  "Mobile",
  "Division",
  "Payment",
  "Amount",
  "Receipt",
  "Code",
  "Arrived",
  "Time",
  "How",
] as const;

export function checkInCells(report: CheckInReport): string[][] {
  return report.rows.map((r) => [
    r.playerNumber,
    r.name,
    r.mobile,
    r.division,
    r.payment,
    r.amount,
    r.receipt,
    r.code,
    r.arrived ? "Yes" : "No",
    r.arrivedAt,
    r.method,
  ]);
}

/**
 * Everything on record, for the sheet nobody reads at the door.
 *
 * This exists so the report replaces the old registrations export rather than losing half of
 * it: the email, the area, which activity, and who is doing what on a ticket covering two
 * people. None of it helps somebody work the door, which is why it is a separate sheet and
 * not eleven more columns on the one that gets printed.
 */
export const FULL_LIST_COLUMNS = [
  "Player",
  "Name",
  "Mobile",
  "Email",
  "Area",
  "Division",
  "Activity",
  "Scrabble participant",
  "Painting participant",
  "Registration",
  "Payment",
  "Amount",
  "Receipt",
  "Code",
  "Arrived",
  "Time",
  "How",
] as const;

export function fullListCells(report: CheckInReport): string[][] {
  return report.rows.map((r) => [
    r.playerNumber,
    r.name,
    r.mobile,
    r.source.email,
    r.source.area,
    r.division,
    r.source.activity,
    r.source.scrabbleName,
    r.source.paintingName,
    r.source.registrationStatus,
    r.payment,
    r.amount,
    r.receipt,
    r.code,
    r.arrived ? "Yes" : "No",
    r.arrivedAt,
    r.method,
  ]);
}

export function summaryCells(report: CheckInReport): string[][] {
  return [
    ["Event", report.eventName],
    ["Date", report.eventDate],
    ["Report generated", report.generatedAt],
    [],
    ["Registered", String(report.registered)],
    ["Checked in", String(report.checkedIn)],
    ["Not arrived", String(report.notArrived)],
    ["Turnout", report.turnout === null ? "—" : `${report.turnout}%`],
    [],
    ["Division", "Registered", "Checked in", "Not arrived"],
    ...report.byDivision.map((d) => [
      d.division,
      String(d.registered),
      String(d.checkedIn),
      String(d.notArrived),
    ]),
  ];
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One quoted field.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote character, because a spreadsheet
 * treats those as the start of a formula — a name or a note beginning with one becomes
 * executable content in Excel, which is how a CSV export turns into a way of running
 * something on somebody else's machine.
 */
export function csvField(value: string): string {
  const text = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * The table alone, with no summary above it.
 *
 * A CSV is read by a machine as often as by a person, and a preamble of headings turns a
 * clean table into something a spreadsheet import has to be told to skip. The summary goes in
 * the formats that can hold it properly.
 */
export function toCsv(report: CheckInReport): string {
  const lines = [
    CHECK_IN_COLUMNS.map(csvField).join(","),
    ...checkInCells(report).map((row) => row.map(csvField).join(",")),
  ];
  /* CRLF, which is what every spreadsheet expects of a CSV. */
  return lines.join("\r\n");
}

/** "blufys-alphabattle-check-in-2026-10-19". Safe on every filesystem. */
export function reportFileName(report: CheckInReport, extension: string): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return `${[slug(report.eventName), "check-in", slug(report.eventDate)].filter(Boolean).join("-")}.${extension}`;
}
