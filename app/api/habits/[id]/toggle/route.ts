import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitLogsDB, HabitMilestonesDB } from '@/lib/db';
import { getLocalDateString } from '@/lib/utils';
import { log } from '@/lib/logger';
import { isMilestoneStreak } from '@/lib/habits/milestones';

/**
 * POST /api/habits/[id]/toggle
 * Toggle habit completion for a specific date
 *
 * Request body:
 * - date: string (YYYY-MM-DD) - defaults to today
 *
 * Response:
 * - log: HabitLog
 * - currentStreak: number
 * - bestStreak: number
 */
export async function POST(
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

    // Get date from body (defaults to today)
    const body = await request.json().catch(() => ({}));
    const date = body.date || getLocalDateString();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Toggle the log
    const habitLogsDB = new HabitLogsDB(supabase);
    const result = await habitLogsDB.toggleLog(habitId, user.id, date);

    // Record milestone if streak hits a threshold (best-effort, non-fatal)
    if (result.log.completed && isMilestoneStreak(result.currentStreak)) {
      try {
        const milestonesDB = new HabitMilestonesDB(supabase);
        await milestonesDB.recordMilestone(habitId, user.id, result.currentStreak);
      } catch (err) {
        log.error('Milestone check failed', err, { habitId });
      }
    }

    return NextResponse.json({
      log: result.log,
      currentStreak: result.currentStreak,
      bestStreak: result.bestStreak,
      completed: result.log.completed,
    });
  } catch (error: unknown) {
    log.error('POST /api/habits/[id]/toggle error', error);

    const message = error instanceof Error ? error.message : String(error);

    if (message === 'EDIT_WINDOW_EXCEEDED') {
      return NextResponse.json(
        { error: 'Cannot edit logs older than 7 days' },
        { status: 403 }
      );
    }

    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to toggle habit' }, { status: 500 });
  }
}
