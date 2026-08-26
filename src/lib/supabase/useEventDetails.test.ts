import { describe, expect, it } from "vitest";

import { DEFAULT_PAIRING_RULES, pairingRulesFrom } from "./useEventDetails";

describe("reading an event's pairing rules", () => {
  it("keeps what was stored", () => {
    expect(
      pairingRulesFrom({ avoidRepeatOpponents: false, avoidSameClub: false, maxByesPerPlayer: 3 }),
    ).toEqual({ avoidRepeatOpponents: false, avoidSameClub: false, maxByesPerPlayer: 3 });
  });

  /*
   * A player who may receive no bye cannot be paired in an odd field — the engine has to sit
   * somebody out, and refusing every candidate strands the round. The database will not save
   * a zero; this refuses to read one back, so a row written before that guard existed cannot
   * deadlock pairing either.
   */
  it("never returns fewer than one bye, whatever is stored", () => {
    expect(pairingRulesFrom({ maxByesPerPlayer: 0 }).maxByesPerPlayer).toBe(1);
    expect(pairingRulesFrom({ maxByesPerPlayer: -4 }).maxByesPerPlayer).toBe(1);
    expect(pairingRulesFrom({ maxByesPerPlayer: "nonsense" }).maxByesPerPlayer).toBe(1);
    expect(pairingRulesFrom({}).maxByesPerPlayer).toBe(1);
  });

  it("caps the bye limit rather than accepting an absurd one", () => {
    expect(pairingRulesFrom({ maxByesPerPlayer: 99 }).maxByesPerPlayer).toBe(5);
  });

  it("rounds a fractional bye limit to a whole number of byes", () => {
    expect(pairingRulesFrom({ maxByesPerPlayer: 2.6 }).maxByesPerPlayer).toBe(3);
  });

  /* Absent means "as it always was", not "off" — an event saved before a flag existed must
     keep the behaviour it ran under, not silently lose it. */
  it("treats an absent flag as on", () => {
    expect(pairingRulesFrom({ maxByesPerPlayer: 1 }).avoidRepeatOpponents).toBe(true);
    expect(pairingRulesFrom({ maxByesPerPlayer: 1 }).avoidSameClub).toBe(true);
  });

  it("falls back entirely for a payload that is not an object", () => {
    expect(pairingRulesFrom(null)).toEqual(DEFAULT_PAIRING_RULES);
    expect(pairingRulesFrom("swiss")).toEqual(DEFAULT_PAIRING_RULES);
    expect(pairingRulesFrom(undefined)).toEqual(DEFAULT_PAIRING_RULES);
  });
});
