/**
 * A real .xlsx, built in the browser from the JSZip this project already carries.
 *
 * Not a CSV with the extension changed, and not the old SpreadsheetML — both make Excel show
 * a "the file format does not match the extension" warning before it will open them, which
 * on a document an organiser is about to forward to a sponsor looks exactly like corruption.
 *
 * Deliberately minimal: one workbook, sheets of text and numbers, a bold first row. No
 * styling beyond that, no shared-string table, no formulas. Strings are written inline, which
 * costs a few bytes per cell and removes the one part of the format where an index can drift
 * out of step with the cells pointing into it.
 */

export interface Sheet {
  name: string;
  /** Row zero is the header. Null is an empty cell; a number is written as a number. */
  rows: (string | number | null)[][];
}

/** XML text, with the five characters that would otherwise end the document. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    /* Control characters are not representable in XML 1.0 and make the file unopenable. */
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/**
 * A sheet name Excel will accept.
 *
 * At most 31 characters, none of `[]:*?/\`, and never empty — Excel refuses to open the
 * workbook at all rather than correcting any of these, so they are fixed here.
 */
export function safeSheetName(name: string, fallback = "Sheet"): string {
  const cleaned = (name ?? "").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return cleaned || fallback;
}

function cellXml(value: string | number | null, reference: string, header: boolean): string {
  if (value === null || value === "") return "";

  const style = header ? ' s="1"' : "";

  if (typeof value === "number" && Number.isFinite(value))
    return `<c r="${reference}"${style}><v>${value}</v></c>`;

  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((value, c) => cellXml(value, `${columnName(c)}${r + 1}`, r === 0)).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  /* A width for every column that exists anywhere in the sheet, so nothing shows as ####. */
  const widest = sheet.rows.reduce((n, row) => Math.max(n, row.length), 0);
  const cols = Array.from({ length: widest }, (_, c) => {
    const longest = sheet.rows.reduce(
      (n, row) => Math.max(n, String(row[c] ?? "").length),
      8,
    );
    return `<col min="${c + 1}" max="${c + 1}" width="${Math.min(46, longest + 3)}" customWidth="1"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

/** Just enough of a style sheet to make the header row bold. */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

/** Every part of the workbook, as paths and their contents. Exported so it can be tested. */
export function workbookParts(sheets: Sheet[]): Record<string, string> {
  const used = new Set<string>();
  const named = sheets.map((sheet, i) => {
    let name = safeSheetName(sheet.name, `Sheet${i + 1}`);
    /* Two sheets with one name is another workbook Excel simply will not open. */
    let attempt = 2;
    while (used.has(name.toLowerCase())) name = safeSheetName(`${name} ${attempt++}`, `Sheet${i + 1}`);
    used.add(name.toLowerCase());
    return { ...sheet, name };
  });

  const parts: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`,

    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,

    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
      .map(
        (s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("")}</sheets></workbook>`,

    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,

    "xl/styles.xml": STYLES_XML,
  };

  named.forEach((sheet, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet);
  });

  return parts;
}

/** The workbook as a file the browser can save. */
export async function toXlsxBlob(sheets: Sheet[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (const [path, content] of Object.entries(workbookParts(sheets))) zip.file(path, content);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}
