import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { habitsDB, habitLogsDB } from '@/lib/db';

/**
 * GET /api/habits/[id]/stats
 * Get statistics for a habit
 *
 * Query parameters:
 * - days: number - period to calculate stats for (default: 30)
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

    // Get habit
    const habit = await habitsDB.getHabit(habitId, user.id);
    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Days must be between 1 and 365' },
        { status: 400 }
      );
    }

    // Get completion stats
    const stats = await habitLogsDB.getHabitStats(habitId, user.id, days);

    return NextResponse.json({
      habitId,
      period: days,
      currentStreak: habit.current_streak,
      bestStreak: habit.best_streak,
      ...stats,
    });
  } catch (error) {
    console.error('GET /api/habits/[id]/stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
