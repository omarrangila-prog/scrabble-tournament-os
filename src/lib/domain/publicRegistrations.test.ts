import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUBLIC_COLUMNS,
  PUBLIC_COLUMNS,
  categoryName,
  exposesPrivateColumns,
  registrationsCsv,
  registrationsFileName,
  registrationsFrom,
  withCategoryNames,
} from "./publicRegistrations";

const CATEGORIES = [
  { id: "beginner", name: "Beginner" },
  { id: "advanced", name: "Masters / Advanced" },
];

const feedOf = (rows: Record<string, string>[], columns = DEFAULT_PUBLIC_COLUMNS) =>
  registrationsFrom([
    {
      out_event_id: "evt",
      out_event_name: "Blufy's Alphabattle",
      out_columns: columns,
      out_rows: rows,
      out_total: rows.length,
      out_updated_at: "2026-10-17T10:00:00Z",
    },
  ])!;

describe("the default columns", () => {
  it("are exactly the seven the brief names, and none is private", () => {
    expect(DEFAULT_PUBLIC_COLUMNS).toEqual([
      "registrationNumber",
      "name",
      "age",
      "category",
      "checkInStatus",
      "paymentStatus",
      "registeredAt",
    ]);
    expect(exposesPrivateColumns(DEFAULT_PUBLIC_COLUMNS)).toBe(false);
  });

  it("never include a payment proof, an internal note or an id as a choosable column", () => {
    const keys = PUBLIC_COLUMNS.map((c) => c.key);
    for (const forbidden of ["paymentProof", "proof", "notes", "adminNote", "id", "checkInCode", "token"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("mark phone and email as private, so a screen can warn before they are turned on", () => {
    expect(exposesPrivateColumns(["name", "phone"])).toBe(true);
    expect(exposesPrivateColumns(["email"])).toBe(true);
  });
});

describe("reading the feed", () => {
  it("returns null when there is no public feed", () => {
    expect(registrationsFrom([])).toBeNull();
    expect(registrationsFrom(null)).toBeNull();
  });

  it("keeps only the columns it was told about, whatever else arrived", () => {
    /* The precondition: the row genuinely carries something it must not. */
    const sneaky = { name: "Ayesha", phone: "0300", paymentProof: "secret.png" };
    expect(Object.keys(sneaky)).toContain("paymentProof");

    const feed = feedOf([sneaky], ["name"]);
    expect(Object.keys(feed.rows[0])).toEqual(["name"]);
  });

  it("drops a column name it does not recognise", () => {
    const feed = registrationsFrom([
      { out_columns: ["name", "paymentProof"], out_rows: [{ name: "A", paymentProof: "x" }] },
    ])!;
    expect(feed.columns).toEqual(["name"]);
  });
});

describe("the CSV", () => {
  const feed = feedOf([
    {
      registrationNumber: "101",
      name: "Ayesha Khan",
      age: "12",
      category: "beginner",
      checkInStatus: "Not checked in",
      paymentStatus: "Paid",
      registeredAt: "2026-10-01 10:00",
    },
  ]);

  it("has one header row, with the labels people read", () => {
    const lines = registrationsCsv(feed).trim().split("\r\n");
    expect(lines[0]).toBe(
      '"Registration #","Name","Age","Category","Check-In Status","Payment Status","Registered At"',
    );
    expect(lines).toHaveLength(2);
  });

  it("ends every line with CRLF, as a spreadsheet expects", () => {
    expect(registrationsCsv(feed)).toMatch(/\r\n$/);
  });

  it("quotes a comma and a quote inside a name", () => {
    const csv = registrationsCsv(feedOf([{ name: 'Khan, "Ayesha"' }], ["name"]));
    expect(csv).toContain('"Khan, ""Ayesha"""');
  });

  it("defuses a name that is a spreadsheet formula", () => {
    const csv = registrationsCsv(feedOf([{ name: "=HYPERLINK(\"http://evil\")" }], ["name"]));
    /* The precondition: the raw name really does start with an operator. */
    expect("=HYPERLINK").toMatch(/^[=+\-@]/);
    expect(csv.split("\r\n")[1].startsWith("\"'=")).toBe(true);
  });

  it("is a header alone for an event with no registrations", () => {
    expect(registrationsCsv(feedOf([], ["name", "age"])).trim()).toBe('"Name","Age"');
  });
});

describe("category names", () => {
  it("uses the event's own name, so a merged category reads as the event calls it", () => {
    expect(categoryName("advanced", CATEGORIES)).toBe("Masters / Advanced");
  });

  it("calls a painter a painter and not a player", () => {
    expect(categoryName("painting", CATEGORIES)).toBe("Painting");
  });

  it("falls back to a readable name for an id it does not know", () => {
    expect(categoryName("juniors", CATEGORIES)).toBe("Juniors");
  });

  it("is applied across the feed only when the category column is shown", () => {
    const withCat = withCategoryNames(feedOf([{ category: "beginner" }], ["category"]), CATEGORIES);
    expect(withCat.rows[0].category).toBe("Beginner");

    const without = feedOf([{ name: "A" }], ["name"]);
    expect(withCategoryNames(without, CATEGORIES)).toBe(without);
  });
});

describe("the file name", () => {
  it("is stable and safe on every filesystem", () => {
    expect(registrationsFileName("Blufy's AlphaBattle")).toBe("blufy-s-alphabattle-registrations.csv");
    expect(registrationsFileName("")).toBe("event-registrations.csv");
  });
});
