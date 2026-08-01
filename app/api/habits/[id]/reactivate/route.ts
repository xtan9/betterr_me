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
 * POST /api/habits/[id]/reactivate
 * Move a formed habit back to active through the shared habit mutation seam.
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

    const outcome = await createHabitWrites(supabase).reactivate({
      habitId: id,
      userId: authenticatedUserId,
    });
    if (outcome.type === 'not-found') {
      log.info('[habits] reactivate: not found', { id, userId });
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (outcome.type === 'already-active') {
      log.info('[habits] reactivate: already active', { id, userId });
      return NextResponse.json({ error: 'Habit is not formed' }, { status: 400 });
    }
    if (outcome.type === 'invalid-transition') {
      return NextResponse.json(
        { error: 'Habit is not formed' },
        { status: 400 },
      );
    }
    return NextResponse.json({ habit: toHabitResponse(outcome.habit) });
  } catch (error: unknown) {
    log.error('[habits] POST reactivate', error, { id, userId });
    return NextResponse.json({ error: 'Failed to reactivate habit' }, { status: 500 });
  }
}
