import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB, HabitLogsDB, ProfilesDB } from '@/lib/db';
import { statsCache, getStatsCacheKey } from '@/lib/cache';

// Cache TTL for HTTP headers (5 minutes in seconds)
const CACHE_MAX_AGE = 300;

/**
 * GET /api/habits/[id]/stats
 * Get detailed statistics for a habit including thisWeek, thisMonth, and allTime
 *
 * Caching:
 * - HTTP Cache-Control headers for client-side caching (private, 5 min)
 * - Server-side in-memory cache (5 min TTL)
 * - Cache is invalidated on: habit toggle, habit update/delete, week_start_day change
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: habitId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const habitsDB = new HabitsDB(supabase);
    const habitLogsDB = new HabitLogsDB(supabase);
    const profilesDB = new ProfilesDB(supabase);

    // Get habit (always verify it exists, even for cache hits)
    const habit = await habitsDB.getHabit(habitId, user.id);
    if (!habit) {
      // Clean up any stale cache entry for this habit
      statsCache.delete(getStatsCacheKey(habitId, user.id));
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Check server-side cache
    const cacheKey = getStatsCacheKey(habitId, user.id);
    const cachedStats = statsCache.get(cacheKey);

    if (cachedStats) {
      return NextResponse.json(cachedStats, {
        headers: {
          'Cache-Control': `private, max-age=${CACHE_MAX_AGE}`,
          'X-Cache': 'HIT',
        },
      });
    }

    // Get user's week start day preference (default to Sunday = 0)
    const profile = await profilesDB.getProfile(user.id);
    const weekStartDay = profile?.preferences?.week_start_day ?? 0;

    // Get detailed completion stats
    const detailedStats = await habitLogsDB.getDetailedHabitStats(
      habitId,
      user.id,
      habit.frequency,
      habit.created_at,
      weekStartDay
    );

    const responseData = {
      habitId,
      currentStreak: habit.current_streak,
      bestStreak: habit.best_streak,
      ...detailedStats,
    };

    // Store in server-side cache
    statsCache.set(cacheKey, responseData);

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': `private, max-age=${CACHE_MAX_AGE}`,
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('GET /api/habits/[id]/stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
