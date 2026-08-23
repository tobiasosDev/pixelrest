export function singleFlight<K, V>(
  fn: (key: K) => Promise<V>,
): (key: K) => Promise<V> {
  const inFlight = new Map<K, Promise<V>>();
  return (key: K) => {
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }
    const attempt = fn(key).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, attempt);
    return attempt;
  };
}
