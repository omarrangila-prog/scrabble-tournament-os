import { describe, expect, it } from "vitest";
import {
  buildShareAssets,
  computeFee,
  defaultForm,
  Discount,
  generateToken,
  registrationStatusOf,
  slugify,
  STATE_DESTINATION,
} from "./events";
import { buildEventSeed } from "./eventSeed";

const seed = buildEventSeed();
const EVENT = seed.events[0];

const disc = (over: Partial<Discount>): Discount => ({
  id: "d", eventId: EVENT.id, code: "X", label: "Test", kind: "fixed",
  value: 0, maxRedemptions: 0, redemptions: 0, active: true, ...over,
});

describe("fee calculation", () => {
  it("charges the full fee with no discount", () => {
    expect(computeFee(2000, "PKR").amountDue).toBe(2000);
  });

  it("subtracts a fixed discount", () => {
    const f = computeFee(2000, "PKR", disc({ kind: "fixed", value: 500 }));
    expect(f.discountAmount).toBe(500);
    expect(f.amountDue).toBe(1500);
  });

  it("applies a percentage discount", () => {
    const f = computeFee(2000, "PKR", disc({ kind: "percentage", value: 25 }));
    expect(f.discountAmount).toBe(500);
    expect(f.amountDue).toBe(1500);
  });

  it("makes a free-entry discount cost nothing", () => {
    const f = computeFee(2000, "PKR", disc({ kind: "free-entry", value: 0 }));
    expect(f.amountDue).toBe(0);
  });

  it("never produces a negative amount", () => {
    const f = computeFee(1000, "PKR", disc({ kind: "fixed", value: 5000 }));
    expect(f.amountDue).toBe(0);
    expect(f.discountAmount).toBe(1000);
  });

  it("clamps an out-of-range percentage", () => {
    expect(computeFee(2000, "PKR", disc({ kind: "percentage", value: 250 })).amountDue).toBe(0);
    expect(computeFee(2000, "PKR", disc({ kind: "percentage", value: -50 })).amountDue).toBe(2000);
  });

  it("ignores an inactive discount", () => {
    const f = computeFee(2000, "PKR", disc({ kind: "fixed", value: 500, active: false }));
    expect(f.amountDue).toBe(2000);
  });

  it("carries complimentary games through", () => {
    expect(computeFee(2000, "PKR", disc({ kind: "fixed", value: 500, freeGames: 2 })).freeGames).toBe(2);
  });
});

describe("registration availability", () => {
  // GAME ON! has no capacity set, so these use an explicitly capped event.
  const open = {
    ...EVENT,
    state: "registration-open" as const,
    capacity: 100,
    registrationClosesAt: "2026-09-10T23:59:00+05:00",
  };

  it("is closed while the event is a draft", () => {
    expect(registrationStatusOf({ ...EVENT, state: "draft" }, 0).open).toBe(false);
  });

  it("is open with places remaining", () => {
    const s = registrationStatusOf(open, 10, new Date("2026-08-15"));
    expect(s.open).toBe(true);
    expect(s.label).toBe("Registration Open");
  });

  it("warns when the deadline is near", () => {
    const s = registrationStatusOf(open, 10, new Date("2026-09-09"));
    expect(s.label).toBe("Registration Closing Soon");
  });

  /**
   * Capacity 0 means "no limit set yet", not "full". Before this was handled,
   * 0 >= 0 held and an uncapped event reported itself full to its very first
   * entrant — GAME ON! has no capacity on the poster, so every registration
   * would have read as waitlisted.
   */
  it("treats an unset capacity as no limit rather than a full event", () => {
    const uncapped = { ...open, capacity: 0 };
    const s = registrationStatusOf(uncapped, 25, new Date("2026-08-15"));
    expect(s.open).toBe(true);
    expect(s.label).toBe("Registration Open");
    expect(s.detail).toContain("25 registered");
  });

  it("offers the waiting list when full", () => {
    const s = registrationStatusOf({ ...open, waitingList: true }, open.capacity, new Date("2026-08-15"));
    expect(s.open).toBe(true);
    expect(s.label).toBe("Waiting List Open");
  });

  it("closes when full without a waiting list", () => {
    const s = registrationStatusOf({ ...open, waitingList: false }, open.capacity, new Date("2026-08-15"));
    expect(s.open).toBe(false);
    expect(s.label).toBe("Registration Full");
  });

  it("is closed once registration has ended", () => {
    expect(registrationStatusOf({ ...EVENT, state: "check-in-open" }, 10).open).toBe(false);
  });
});

