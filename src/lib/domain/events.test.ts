import { describe, expect, it } from "vitest";
import {
  buildShareAssets,
  computeFee,
  defaultForm,
  Discount,
  generateToken,
  EventState,
  PublicEvent,
  redeemDiscount,
  registrationStatusOf,
  splitEventsForPublic,
  slugify,
  STATE_DESTINATION,
} from "./events";
import { buildEventSeed, PAYMENT_ACCOUNTS } from "./eventSeed";
import { resolvePrice } from "./pricing";

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
  // AlphaBattle has no capacity set, so these use an explicitly capped event.
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
   * entrant — AlphaBattle has no capacity set, so every registration would
   * have read as waitlisted.
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

describe("redeemDiscount", () => {
  const code = (over: Partial<Discount> = {}): Discount => ({
    id: "d1",
    eventId: "evt-a",
    code: "EARLYBIRD",
    label: "Early bird",
    kind: "fixed",
    value: 350,
    expiresAt: "2026-08-10T23:59:59+05:00",
    maxRedemptions: 0,
    redemptions: 0,
    active: true,
    ...over,
  });

  const ok = (r: ReturnType<typeof redeemDiscount>) => !("refusal" in r);

  it("accepts a live code for its own event", () => {
    const r = redeemDiscount([code()], "earlybird", "evt-a", new Date("2026-08-05"));
    expect(ok(r)).toBe(true);
  });

  it("is case-insensitive and ignores surrounding space", () => {
    expect(ok(redeemDiscount([code()], "  eArLyBiRd  ", "evt-a", new Date("2026-08-05")))).toBe(true);
  });

  /**
   * The bug this function exists for. `expiresAt` was on the record from the
   * start but nothing read it, so a dated code stayed usable for ever — an
   * early bird the organizer had no way to close.
   */
  it("refuses a code after it expires", () => {
    const r = redeemDiscount([code()], "EARLYBIRD", "evt-a", new Date("2026-08-11T00:01:00+05:00"));
    expect(r).toMatchObject({ refusal: "expired" });
  });

  it("still accepts it in the last minute before expiry", () => {
    expect(
      ok(redeemDiscount([code()], "EARLYBIRD", "evt-a", new Date("2026-08-10T23:59:00+05:00"))),
    ).toBe(true);
  });

  /** A code for another event must not silently discount this one. */
  it("refuses a code belonging to a different event", () => {
    const r = redeemDiscount([code()], "EARLYBIRD", "evt-b", new Date("2026-08-05"));
    expect(r).toMatchObject({ refusal: "wrong-event" });
  });

  it("refuses a deactivated code", () => {
    const r = redeemDiscount([code({ active: false })], "EARLYBIRD", "evt-a", new Date("2026-08-05"));
    expect(r).toMatchObject({ refusal: "inactive" });
  });

  it("refuses a code that has hit its limit", () => {
    const r = redeemDiscount(
      [code({ maxRedemptions: 5, redemptions: 5 })],
      "EARLYBIRD",
      "evt-a",
      new Date("2026-08-05"),
    );
    expect(r).toMatchObject({ refusal: "exhausted" });
  });

  it("treats zero max redemptions as unlimited", () => {
    expect(
      ok(redeemDiscount([code({ redemptions: 999 })], "EARLYBIRD", "evt-a", new Date("2026-08-05"))),
    ).toBe(true);
  });

  /** Sending someone hunting for a typo that is not there wastes their time. */
  it("distinguishes an expired code from an unrecognised one", () => {
    const expired = redeemDiscount([code()], "EARLYBIRD", "evt-a", new Date("2026-09-01"));
    const unknown = redeemDiscount([code()], "NOSUCHCODE", "evt-a", new Date("2026-08-05"));
    expect(expired).toMatchObject({ refusal: "expired" });
    expect(unknown).toMatchObject({ refusal: "unknown" });
    if ("message" in expired && "message" in unknown)
      expect(expired.message).not.toBe(unknown.message);
  });

  it("refuses an empty code without claiming it is unknown to the event", () => {
    expect(redeemDiscount([code()], "   ", "evt-a")).toMatchObject({ refusal: "unknown" });
  });
});

