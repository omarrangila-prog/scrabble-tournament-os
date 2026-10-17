import { describe, expect, it } from "vitest";

import { publicLinks } from "./publicLinks";

describe("publicLinks", () => {
  const links = publicLinks("https://example.org", "alphabattle-october-2026");

  it("builds the four addresses", () => {
    expect(links).toEqual({
      live: "https://example.org/events/alphabattle-october-2026/live",
      registrations: "https://example.org/public/events/alphabattle-october-2026/registrations",
      csv: "https://example.org/public/events/alphabattle-october-2026/registrations.csv",
      tv: "https://example.org/live/pairings?event=alphabattle-october-2026",
    });
  });

  it("does not double a trailing slash on the origin", () => {
    expect(publicLinks("https://example.org/", "x").live).toBe("https://example.org/events/x/live");
  });

  it("escapes a slug that could break out of the path", () => {
    expect(publicLinks("https://example.org", "a/b?c").live).toBe(
      "https://example.org/events/a%2Fb%3Fc/live",
    );
  });
});
