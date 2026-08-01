import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { createHabitWrites, toHabitResponse } from '@/lib/habits/writes';
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

    const outcome = await createHabitWrites(supabase).graduate({
      habitId: id,
      userId: authenticatedUserId,
    });
    if (outcome.type === 'not-found') {
      log.info('[habits] graduate: not found', { id, userId });
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (outcome.type === 'already-formed') {
      log.info('[habits] graduate: already formed', { id, userId });
      return NextResponse.json({ error: 'Habit is already formed' }, { status: 400 });
    }
    if (outcome.type === 'invalid-transition') {
      return NextResponse.json(
        { error: outcome.message },
        { status: 409 },
      );
    }
    return NextResponse.json({ habit: toHabitResponse(outcome.habit) });
  } catch (error: unknown) {
    log.error('[habits] POST graduate', error, { id, userId });
    return NextResponse.json({ error: 'Failed to graduate habit' }, { status: 500 });
  }
}