describe("splitEventsForPublic", () => {
  const at = (slug: string, startDate: string, state: EventState = "registration-open") =>
    ({ ...EVENT, id: slug, slug, startDate, state }) as PublicEvent;

  const NOW = new Date("2026-08-15T12:00:00+05:00");

  it("puts a future event under upcoming", () => {
    const { upcoming, past } = splitEventsForPublic([at("a", "2026-08-23")], NOW);
    expect(upcoming.map((e) => e.slug)).toEqual(["a"]);
    expect(past).toEqual([]);
  });

  /**
   * The rule that matters. An event whose day has gone but which nobody marked
   * `completed` is still over, and listing it under "Upcoming" invites people
   * to register for a night that has already happened.
   */
  it("treats a past date as past even when the state was never updated", () => {
    const { upcoming, past } = splitEventsForPublic([at("a", "2026-08-08")], NOW);
    expect(upcoming).toEqual([]);
    expect(past.map((e) => e.slug)).toEqual(["a"]);
  });

  it("treats a completed event as past even when its date is ahead", () => {
    const { past } = splitEventsForPublic([at("a", "2026-09-30", "completed")], NOW);
    expect(past.map((e) => e.slug)).toEqual(["a"]);
  });

  /** An event is not over until its own day is. */
  it("keeps an event running today under upcoming", () => {
    const { upcoming } = splitEventsForPublic([at("a", "2026-08-15")], NOW);
    expect(upcoming.map((e) => e.slug)).toEqual(["a"]);
  });

  /** A draft is unannounced: listing it publishes an uncommitted date. */
  it("never shows a draft to the public", () => {
    const { upcoming, past } = splitEventsForPublic(
      [at("d", "2026-09-01", "draft"), at("live", "2026-09-02")],
      NOW,
    );
    expect(upcoming.map((e) => e.slug)).toEqual(["live"]);
    expect(past).toEqual([]);
  });

  it("orders upcoming soonest first and past most recent first", () => {
    const { upcoming, past } = splitEventsForPublic(
      [
        at("later", "2026-10-01"),
        at("sooner", "2026-08-20"),
        at("old", "2026-01-10"),
        at("recent", "2026-07-01"),
      ],
      NOW,
    );
    expect(upcoming.map((e) => e.slug)).toEqual(["sooner", "later"]);
    expect(past.map((e) => e.slug)).toEqual(["recent", "old"]);
  });

  it("handles an organization with no events", () => {
    expect(splitEventsForPublic([], NOW)).toEqual({ upcoming: [], past: [] });
  });
});

