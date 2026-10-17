import { describe, expect, it } from "vitest";

import { detectDelimiter, gridsFrom, parseDelimited, parseHtmlTables, parseJsonGrid, sniff } from "./tabular";

describe("sniffing", () => {
  it("recognises an HTML table, JSON and delimited text", () => {
    expect(sniff("<html><table><tr><td>x</td></tr></table></html>")).toBe("html");
    expect(sniff('[{"a":1}]')).toBe("json");
    expect(sniff("a,b\n1,2")).toBe("delimited");
  });
});

describe("delimiters", () => {
  it("finds tabs, commas, semicolons and pipes", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
  });

  it("is not fooled by a comma inside a quoted name in a tab-separated paste", () => {
    expect(detectDelimiter('Player\tOpponent\n"Khan, Ahmed"\t"Ali, Hammad"')).toBe("\t");
  });
});

describe("parsing delimited text", () => {
  it("handles quotes, doubled quotes and a newline inside a cell", () => {
    const grid = parseDelimited('a,b\r\n"Khan, ""Ahmed""","line\none"\r\n');
    expect(grid).toEqual([
      ["a", "b"],
      ['Khan, "Ahmed"', "line\none"],
    ]);
  });

  it("drops a byte-order mark and blank lines", () => {
    expect(parseDelimited("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("trims cells", () => {
    expect(parseDelimited("a , b\n 1 ,2 ")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parsing HTML tables", () => {
  const page = `
    <html><head><style>td{color:red}</style><script>var x = "<table><tr><td>no</td></tr></table>";</script></head>
    <body>
      <table><tr><td>nav</td></tr></table>
      <table>
        <tr><th>Table</th><th>Player</th><th>Opponent</th></tr>
        <tr><td>1</td><td>Khan&nbsp;&amp; Co, <b>Ahmed</b></td><td>Ali<br>Hammad</td></tr>
        <tr><td>2</td><td>Sara</td><td>Bilal &#38; Sons</td></tr>
      </table>
    </body></html>`;

  it("reads rows and cells, and strips tags and entities", () => {
    const [grid] = parseHtmlTables(page);
    expect(grid).toEqual([
      ["Table", "Player", "Opponent"],
      ["1", "Khan & Co, Ahmed", "Ali Hammad"],
      ["2", "Sara", "Bilal & Sons"],
    ]);
  });

  it("does not read a table that only appears inside a script", () => {
    expect(parseHtmlTables(page)).toHaveLength(1);
  });

  it("returns the biggest table first", () => {
    const grids = gridsFrom(page.replace("<tr><td>nav</td></tr>", "<tr><td>a</td></tr><tr><td>b</td></tr>"));
    expect(grids[0].length).toBeGreaterThanOrEqual(grids[grids.length - 1].length);
  });
});

describe("parsing JSON", () => {
  it("turns an array of objects into a header and rows", () => {
    expect(parseJsonGrid('[{"Player":"A","Score":3},{"Player":"B","Score":5}]')).toEqual([
      ["Player", "Score"],
      ["A", "3"],
      ["B", "5"],
    ]);
  });

  it("finds the array inside a wrapping object", () => {
    expect(parseJsonGrid('{"pairings":[{"a":"x"}]}')).toEqual([["a"], ["x"]]);
  });

  it("returns nothing for text that is not JSON", () => {
    expect(parseJsonGrid("{nope")).toEqual([]);
  });
});
