import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  USER_API_WRITE_POLICY,
} from '@/lib/auth/authenticated-request';
import { log } from '@/lib/logger';
import { createTaskWrites } from '@/lib/tasks/writes';

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
    const auth = await authenticateRequest(request, USER_API_WRITE_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const outcome = await createTaskWrites(supabase).execute({
      type: 'toggle-completion',
      taskId: id,
      userId,
    });
    return NextResponse.json({ task: outcome.task });
  } catch (error: unknown) {
    log.error('PATCH /api/tasks/[id]/toggle error', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to toggle task completion' },
      { status: 500 }
    );
  }
}