describe("seeded event data", () => {
  /**
   * Both events are open. The assertion that matters is not the state itself
   * but the invariant behind it: an event accepting registrations must be able
   * to take the money it asks for. An open event with no payment method or no
   * receiving account would collect fees with nowhere to send them, which is
   * exactly why both were held as drafts until the accounts were confirmed.
   */
  it("seeds one active event, and an open one can actually take payment", () => {
    expect(seed.events).toHaveLength(1);

    const open = seed.events.filter((e) => e.state === "registration-open");
    // Without this the loop below passes vacuously if nothing is open.
    expect(open.length).toBeGreaterThan(0);

    for (const event of open) {

      expect(event.paymentMethods.length).toBeGreaterThan(0);
      expect(
        event.bankDetails.trim() || event.walletDetails.trim(),
      ).not.toBe("");
    }
  });



  it("carries the single AlphaBattle rate the organizer set", () => {
    const alphaBattle = seed.events[0];
    const amounts = Object.fromEntries(
      (alphaBattle.rates ?? []).map((r) => [r.id, r.amount]),
    );
    expect(amounts).toEqual({ standard: 1250 });
  });

  /** Money goes to a real account or the step says details are coming. */

  /**
   * Holds for every event, not just today's two. A third event added later that
   * quotes a different account would send money somewhere nobody is watching,
   * and the divergence would be invisible until someone paid into it.
   */
  /**
   * "Choose your experience — you can join either, or both" is only true where
   * there is more than one track. AlphaBattle runs Speed Scrabble alone, so the
   * page offered a choice that did not exist. A one-track event must instead
   * have playing categories to show, or the section has nothing to say.
   */
  it("gives a single-track event categories to choose instead of tracks", () => {
    for (const ev of seed.events) {
      if ((ev.participationTracks?.length ?? 0) > 1) continue;
      expect(ev.divisions?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("offers AlphaBattle the three categories the organizer named", () => {
    const alphaBattle = seed.events.find((e) => e.slug === "alphabattle-23-august");
    expect(alphaBattle?.divisions).toEqual(["beginner", "recreational", "advanced"]);
    // Masters would imply a standard this event does not claim to run.
    expect(alphaBattle?.divisions).not.toContain("masters");
  });

  /** The amounts the organizer stated. A wrong figure here is a broken promise. */
  it("lists AlphaBattle's prizes exactly as stated", () => {
    const alphaBattle = seed.events.find((e) => e.slug === "alphabattle-23-august");

    expect(alphaBattle?.prizes).toEqual([
      { place: "Winner, each category", award: "PKR 5,000" },
      { place: "Runner-up, each category", award: "PKR 2,000" },
      { place: "Winner of each guess-the-song", award: "PKR 1,000" },
    ]);
    // The runner-up prize was seeded at 3,000; the organizer says 2,000.
    expect(JSON.stringify(alphaBattle?.prizes)).not.toContain("3,000");
  });

  /**
   * The four prices the organizer set, and the order they apply in.
   *
   * Regular is PKR 1,250 — the figure on the organizer's own registration form,
   * alongside PSA 950 and Early Bird 800. GAME ON! charges 1,200; that is a
   * different event, not a competing figure for this one.
   */
  describe("AlphaBattle priority pricing", () => {
    const alphaBattle = seed.events.find((e) => e.slug === "alphabattle-23-august")!;
    const rules = alphaBattle.priceRules!;
    const at = (code?: string, isMember = false) =>
      resolvePrice(rules, { isMember, code, at: "2026-08-09T12:00:00+05:00" });

    it("prices the four cases as stated", () => {
      expect(at().final).toBe(1250);
      expect(at(undefined, true).final).toBe(950);
      expect(at("EARLYBIRD").final).toBe(800);
      expect(at("HHS").final).toBe(1000);
    });

    it("names PSA as the membership body", () => {
      expect(rules.member?.label).toBe("PSA Member");
    });

    /** The headline fee and the regular price must agree. */
    it("keeps the event fee and the regular price in step", () => {
      expect(alphaBattle.fee).toBe(rules.regular);
    });

    /**
     * Stacking is the failure that costs money. Three reductions on a 1,250
     * entry could take it near nothing, discovered only while counting takings.
     */
    it("never combines a coupon with membership", () => {
      expect(at("EARLYBIRD", true).final).toBe(800);
      expect(at("HHS", true).final).toBe(1000);
    });

    it("closes Early Bird after its day but keeps HHS open", () => {
      const later = (code: string) =>
        resolvePrice(rules, { isMember: false, code, at: "2026-08-20T10:00:00+05:00" });
      expect(later("EARLYBIRD").coupon.status).toBe("expired");
      expect(later("EARLYBIRD").final).toBe(1250);
      expect(later("HHS").final).toBe(1000);
    });

    /** Group size is not asked, so no rate may depend on it. */
    it("has no rate requiring a group", () => {
      expect((alphaBattle.rates ?? []).some((r) => (r.minGroupSize ?? 0) > 1)).toBe(false);
    });
  });

  it("quotes the one shared account on every event", () => {
    for (const ev of seed.events) {
      expect(ev.bankDetails).toBe(PAYMENT_ACCOUNTS.bank);
      expect(ev.walletDetails).toBe(PAYMENT_ACCOUNTS.wallet);
      expect(ev.paymentMethods).toEqual([...PAYMENT_ACCOUNTS.methods]);
    }
  });

  /** One real code the organizer asked for, expiring with the early-bird rate. */
  it("offers only the early-bird code, tied to AlphaBattle and dated", () => {
    expect(seed.discounts).toHaveLength(1);
    const [code] = seed.discounts;
    expect(code.code).toBe("EARLYBIRD");
    expect(code.eventId).toBe("evt-alphabattle-23-august");
    expect(code.value).toBe(350);
    expect(code.active).toBe(true);
    // Expires with the rate, so a code shared later cannot reopen the offer.
    expect(code.expiresAt).toContain("2026-08-10");
  });

  /**
   * The event starts empty. Seeding invented entrants would put fabricated
   * names into the participant list, the payment queue, and ultimately onto
   * certificates that claim to be evidence-based.
   */
  it("starts with no registrations", () => {
    expect(seed.registrations).toEqual([]);
  });



});


describe("short links", () => {
  const assets = (slug: string) =>
    buildShareAssets({ ...EVENT, slug }, "https://example.com");

  /** A poster URL that wraps across three lines gets mistyped. */
  it("drops the date suffix so the link fits on a poster", () => {
    expect(assets("game-on-8-august").shortUrl).toBe("https://example.com/go/game-on");
  });

  it("leaves a slug alone when it carries no date", () => {
    expect(assets("winter-open").shortUrl).toBe("https://example.com/go/winter-open");
  });

  it("keeps the canonical link intact alongside it", () => {
    const a = assets("game-on-8-august");
    expect(a.registerUrl).toBe("https://example.com/events/game-on-8-august/register");
    expect(a.shortUrl.length).toBeLessThan(a.registerUrl.length);
  });

  it("does not truncate a slug whose tail only looks like a date", () => {
    expect(assets("round-2-qualifier").shortUrl).toBe(
      "https://example.com/go/round-2-qualifier",
    );
  });
});
