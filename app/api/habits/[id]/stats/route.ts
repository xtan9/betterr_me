import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB, HabitLogsDB, ProfilesDB } from '@/lib/db';

/**
 * GET /api/habits/[id]/stats
 * Get detailed statistics for a habit including thisWeek, thisMonth, and allTime
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

    // Get habit
    const habit = await habitsDB.getHabit(habitId, user.id);
    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
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

    return NextResponse.json({
      habitId,
      currentStreak: habit.current_streak,
      bestStreak: habit.best_streak,
      ...detailedStats,
    });
  } catch (error) {
    console.error('GET /api/habits/[id]/stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
