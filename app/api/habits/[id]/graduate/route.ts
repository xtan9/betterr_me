import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * POST /api/habits/[id]/graduate
 * Mark a habit as formed. Snapshots current_streak into graduated_streak.
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
    const habit = await habitsDB.graduateHabit(id, user.id);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    log.error('[habits] POST graduate', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to graduate habit' }, { status: 500 });
  }
}
