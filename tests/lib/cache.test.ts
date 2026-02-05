import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TTLCache,
  statsCache,
  getStatsCacheKey,
  invalidateStatsCache,
  invalidateUserStatsCache,
} from '@/lib/cache';

describe('TTLCache', () => {
  let cache: TTLCache<string>;

  beforeEach(() => {
    cache = new TTLCache<string>(1000); // 1 second TTL
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should allow custom TTL per entry', () => {
      cache.set('short', 'value', 500); // 500ms TTL
      cache.set('long', 'value', 2000); // 2s TTL

      vi.advanceTimersByTime(600);

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value');
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired keys', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(1001);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a specific key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should return false for non-existent keys', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('deleteByPrefix', () => {
    it('should delete all keys matching prefix', () => {
      cache.set('user:1:profile', 'profile1');
      cache.set('user:1:settings', 'settings1');
      cache.set('user:2:profile', 'profile2');

      const deleted = cache.deleteByPrefix('user:1:');

      expect(deleted).toBe(2);
      expect(cache.get('user:1:profile')).toBeUndefined();
      expect(cache.get('user:1:settings')).toBeUndefined();
      expect(cache.get('user:2:profile')).toBe('profile2');
    });

    it('should return 0 when no keys match', () => {
      cache.set('key1', 'value1');
      expect(cache.deleteByPrefix('nonexistent:')).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      cache.set('key1', 'value1', 500);
      cache.set('key2', 'value2', 2000);

      vi.advanceTimersByTime(600);

      const removed = cache.cleanup();

      expect(removed).toBe(1);
      expect(cache.size).toBe(1);
    });
  });
});

describe('statsCache helpers', () => {
  beforeEach(() => {
    statsCache.clear();
  });

  describe('getStatsCacheKey', () => {
    it('should generate correct cache key format', () => {
      const key = getStatsCacheKey('habit-123', 'user-456');
      expect(key).toBe('stats:user-456:habit-123');
    });
  });

  describe('invalidateStatsCache', () => {
    it('should delete specific habit stats from cache', () => {
      const stats = {
        habitId: 'habit-123',
        currentStreak: 5,
        bestStreak: 10,
        thisWeek: { completed: 3, total: 7, percent: 43 },
        thisMonth: { completed: 15, total: 30, percent: 50 },
        allTime: { completed: 100, total: 200, percent: 50 },
      };

      statsCache.set(getStatsCacheKey('habit-123', 'user-456'), stats);
      expect(statsCache.has(getStatsCacheKey('habit-123', 'user-456'))).toBe(true);

      invalidateStatsCache('habit-123', 'user-456');

      expect(statsCache.has(getStatsCacheKey('habit-123', 'user-456'))).toBe(false);
    });
  });

  describe('invalidateUserStatsCache', () => {
    it('should delete all stats for a user', () => {
      const stats = {
        habitId: 'habit-1',
        currentStreak: 5,
        bestStreak: 10,
        thisWeek: { completed: 3, total: 7, percent: 43 },
        thisMonth: { completed: 15, total: 30, percent: 50 },
        allTime: { completed: 100, total: 200, percent: 50 },
      };

      statsCache.set(getStatsCacheKey('habit-1', 'user-456'), { ...stats, habitId: 'habit-1' });
      statsCache.set(getStatsCacheKey('habit-2', 'user-456'), { ...stats, habitId: 'habit-2' });
      statsCache.set(getStatsCacheKey('habit-1', 'user-789'), { ...stats, habitId: 'habit-1' });

      invalidateUserStatsCache('user-456');

      expect(statsCache.has(getStatsCacheKey('habit-1', 'user-456'))).toBe(false);
      expect(statsCache.has(getStatsCacheKey('habit-2', 'user-456'))).toBe(false);
      expect(statsCache.has(getStatsCacheKey('habit-1', 'user-789'))).toBe(true);
    });
  });
});
