import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RecurringTasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { recurringTaskUpdateSchema } from '@/lib/validations/recurring-task';
import { getLocalDateString } from '@/lib/utils';

/**
 * GET /api/recurring-tasks/[id]
 * Get a single recurring task template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recurringTasksDB = new RecurringTasksDB(supabase);
    const template = await recurringTasksDB.getRecurringTask(id, user.id);

    if (!template) {
      return NextResponse.json({ error: 'Recurring task not found' }, { status: 404 });
    }

    return NextResponse.json({ recurring_task: template });
  } catch (error) {
    log.error('GET /api/recurring-tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to fetch recurring task' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/recurring-tasks/[id]
 * Update a recurring task template
 *
 * Query params:
 * - action: 'pause' | 'resume' (quick actions)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const recurringTasksDB = new RecurringTasksDB(supabase);

    // Handle quick actions
    if (action === 'pause') {
      const template = await recurringTasksDB.pauseRecurringTask(id, user.id);
      return NextResponse.json({ recurring_task: template });
    }
    if (action === 'resume') {
      const today = searchParams.get('date') || getLocalDateString();
      const [y, m, d] = today.split('-').map(Number);
      const throughDate = getLocalDateString(new Date(y, m - 1, d + 7));
      const template = await recurringTasksDB.resumeRecurringTask(id, user.id, today, throughDate);
      return NextResponse.json({ recurring_task: template });
    }
    if (action) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: pause or resume' },
        { status: 400 }
      );
    }

    // Handle general updates
    const body = await request.json();
    const validation = validateRequestBody(body, recurringTaskUpdateSchema);
    if (!validation.success) return validation.response;

    const template = await recurringTasksDB.updateRecurringTask(id, user.id, validation.data);
    return NextResponse.json({ recurring_task: template });
  } catch (error: unknown) {
    log.error('PATCH /api/recurring-tasks/[id] error', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Recurring task not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to update recurring task' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/recurring-tasks/[id]
 * Delete a recurring task template and its future incomplete instances
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recurringTasksDB = new RecurringTasksDB(supabase);
    await recurringTasksDB.deleteRecurringTask(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/recurring-tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete recurring task' },
      { status: 500 }
    );
  }
}
