import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fromParts, isEmailConfigured, provider } from "./send";

const KEYS = ["BREVO_API_KEY", "RESEND_API_KEY", "EMAIL_FROM"] as const;

describe("provider selection", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports nothing configured when neither key is set", () => {
    expect(provider()).toBe("none");
    expect(isEmailConfigured()).toBe(false);
  });

  it("uses Resend when only its key is set", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(provider()).toBe("resend");
    expect(isEmailConfigured()).toBe(true);
  });

  it("uses Brevo when only its key is set", () => {
    process.env.BREVO_API_KEY = "xkeysib_test";
    expect(provider()).toBe("brevo");
  });

  it("prefers Brevo when both are set, because it can reach participants", () => {
    // The precondition: both keys really are present, which is the ambiguous case.
    process.env.BREVO_API_KEY = "xkeysib_test";
    process.env.RESEND_API_KEY = "re_test";
    expect(provider()).toBe("brevo");
  });

  it("treats whitespace as unset rather than as a key", () => {
    process.env.BREVO_API_KEY = "   ";
    expect(provider()).toBe("none");
  });
});

describe("fromParts", () => {
  it("splits a name and address, which Brevo needs apart", () => {
    expect(fromParts("Blufy's AlphaBattle <hello@example.com>")).toEqual({
      name: "Blufy's AlphaBattle",
      email: "hello@example.com",
    });
  });

  it("takes a bare address", () => {
    expect(fromParts("hello@example.com")).toEqual({ email: "hello@example.com" });
  });

  it("strips the quotes people paste around a display name", () => {
    expect(fromParts('"Blufy\'s AlphaBattle" <hello@example.com>')).toEqual({
      name: "Blufy's AlphaBattle",
      email: "hello@example.com",
    });
  });

  it("tolerates spacing inside the angle brackets", () => {
    expect(fromParts("Name <  hello@example.com  >")).toEqual({
      name: "Name",
      email: "hello@example.com",
    });
  });

  it("returns no name when the angle form has none", () => {
    expect(fromParts("<hello@example.com>")).toEqual({ email: "hello@example.com" });
  });

  it("falls back to the shared sender when nothing is configured", () => {
    /*
     * Deliberately the shared address: it delivers only to the account owner, so an
     * unconfigured deployment fails as "nothing arrived" rather than as a refused send.
     */
    expect(fromParts("")).toEqual({ email: "onboarding@resend.dev" });
  });
});
