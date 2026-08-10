import { describe, expect, it } from "vitest";

import { asEmail } from "./organizer";

/**
 * The username mapping decides which account a sign-in reaches, so a wrong domain
 * here is a login that fails with "email and password do not match" while the
 * password is perfectly correct — the least diagnosable failure available.
 */
describe("asEmail", () => {
  it("completes a bare username to the address its account uses", () => {
    expect(asEmail("admin")).toBe("admin@blufys.pk");
  });

  it("leaves a real address alone", () => {
    expect(asEmail("mahmedrangila@gmail.com")).toBe("mahmedrangila@gmail.com");
  });

  it("ignores case and surrounding space, which a phone keyboard adds", () => {
    expect(asEmail("  Admin ")).toBe("admin@blufys.pk");
    expect(asEmail(" MAhmedRangila@Gmail.com ")).toBe("mahmedrangila@gmail.com");
  });

  it("does not turn an empty field into an address", () => {
    // Sending "@blufys.pk" would be a sign-in attempt for an account nobody has.
    expect(asEmail("")).toBe("");
    expect(asEmail("   ")).toBe("");
  });

  it("does not append a second domain to an address that already has one", () => {
    expect(asEmail("someone@example.org")).toBe("someone@example.org");
    expect(asEmail("admin@blufys.pk")).toBe("admin@blufys.pk");
  });
});