describe("tokens", () => {
  it("produces distinct tokens", () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateToken()));
    expect(set.size).toBe(2000);
  });

  it("excludes characters that are ambiguous when read aloud", () => {
    const joined = Array.from({ length: 200 }, () => generateToken()).join("");
    expect(joined).not.toMatch(/[01OIL]/);
  });

  it("honours the requested length", () => {
    expect(generateToken(16)).toHaveLength(16);
  });

  it("never contains an internal record id", () => {
    // Tokens must be opaque: no 'reg-', 'evt-' or similar prefixes.
    for (let i = 0; i < 100; i++) {
      expect(generateToken()).not.toMatch(/reg|evt|-/);
    }
  });
});

describe("slugs", () => {
  it("builds a URL-safe slug", () => {
    expect(slugify("Karachi Scrabble Sunday 2026")).toBe("karachi-scrabble-sunday-2026");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("PSA — Open  Cup!! (2026)")).toBe("psa-open-cup-2026");
  });
});

describe("phase-aware event QR", () => {
  it("maps every event state to a destination", () => {
    const states = Object.keys(STATE_DESTINATION);
    expect(states.length).toBeGreaterThan(10);
    for (const s of states) expect(STATE_DESTINATION[s as keyof typeof STATE_DESTINATION]).toBeTruthy();
  });

  it("sends players to register while registration is open", () => {
    expect(STATE_DESTINATION["registration-open"]).toBe("register");
  });

  it("sends players to check in when check-in opens", () => {
    expect(STATE_DESTINATION["check-in-open"]).toBe("check-in");
  });

  it("sends players to result entry when results open", () => {
    expect(STATE_DESTINATION["result-entry"]).toBe("submit-result");
  });
});

describe("share assets", () => {
  const share = buildShareAssets(EVENT, "https://example.com");

  it("builds public and registration URLs from the slug", () => {
    expect(share.publicUrl).toBe(`https://example.com/events/${EVENT.slug}`);
    expect(share.registerUrl).toBe(`https://example.com/events/${EVENT.slug}/register`);
  });

  it("includes the registration link in the WhatsApp message", () => {
    expect(share.whatsappText).toContain(share.registerUrl);
    expect(share.whatsappText).toContain(EVENT.name);
  });

  it("writes an email invitation with the key details", () => {
    expect(share.emailBody).toContain(EVENT.venueName);
    expect(share.emailBody).toContain(share.registerUrl);
  });
});

describe("default form", () => {
  const form = defaultForm("evt-1");

  it("includes the fields a tournament cannot run without", () => {
    const mapped = form.fields.map((f) => f.mapsTo).filter(Boolean);
    for (const required of ["fullName", "email", "mobile", "category"]) {
      expect(mapped).toContain(required);
    }
  });

  it("locks the structural fields against deletion", () => {
    const locked = form.fields.filter((f) => f.locked).map((f) => f.id);
    expect(locked).toContain("fullName");
    expect(locked).toContain("email");
    expect(locked).toContain("consent");
  });
});

describe("seeded event data", () => {
  it("seeds exactly one event, drafted until its details are confirmed", () => {
    expect(seed.events).toHaveLength(1);
    expect(seed.events[0].state).toBe("draft");
  });

  /**
   * The event starts empty. Seeding invented entrants would put fabricated
   * names into the participant list, the payment queue, and ultimately onto
   * certificates that claim to be evidence-based.
   */
  it("starts with no registrations", () => {
    expect(seed.registrations).toEqual([]);
  });

  it("carries only what the poster confirms", () => {
    const event = seed.events[0];
    expect(event.name).toBe("GAME ON!");
    expect(event.subtitle).toBe("An Evening of Board Games & Speed Scrabble");
    expect(event.fee).toBe(1200);
    expect(event.currency).toBe("PKR");
    expect(event.memberDiscountPercent).toBe(10);
    expect(event.venueName).toBe("Alliance Française de Karachi");
    expect(event.startDate).toBe("2026-08-08");
    expect(event.timeDisplay).toBe("5:00 PM onwards");
  });

  it("names the three collaborators without renaming the event after one", () => {
    const event = seed.events[0];
    expect(event.name).toBe("GAME ON!");
    expect(event.collaborators).toEqual([
      "Boardgame Baithak",
      "Blufy's AlphaBattle",
      "Alliance Française",
    ]);
  });

  /** Anything the poster does not state must be listed, not guessed. */
  it("invents nothing the poster leaves out", () => {
    const event = seed.events[0];
    expect(event.paymentMethods).toEqual([]);
    expect(event.bankDetails).toBe("");
    expect(event.walletDetails).toBe("");
    expect(event.prizes).toEqual([]);
    expect(event.rounds).toBe(0);
    expect(event.capacity).toBe(0);
    expect(event.unconfirmed?.length).toBeGreaterThan(0);
  });

  it("offers all three participation tracks", () => {
    expect(seed.events[0].participationTracks).toEqual([
      "board_games",
      "speed_scrabble",
      "both",
    ]);
  });
});
