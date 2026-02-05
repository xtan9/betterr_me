/**
 * Simple in-memory cache with TTL support
 *
 * Note: This cache is per-instance and will be cleared on server restart.
 * For serverless environments, each cold start will have an empty cache.
 * This is acceptable for short-lived caches as a performance optimization.
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class TTLCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTTL: number;

  /**
   * Create a new TTL cache
   * @param defaultTTL Default time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(defaultTTL: number = 5 * 60 * 1000) {
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param data Data to cache
   * @param ttl Optional TTL in milliseconds (uses default if not provided)
   */
  set(key: string, data: T, ttl?: number): void {
    const expiry = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(key, { data, expiry });
  }

  /**
   * Delete a specific key from the cache
   * @param key Cache key to delete
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a prefix
   * @param prefix Key prefix to match
   * @returns Number of keys deleted
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Check if a key exists and is not expired
   * @param key Cache key
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache (including expired)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   * @returns Number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
}

// Stats cache with 5-minute TTL
export const statsCache = new TTLCache<{
  habitId: string;
  currentStreak: number;
  bestStreak: number;
  thisWeek: { completed: number; total: number; percent: number };
  thisMonth: { completed: number; total: number; percent: number };
  allTime: { completed: number; total: number; percent: number };
}>(5 * 60 * 1000);

/**
 * Generate cache key for stats
 * @param habitId Habit ID
 * @param userId User ID
 */
export function getStatsCacheKey(habitId: string, userId: string): string {
  return `stats:${userId}:${habitId}`;
}

/**
 * Invalidate stats cache for a specific habit
 * @param habitId Habit ID
 * @param userId User ID
 */
export function invalidateStatsCache(habitId: string, userId: string): void {
  const key = getStatsCacheKey(habitId, userId);
  statsCache.delete(key);
}

/**
 * Invalidate all stats cache entries for a user
 * @param userId User ID
 */
export function invalidateUserStatsCache(userId: string): void {
  statsCache.deleteByPrefix(`stats:${userId}:`);
}

export { TTLCache };
