import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitsDB } from '@/lib/db';
import { log } from '@/lib/logger';

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/habits/[id]/dismiss-graduation-nudge
 * Stamp nudge_dismissed_at so the graduation nudge hides for 30 days.
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
    const habit = await habitsDB.dismissGraduationNudge(id, authenticatedUserId);
    return NextResponse.json({ habit });
  } catch (error) {
    log.error('[habits] POST dismiss-graduation-nudge', error, { id, userId });
    return NextResponse.json({ error: 'Failed to dismiss nudge' }, { status: 500 });
  }
}
