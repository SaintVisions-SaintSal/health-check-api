/**
 * @file cache.ts
 * @description Generic in-memory TTL cache with a single-entry optimisation
 * for health check result caching. Thread-safe for single-threaded Node.js.
 */

/** A single cached entry with its expiry timestamp */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Generic in-memory TTL cache.
 *
 * Stores arbitrary values keyed by string. Entries expire after a
 * configurable TTL. Stale entries are evicted lazily on read.
 *
 * @template T The type of values stored in the cache.
 *
 * @example
 * const cache = new TtlCache<HealthResult>(10_000);
 * cache.set('health', result);
 * const cached = cache.get('health'); // null if expired
 */
export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  /**
   * @param ttlMs - Time-to-live in milliseconds for all entries.
   */
  constructor(ttlMs: number) {
    if (ttlMs <= 0) {
      throw new RangeError(`ttlMs must be a positive number, got ${ttlMs}`);
    }
    this.ttlMs = ttlMs;
  }

  /**
   * Retrieves a cached value by key.
   *
   * Returns `null` if the key does not exist or the entry has expired.
   * Expired entries are evicted on access.
   *
   * @param key - Cache key.
   * @returns The cached value, or `null` if absent or stale.
   */
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Stores a value under the given key with the cache TTL.
   *
   * Overwrites any existing entry for the same key.
   *
   * @param key - Cache key.
   * @param value - Value to store.
   */
  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Removes a specific entry from the cache.
   *
   * @param key - Cache key to invalidate.
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Removes all entries from the cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Returns the number of entries currently held (including possibly stale ones).
   * Primarily useful for testing.
   */
  get size(): number {
    return this.store.size;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton used by the health service
// ---------------------------------------------------------------------------

const HEALTH_CACHE_TTL_MS_DEFAULT = 10_000;

/**
 * Parses `HEALTH_CACHE_TTL_MS` from environment variables.
 * Falls back to 10 000 ms if unset or invalid.
 *
 * @returns TTL in milliseconds.
 */
function resolveHealthCacheTtl(): number {
  const raw = process.env['HEALTH_CACHE_TTL_MS'];
  if (!raw) return HEALTH_CACHE_TTL_MS_DEFAULT;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : HEALTH_CACHE_TTL_MS_DEFAULT;
}

/**
 * Singleton `TtlCache` instance for health check results.
 * TTL is read once at module load from `HEALTH_CACHE_TTL_MS`.
 */
export const healthCache = new TtlCache<unknown>(resolveHealthCacheTtl());
