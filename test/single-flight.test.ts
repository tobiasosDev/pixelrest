import { describe, expect, test } from "bun:test";
import { singleFlight } from "../src/lib/single-flight";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  test("shares one in-flight call between concurrent same-key callers", async () => {
    let calls = 0;
    const gate = deferred<string>();
    const run = singleFlight(async (_key: string) => {
      calls += 1;
      return gate.promise;
    });
    const first = run("a");
    const second = run("a");
    gate.resolve("done");
    expect(await first).toBe("done");
    expect(await second).toBe("done");
    expect(calls).toBe(1);
  });

  test("runs separately for different keys", async () => {
    const calls: string[] = [];
    const run = singleFlight(async (key: string) => {
      calls.push(key);
      return key;
    });
    await Promise.all([run("a"), run("b")]);
    expect(calls.sort()).toEqual(["a", "b"]);
  });

  test("starts a fresh call after the previous one finished", async () => {
    let calls = 0;
    const run = singleFlight(async (_key: string) => {
      calls += 1;
      return calls;
    });
    await run("a");
    const again = await run("a");
    expect(again).toBe(2);
  });

  test("propagates the failure to every joined caller and allows a retry", async () => {
    let attempts = 0;
    const gate = deferred<number>();
    const run = singleFlight(async (_key: string) => {
      attempts += 1;
      if (attempts === 1) {
        return gate.promise;
      }
      return attempts;
    });
    const first = run("k");
    const second = run("k");
    gate.reject(new Error("refresh failed"));
    expect(first).rejects.toThrow("refresh failed");
    expect(second).rejects.toThrow("refresh failed");
    await Promise.allSettled([first, second]);
    expect(await run("k")).toBe(2);
  });
});
