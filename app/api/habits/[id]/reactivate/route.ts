import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB, HabitNotFoundError, HabitNotFormedError } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * POST /api/habits/[id]/reactivate
 * Move a formed habit back to active. Resets current_streak, preserves best_streak.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  let userId: string | undefined;
  try {
    ({ id } = await params);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    userId = user.id;

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.reactivateHabit(id, user.id);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    if (error instanceof HabitNotFoundError) {
      log.info('[habits] reactivate: not found', { id, userId });
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (error instanceof HabitNotFormedError) {
      log.info('[habits] reactivate: not formed', { id, userId });
      return NextResponse.json({ error: 'Habit is not formed' }, { status: 400 });
    }
    log.error('[habits] POST reactivate', error, { id, userId });
    return NextResponse.json({ error: 'Failed to reactivate habit' }, { status: 500 });
  }
}
