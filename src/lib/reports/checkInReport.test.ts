import { describe, expect, it } from "vitest";

import {
  arrivalTime,
  buildCheckInReport,
  CHECK_IN_COLUMNS,
  checkInCells,
  csvField,
  divisionLabel,
  paymentLabel,
  reportFileName,
  toCsv,
  type CheckInSource,
} from "./checkInReport";

/**
 * The document an organiser counts the room against.
 *
 * The number it reports is the one thing anybody checks twice, so the tests that matter here
 * are the ones about counting: nobody counted twice, nobody invented, and "not arrived" kept
 * distinct from "we do not know".
 */

const player = (over: Partial<CheckInSource> = {}): CheckInSource => ({
  playerNumber: "101",
  fullName: "Ayesha Khan",
  mobile: "03001234567",
  division: "beginner",
  paymentStatus: "verified",
  amountDue: 1200,
  currency: "PKR",
  checkedInAt: "2026-10-19T07:32:00Z",
  checkInMethod: "venue_qr",
  checkInCode: "537565",
  receiptFileName: null,
  email: "",
  area: "",
  activity: "",
  scrabbleName: "",
  paintingName: "",
  registrationStatus: "submitted",
  ...over,
});

const meta = {
  eventName: "Blufy's Alphabattle",
  eventDate: "2026-10-19",
  generatedAt: "19 Oct 2026, 16:40",
};

describe("counting the room", () => {
  it("counts arrivals and absences to the roster total", () => {
    const report = buildCheckInReport(
      [
        player({ fullName: "A" }),
        player({ fullName: "B", checkedInAt: null }),
        player({ fullName: "C" }),
      ],
      meta,
    );
    expect(report.registered).toBe(3);
    expect(report.checkedIn).toBe(2);
    expect(report.notArrived).toBe(1);
    expect(report.checkedIn + report.notArrived).toBe(report.registered);
  });

  it("reports turnout as a whole percent", () => {
    const report = buildCheckInReport(
      [player(), player({ checkedInAt: null }), player({ checkedInAt: null }), player()],
      meta,
    );
    expect(report.turnout).toBe(50);
  });

  it("reports no turnout at all for an empty roster, rather than nought per cent", () => {
    /* Nought per cent is a claim that nobody came; there was nobody to come. */
    const report = buildCheckInReport([], meta);
    expect(report.registered).toBe(0);
    expect(report.turnout).toBeNull();
  });

  it("tallies each division and the tallies add up to the whole", () => {
    const report = buildCheckInReport(
      [
        player({ division: "beginner" }),
        player({ division: "beginner", checkedInAt: null }),
        player({ division: "advanced" }),
      ],
      meta,
    );
    expect(report.byDivision.map((d) => [d.division, d.registered, d.checkedIn])).toEqual([
      ["Beginner", 2, 1],
      ["Masters / Advanced", 1, 1],
    ]);
    expect(report.byDivision.reduce((n, d) => n + d.registered, 0)).toBe(report.registered);
  });

  it("puts somebody with no division in their own group rather than dropping them", () => {
    const report = buildCheckInReport([player({ division: "" })], meta);
    expect(report.rows).toHaveLength(1);
    expect(report.byDivision[0].division).toBe("Not set");
  });
});

describe("the rows", () => {
  it("orders by division then by name, which is how somebody is looked up", () => {
    const report = buildCheckInReport(
      [
        player({ fullName: "Zara", division: "beginner" }),
        player({ fullName: "Adam", division: "beginner" }),
        player({ fullName: "Bilal", division: "advanced" }),
      ],
      meta,
    );
    /* Beginner before Advanced, as every other screen orders them, then names within. */
    expect(report.rows.map((r) => r.name)).toEqual(["Adam", "Zara", "Bilal"]);
  });

  it("leaves an amount nobody has worked out blank, never as zero", () => {
    /* Zero is a claim that nothing is owed, which is not the same as not knowing. */
    const report = buildCheckInReport([player({ amountDue: null })], meta);
    expect(report.rows[0].amount).toBe("");
  });

  it("says nothing about how somebody arrived when they have not", () => {
    const report = buildCheckInReport([player({ checkedInAt: null, checkInMethod: null })], meta);
    expect(report.rows[0].arrived).toBe(false);
    expect(report.rows[0].arrivedAt).toBe("");
    expect(report.rows[0].method).toBe("");
  });

  it("gives every column a cell", () => {
    const report = buildCheckInReport([player()], meta);
    expect(checkInCells(report)[0]).toHaveLength(CHECK_IN_COLUMNS.length);
  });
});

