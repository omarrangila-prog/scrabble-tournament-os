import { describe, expect, it } from "vitest";

import { checkUrl, isPrivateAddress } from "./safeFetch";

describe("private addresses", () => {
  it.each([
    "127.0.0.1", "127.8.8.8", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
  ])("refuses %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "142.250.80.46", "100.63.0.1"])(
    "allows the public address %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(false),
  );

  it.each(["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1"])(
    "refuses the IPv6 address %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );

  it("allows a public IPv6 address", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("refuses something that is not an address", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("checkUrl", () => {
  it("accepts an ordinary public address", () => {
    expect(checkUrl("https://example.org/results/round2.html").ok).toBe(true);
    expect(checkUrl("http://example.org:8080/x").ok).toBe(true);
  });

  it.each([
    ["not a url", "web address"],
    ["ftp://example.org/x", "http and https"],
    ["file:///etc/passwd", "http and https"],
    ["javascript:alert(1)", "http and https"],
    ["https://user:pass@example.org/", "username or password"],
    ["https://example.org:22/", "port"],
    ["https://example.org:6379/", "port"],
    ["http://localhost/", "public internet"],
    ["http://admin.localhost/", "public internet"],
    ["http://db.internal/", "public internet"],
    ["http://printer.local/", "public internet"],
    ["http://127.0.0.1/", "public internet"],
    ["http://169.254.169.254/latest/meta-data/", "public internet"],
    ["http://[::1]/", "public internet"],
    ["http://10.1.2.3/", "public internet"],
  ])("refuses %s", (url, why) => {
    const result = checkUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(why);
  });
});
