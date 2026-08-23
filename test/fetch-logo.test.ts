import { describe, expect, test } from "bun:test";
import { isBlockedHost } from "../src/fetch-logo";

describe("blocked hosts", () => {
  test("blocks localhost and private IPv4 literals", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("10.0.0.5")).toBe(true);
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
    expect(isBlockedHost("192.168.1.1")).toBe(true);
    expect(isBlockedHost("100.100.1.1")).toBe(true);
    expect(isBlockedHost("0.1.2.3")).toBe(true);
  });

  test("blocks IPv4-mapped and embedded IPv6 forms", () => {
    expect(isBlockedHost("[::ffff:127.0.0.1]")).toBe(true);
    expect(isBlockedHost("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedHost("[::ffff:169.254.169.254]")).toBe(true);
    expect(isBlockedHost("[::ffff:a00:1]")).toBe(true);
    expect(isBlockedHost("[64:ff9b::a00:1]")).toBe(true);
    expect(isBlockedHost("[2002:a00:1::]")).toBe(true);
  });

  test("blocks loopback, link-local, ULA, multicast, and unspecified IPv6", () => {
    expect(isBlockedHost("::1")).toBe(true);
    expect(isBlockedHost("[::1]")).toBe(true);
    expect(isBlockedHost("::")).toBe(true);
    expect(isBlockedHost("[fe80::1]")).toBe(true);
    expect(isBlockedHost("[fc00::1]")).toBe(true);
    expect(isBlockedHost("[fd12:3456::1]")).toBe(true);
    expect(isBlockedHost("[ff02::1]")).toBe(true);
  });

  test("blocks .local and .localhost subdomains", () => {
    expect(isBlockedHost("foo.local")).toBe(true);
    expect(isBlockedHost("api.localhost")).toBe(true);
  });

  test("allows public addresses", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false);
    expect(isBlockedHost("[2606:4700::6810:85e5]")).toBe(false);
    expect(isBlockedHost("[2620:fe::fe]")).toBe(false);
  });

  test("fails closed on malformed numeric or IPv6 input", () => {
    expect(isBlockedHost("999.1.2.3")).toBe(true);
    expect(isBlockedHost("1.2.3.4.5")).toBe(true);
    expect(isBlockedHost("[gggg::1]")).toBe(true);
    expect(isBlockedHost("1.2.3")).toBe(true);
  });
});
