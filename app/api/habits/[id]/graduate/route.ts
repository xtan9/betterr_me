import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitsDB, HabitNotFoundError, HabitAlreadyFormedError } from '@/lib/db';
import { log } from '@/lib/logger';

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/habits/[id]/graduate
 * Mark a habit as formed. Snapshots current_streak into graduated_streak.
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
    const habit = await habitsDB.graduateHabit(id, authenticatedUserId);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    if (error instanceof HabitNotFoundError) {
      log.info('[habits] graduate: not found', { id, userId });
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (error instanceof HabitAlreadyFormedError) {
      log.info('[habits] graduate: already formed', { id, userId });
      return NextResponse.json({ error: 'Habit is already formed' }, { status: 400 });
    }
    log.error('[habits] POST graduate', error, { id, userId });
    return NextResponse.json({ error: 'Failed to graduate habit' }, { status: 500 });
  }
}
