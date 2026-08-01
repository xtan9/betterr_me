import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitsDB, HabitLogsDB, ProfilesDB } from '@/lib/db';
import { log } from '@/lib/logger';

// Cache TTL for HTTP headers (5 minutes in seconds)
const CACHE_MAX_AGE = 300;

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/habits/[id]/stats
 * Get detailed statistics for a habit including thisWeek, thisMonth, and allTime
 *
 * Caching:
 * - HTTP Cache-Control headers for client-side caching (private, 5 min)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: habitId } = await params;
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const habitsDB = new HabitsDB(supabase);
    const habitLogsDB = new HabitLogsDB(supabase);
    const profilesDB = new ProfilesDB(supabase);

    const habit = await habitsDB.getHabit(habitId, userId);
    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Monday is the explicit degraded presentation when Localization is unavailable.
    const weekStartDay = (await profilesDB.getWeekStartPreference(userId)) ?? 1;

    // Get detailed completion stats
    const detailedStats = await habitLogsDB.getDetailedHabitStats(
      habitId,
      userId,
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

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': `private, max-age=${CACHE_MAX_AGE}`,
      },
    });
  } catch (error) {
    log.error('GET /api/habits/[id]/stats error', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
