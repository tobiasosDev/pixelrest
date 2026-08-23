import { describe, expect, test } from "bun:test";
import { withRetry } from "../src/lib/with-retry";

describe("withRetry", () => {
  test("returns the first success without extra calls", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        return "ok";
      },
      3,
      1,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries until the call succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("flaky");
        }
        return "saved";
      },
      3,
      1,
    );
    expect(result).toBe("saved");
    expect(calls).toBe(3);
  });

  test("throws the last error after exhausting the attempts", async () => {
    let calls = 0;
    try {
      await withRetry(
        async () => {
          calls += 1;
          throw new Error(`boom ${calls}`);
        },
        3,
        1,
      );
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toBe("boom 3");
    }
    expect(calls).toBe(3);
  });
});
