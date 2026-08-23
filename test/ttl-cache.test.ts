import { describe, expect, test } from "bun:test";
import { createTtlCache } from "../src/lib/ttl-cache";

describe("createTtlCache", () => {
  test("serves repeat reads from the cache inside the ttl", async () => {
    let loads = 0;
    let nowMs = 1000;
    const cache = createTtlCache<number>({
      ttlMs: 5000,
      now: () => nowMs,
      load: async () => {
        loads += 1;
        return loads * 10;
      },
    });
    expect(await cache.get()).toBe(10);
    nowMs += 4000;
    expect(await cache.get()).toBe(10);
    expect(loads).toBe(1);
  });

  test("reloads once the ttl has elapsed", async () => {
    let loads = 0;
    let nowMs = 1000;
    const cache = createTtlCache<number>({
      ttlMs: 5000,
      now: () => nowMs,
      load: async () => {
        loads += 1;
        return loads * 10;
      },
    });
    await cache.get();
    nowMs += 5001;
    expect(await cache.get()).toBe(20);
    expect(loads).toBe(2);
  });

  test("shares a single load between concurrent readers", async () => {
    let loads = 0;
    const gate = deferred<void>();
    const cache = createTtlCache<number>({
      ttlMs: 5000,
      load: async () => {
        loads += 1;
        await gate.promise;
        return 7;
      },
    });
    const first = cache.get();
    const second = cache.get();
    gate.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(7);
    expect(b).toBe(7);
    expect(loads).toBe(1);
  });

  test("does not cache failures and lets the next read retry", async () => {
    let loads = 0;
    const cache = createTtlCache<string>({
      ttlMs: 5000,
      load: async () => {
        loads += 1;
        if (loads === 1) {
          throw new Error("db down");
        }
        return "recovered";
      },
    });
    expect(cache.get()).rejects.toThrow("db down");
    await Promise.allSettled([cache.get()]);
    expect(await cache.get()).toBe("recovered");
    expect(loads).toBe(2);
  });

  test("invalidate() forces a fresh load inside the ttl", async () => {
    let loads = 0;
    const cache = createTtlCache<number>({
      ttlMs: 60_000,
      load: async () => {
        loads += 1;
        return loads;
      },
    });
    await cache.get();
    cache.invalidate();
    expect(await cache.get()).toBe(2);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
