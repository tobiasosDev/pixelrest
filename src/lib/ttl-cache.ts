export interface TtlCache<V> {
  get(): Promise<V>;
  invalidate(): void;
}

export function createTtlCache<V>(options: {
  ttlMs: number;
  load: () => Promise<V>;
  now?: () => number;
}): TtlCache<V> {
  const { ttlMs, load, now = Date.now } = options;
  let value: V | undefined;
  let loadedAt = -Infinity;
  let inFlight: Promise<V> | null = null;

  const read = (): Promise<V> => {
    if (inFlight) {
      return inFlight;
    }
    const fresh = now() - loadedAt < ttlMs && loadedAt !== -Infinity;
    if (fresh && value !== undefined) {
      return Promise.resolve(value);
    }
    inFlight = load()
      .then((next) => {
        value = next;
        loadedAt = now();
        return next;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return {
    get: read,
    invalidate: () => {
      if (inFlight) {
        return;
      }
      loadedAt = -Infinity;
      value = undefined;
    },
  };
}
