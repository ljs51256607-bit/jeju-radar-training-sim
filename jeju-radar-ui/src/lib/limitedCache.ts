export function setLimitedCache<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);

  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}
