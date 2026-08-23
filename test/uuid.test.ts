import { describe, expect, test } from "bun:test";
import { fallbackUuid, randomUuid } from "../src/lib/uuid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("randomUuid", () => {
  test("produces a valid uuid v4", () => {
    const value = randomUuid();
    expect(UUID_RE.test(value)).toBe(true);
    expect(value[14]).toBe("4");
  });

  test("fallback works without crypto.randomUUID and stays unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const value = fallbackUuid();
      expect(UUID_RE.test(value)).toBe(true);
      expect(value[14]).toBe("4");
      expect(["8", "9", "a", "b"]).toContain(value[19]);
      seen.add(value);
    }
    expect(seen.size).toBe(200);
  });
});
