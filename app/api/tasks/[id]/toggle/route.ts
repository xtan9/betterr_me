import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { log } from '@/lib/logger';
import {
  createSupabaseLegacyTaskToggle,
  isTaskCommandSuccess,
  operationIdFromRequest,
  taskCommandHttpFailure,
} from '@/lib/tasks/commands';

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/tasks/[id]/toggle
 * Toggle task completion status
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const outcome = await createSupabaseLegacyTaskToggle(supabase).execute({
      taskId: id,
      userId,
      operationId: operationIdFromRequest(request),
    });
    if (!isTaskCommandSuccess(outcome)) {
      const failure = taskCommandHttpFailure(outcome);
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }
    return NextResponse.json({ task: outcome.task });
  } catch (error: unknown) {
    log.error('PATCH /api/tasks/[id]/toggle error', error);
    return NextResponse.json(
      { error: 'Failed to toggle task completion' },
      { status: 500 }
    );
  }
}
