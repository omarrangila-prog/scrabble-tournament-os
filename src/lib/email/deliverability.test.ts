import { describe, expect, it } from "vitest";

import { whatsappLink } from "./deliverability";

describe("whatsappLink", () => {
  it("converts a local Pakistani number to international form", () => {
    const link = whatsappLink("0300 1112233", "hello");
    expect(link).toContain("https://wa.me/923001112233");
  });

  it("leaves an already-international number alone", () => {
    expect(whatsappLink("+92 321 4567890", "hi")).toContain("wa.me/923214567890");
  });

  it("encodes the message so a certificate link survives", () => {
    const link = whatsappLink("03001112233", "See it at https://x.test/verify/AB-12?y=1");
    // A raw ? or & in the text would truncate the message or add a phantom parameter.
    expect(link).toContain("https%3A%2F%2Fx.test%2Fverify%2FAB-12%3Fy%3D1");
  });

  it("returns null when there is no usable number, so no dead control is offered", () => {
    expect(whatsappLink("", "hi")).toBeNull();
    expect(whatsappLink("12345", "hi")).toBeNull();
  });
});
