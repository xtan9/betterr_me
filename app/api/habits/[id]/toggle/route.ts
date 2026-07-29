import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLocalDateString } from '@/lib/utils';
import { log } from '@/lib/logger';
import { createHabitCompletion } from '@/lib/habits/completion';
import { habitCompletionSchema } from '@/lib/validations/habit';

/**
 * POST /api/habits/[id]/toggle
 * Toggle habit completion for a specific date
 *
 * Request body:
 * - date: string (YYYY-MM-DD) - defaults to today
 * - completed: boolean - desired completion state
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
    const parsedBody = habitCompletionSchema.safeParse(
      await request.json().catch(() => ({}))
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { completed } = parsedBody.data;
    const date = parsedBody.data.date || getLocalDateString();

    const completion = createHabitCompletion(supabase);
    const intent = { habitId, userId: user.id, date };
    const result = completed
      ? await completion.complete(intent)
      : await completion.uncomplete(intent);

    return NextResponse.json({
      log: result.log,
      currentStreak: result.currentStreak,
      bestStreak: result.bestStreak,
      completed: result.completed,
      milestone: result.milestone,
    });
  } catch (error: unknown) {
    log.error('POST /api/habits/[id]/toggle error', error);

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to toggle habit' }, { status: 500 });
  }
}
