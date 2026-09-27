import { describe, expect, it } from "vitest";

import { columnName, safeSheetName, toXlsxBlob, workbookParts, xmlEscape } from "./xlsx";

/**
 * The spreadsheet.
 *
 * Excel does not correct a malformed workbook — it refuses to open it and says the file may
 * be corrupt, which on a report somebody is about to forward looks like the report is wrong.
 * So these test the things that make it refuse: bad XML, a duplicate sheet name, a character
 * a sheet name may not contain, and a part missing from the package.
 */

describe("cell references", () => {
  it("counts columns the way a spreadsheet does", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(27)).toBe("AB");
    expect(columnName(51)).toBe("AZ");
    expect(columnName(52)).toBe("BA");
  });
});

describe("xmlEscape", () => {
  it("escapes the characters that would end the document early", () => {
    expect(xmlEscape(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f",
    );
  });

  it("strips control characters, which make the workbook unopenable", () => {
    expect(xmlEscape("Ayesha\u0000Khan\u001F")).toBe("AyeshaKhan");
  });

  it("leaves ordinary text, including accents and Urdu, exactly as it was", () => {
    expect(xmlEscape("Ayesha Khan — احمد")).toBe("Ayesha Khan — احمد");
  });
});

describe("safeSheetName", () => {
  it("removes the characters Excel refuses", () => {
    expect(safeSheetName("Check-in [2026]: all/any?")).toBe("Check-in  2026   all any");
  });

  it("never returns an empty name", () => {
    expect(safeSheetName("///")).toBe("Sheet");
    expect(safeSheetName("", "Fallback")).toBe("Fallback");
  });

  it("keeps within the thirty-one character limit", () => {
    expect(safeSheetName("a".repeat(60))).toHaveLength(31);
  });
});

describe("workbookParts", () => {
  const parts = workbookParts([
    { name: "Summary", rows: [["Registered", 70]] },
    { name: "Check-in", rows: [["Name", "Arrived"], ["Ayesha Khan", "Yes"]] },
  ]);

  it("writes every part the package needs", () => {
    for (const path of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ])
      expect(Object.keys(parts)).toContain(path);
  });

  it("declares a content type for every sheet it writes", () => {
    const declared = parts["[Content_Types].xml"].match(/worksheets\/sheet\d+\.xml/g) ?? [];
    const written = Object.keys(parts).filter((p) => p.startsWith("xl/worksheets/"));
    expect(declared).toHaveLength(written.length);
  });

  it("points each relationship at a sheet that exists", () => {
    const targets = [...parts["xl/_rels/workbook.xml.rels"].matchAll(/Target="([^"]+)"/g)].map(
      (m) => m[1],
    );
    for (const target of targets)
      expect(Object.keys(parts)).toContain(target === "styles.xml" ? "xl/styles.xml" : `xl/${target}`);
  });

  it("writes a number as a number and text as text", () => {
    const sheet = parts["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("<v>70</v>");
    expect(sheet).toContain("Registered");
    expect(sheet).not.toContain('t="inlineStr"><is><t xml:space="preserve">70');
  });

  it("makes two sheets of the same name distinct, which Excel demands", () => {
    const clashing = workbookParts([
      { name: "Report", rows: [["a"]] },
      { name: "Report", rows: [["b"]] },
    ]);
    const names = [...clashing["xl/workbook.xml"].matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("escapes a sheet name and a cell rather than breaking the XML", () => {
    const risky = workbookParts([{ name: "A & B", rows: [['Khan "A" <b>']] }]);
    expect(risky["xl/workbook.xml"]).toContain("A &amp; B");
    expect(risky["xl/worksheets/sheet1.xml"]).toContain("Khan &quot;A&quot; &lt;b&gt;");
  });

  it("skips an empty cell instead of writing a blank one", () => {
    const sparse = workbookParts([{ name: "S", rows: [["a", null, "c"]] }]);
    expect(sparse["xl/worksheets/sheet1.xml"]).toContain('r="A1"');
    expect(sparse["xl/worksheets/sheet1.xml"]).not.toContain('r="B1"');
    expect(sparse["xl/worksheets/sheet1.xml"]).toContain('r="C1"');
  });
});

describe("the file itself", () => {
  it("is a zip that unpacks back into the same workbook", async () => {
    const blob = await toXlsxBlob([
      { name: "Check-in", rows: [["Name", "Arrived"], ["Ayesha Khan", "Yes"]] },
    ]);
    expect(blob.size).toBeGreaterThan(0);

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    /* Every declared part is really in the archive. */
    for (const path of Object.keys(workbookParts([{ name: "Check-in", rows: [["Name"]] }])))
      expect(zip.file(path)).not.toBeNull();

    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet).toContain("Ayesha Khan");
  });

  it("starts with the zip signature, so it is recognised as a file and not as text", async () => {
    const blob = await toXlsxBlob([{ name: "S", rows: [["a"]] }]);
    const head = new Uint8Array((await blob.arrayBuffer()).slice(0, 2));
    expect([head[0], head[1]]).toEqual([0x50, 0x4b]);
  });
});
