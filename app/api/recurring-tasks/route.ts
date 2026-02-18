import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RecurringTasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { recurringTaskCreateSchema } from '@/lib/validations/recurring-task';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { getLocalDateString } from '@/lib/utils';
import type { RecurringTaskInsert } from '@/lib/db/types';

/**
 * GET /api/recurring-tasks
 * List recurring task templates for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as 'active' | 'paused' | 'archived' | null;

    const recurringTasksDB = new RecurringTasksDB(supabase);
    const templates = await recurringTasksDB.getUserRecurringTasks(
      user.id,
      status ? { status } : undefined
    );

    return NextResponse.json({ recurring_tasks: templates });
  } catch (error) {
    log.error('GET /api/recurring-tasks error', error);
    return NextResponse.json(
      { error: 'Failed to fetch recurring tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recurring-tasks
 * Create a new recurring task template and generate initial instances
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, recurringTaskCreateSchema);
    if (!validation.success) return validation.response;

    await ensureProfile(supabase, user);

    // Calculate throughDate (7 days from today)
    const today = body.date || getLocalDateString();
    const [y, m, d] = today.split('-').map(Number);
    const throughDate = new Date(y, m - 1, d + 7);
    const throughDateStr = getLocalDateString(throughDate);

    const recurringTasksDB = new RecurringTasksDB(supabase);
    const data: RecurringTaskInsert = {
      user_id: user.id,
      title: validation.data.title.trim(),
      description: validation.data.description?.trim() || null,
      intention: validation.data.intention?.trim() || null,
      priority: validation.data.priority ?? 0,
      category: validation.data.category || null,
      due_time: validation.data.due_time || null,
      recurrence_rule: validation.data.recurrence_rule,
      start_date: validation.data.start_date,
      end_type: validation.data.end_type ?? 'never',
      end_date: validation.data.end_date || null,
      end_count: validation.data.end_count || null,
      status: 'active',
    };

    const template = await recurringTasksDB.createRecurringTask(data, throughDateStr);
    return NextResponse.json({ recurring_task: template }, { status: 201 });
  } catch (error) {
    log.error('POST /api/recurring-tasks error', error);
    return NextResponse.json(
      { error: 'Failed to create recurring task' },
      { status: 500 }
    );
  }
}