describe("division order", () => {
  it("runs in skill order, the way every other screen does", () => {
    const report = buildCheckInReport(
      [
        player({ division: "advanced", fullName: "A" }),
        player({ division: "beginner", fullName: "B" }),
        player({ division: "recreational", fullName: "C" }),
      ],
      meta,
    );
    expect(report.byDivision.map((d) => d.division)).toEqual([
      "Beginner",
      "Recreational",
      "Masters / Advanced",
    ]);
  });

  it("puts a division nobody configured after the known ones, not first", () => {
    const report = buildCheckInReport(
      [player({ division: "under-12", fullName: "A" }), player({ division: "beginner", fullName: "B" })],
      meta,
    );
    expect(report.byDivision.map((d) => d.division)).toEqual(["Beginner", "Under-12"]);
  });
});

describe("labels", () => {
  it("names the divisions as the room does", () => {
    expect(divisionLabel("advanced")).toBe("Masters / Advanced");
    expect(divisionLabel("recreational")).toBe("Recreational");
    /* An unknown one is shown, not swallowed — the roster is the authority, not this map. */
    expect(divisionLabel("under-12")).toBe("Under-12");
  });

  it("puts a payment in the desk's words", () => {
    expect(paymentLabel("verified")).toBe("Paid");
    expect(paymentLabel("cash-at-venue")).toBe("Cash owed");
    expect(paymentLabel("receipt-uploaded")).toBe("Receipt to check");
    expect(paymentLabel("not-submitted")).toBe("Unpaid");
  });

  it("reads an arrival in the venue's own timezone", () => {
    /* 07:32 UTC is 12:32 in Karachi, which is the time the desk wrote on the sheet. */
    expect(arrivalTime("2026-10-19T07:32:00Z")).toBe("12:32");
    expect(arrivalTime(null)).toBe("");
    expect(arrivalTime("not a date")).toBe("");
  });
});

describe("CSV", () => {
  it("is the table alone, with no preamble a spreadsheet would have to skip", () => {
    const csv = toCsv(buildCheckInReport([player()], meta));
    expect(csv.split("\r\n")[0]).toBe(CHECK_IN_COLUMNS.map((c) => `"${c}"`).join(","));
    expect(csv).not.toContain("Registered");
  });

  it("quotes a comma and doubles a quote instead of breaking the row", () => {
    const csv = toCsv(buildCheckInReport([player({ fullName: 'Khan, A "Kay"' })], meta));
    expect(csv).toContain('"Khan, A ""Kay"""');
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("defuses a name a spreadsheet would run as a formula", () => {
    /* A cell starting with = is executable content in Excel, from a field anybody can type. */
    expect(csvField("=cmd|' /c calc'!A1")).toBe(`"'=cmd|' /c calc'!A1"`);
    expect(csvField("+1")).toBe(`"'+1"`);
    expect(csvField("@sum")).toBe(`"'@sum"`);
    expect(csvField("-5")).toBe(`"'-5"`);
    /* An ordinary name is left exactly as it was typed. */
    expect(csvField("Ayesha")).toBe(`"Ayesha"`);
  });

  it("ends its lines the way a spreadsheet expects", () => {
    const csv = toCsv(buildCheckInReport([player(), player({ fullName: "B" })], meta));
    expect(csv).toContain("\r\n");
  });
});

describe("the file name", () => {
  it("is made of the event and the date, safe on any filesystem", () => {
    const report = buildCheckInReport([player()], meta);
    expect(reportFileName(report, "pdf")).toBe("blufy-s-alphabattle-check-in-2026-10-19.pdf");
  });

  it("survives an event named with nothing a filesystem likes", () => {
    const report = buildCheckInReport([player()], { ...meta, eventName: "///", eventDate: "" });
    expect(reportFileName(report, "csv")).toBe("check-in.csv");
  });
});
