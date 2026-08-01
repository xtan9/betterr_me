import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitsDB, HabitNotFoundError, HabitNotFormedError } from '@/lib/db';
import { log } from '@/lib/logger';

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/habits/[id]/reactivate
 * Move a formed habit back to active. Resets current_streak, preserves best_streak.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  let userId: string | undefined;
  try {
    ({ id } = await params);
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId: authenticatedUserId }, client: supabase } = auth;
    userId = authenticatedUserId;

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.reactivateHabit(id, authenticatedUserId);
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
