type RateLimitEntry = { count: number; resetAt: number };

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5_000) {
  const entries = new Map<string, RateLimitEntry>();

  return (key: string, now = Date.now()): number | null => {
    let entry = entries.get(key);
    if (entry && now >= entry.resetAt) {
      entries.delete(key);
      entry = undefined;
    }

    if (!entry) {
      if (entries.size >= maxKeys) {
        for (const [storedKey, storedEntry] of entries) {
          if (now >= storedEntry.resetAt) entries.delete(storedKey);
        }
      }
      if (entries.size >= maxKeys) return Math.max(1, Math.ceil(windowMs / 1000));
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return null;
    }

    if (entry.count >= limit) return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    entry.count += 1;
    return null;
  };
}
