import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB, HabitNotFoundError, HabitAlreadyFormedError } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * POST /api/habits/[id]/graduate
 * Mark a habit as formed. Snapshots current_streak into graduated_streak.
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
    const habit = await habitsDB.graduateHabit(id, user.id);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    log.error('[habits] POST graduate', error, { id, userId });
    if (error instanceof HabitNotFoundError) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (error instanceof HabitAlreadyFormedError) {
      return NextResponse.json({ error: 'Habit is already formed' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to graduate habit' }, { status: 500 });
  }
}
