import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * POST /api/habits/[id]/reactivate
 * Move a formed habit back to active. Resets current_streak, preserves best_streak.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.reactivateHabit(id, user.id);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    log.error('[habits] POST reactivate', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (message.includes('not formed')) {
      return NextResponse.json({ error: 'Habit is not formed' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to reactivate habit' }, { status: 500 });
  }
}
