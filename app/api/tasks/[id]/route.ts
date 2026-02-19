import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TasksDB, RecurringTasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { taskUpdateSchema } from '@/lib/validations/task';
import { editScopeSchema } from '@/lib/validations/recurring-task';
import { syncTaskUpdate } from '@/lib/tasks/sync';
import type { TaskUpdate } from '@/lib/db/types';

/**
 * GET /api/tasks/[id]
 * Get a single task by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tasksDB = new TasksDB(supabase);
    const task = await tasksDB.getTask(id, user.id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    log.error('GET /api/tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tasks/[id]
 * Update a task
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const searchParams = request.nextUrl.searchParams;
    const scopeParam = searchParams.get('scope');

    // Handle recurring task scope-based updates
    if (scopeParam) {
      const scopeResult = editScopeSchema.safeParse(scopeParam);
      if (!scopeResult.success) {
        return NextResponse.json(
          { error: 'Invalid scope. Must be: this, following, or all' },
          { status: 400 }
        );
      }

      // Validate body with taskUpdateSchema (same as non-scope path)
      const validation = validateRequestBody(body, taskUpdateSchema);
      if (!validation.success) return validation.response;

      const recurringTasksDB = new RecurringTasksDB(supabase);
      await recurringTasksDB.updateInstanceWithScope(id, user.id, scopeResult.data, validation.data);
      return NextResponse.json({ success: true });
    }

    // Validate with Zod schema
    const validation = validateRequestBody(body, taskUpdateSchema);
    if (!validation.success) return validation.response;

    // Build update object from validated data
    const updates: TaskUpdate = {};

    if (validation.data.title !== undefined) {
      updates.title = validation.data.title.trim();
    }

    if (validation.data.description !== undefined) {
      updates.description = validation.data.description?.trim() || null;
    }

    if (validation.data.intention !== undefined) {
      updates.intention = validation.data.intention?.trim() || null;
    }

    if (validation.data.is_completed !== undefined) {
      updates.is_completed = validation.data.is_completed;
    }

    if (validation.data.priority !== undefined) {
      updates.priority = validation.data.priority;
    }

    if (validation.data.due_date !== undefined) {
      updates.due_date = validation.data.due_date || null;
    }

    if (validation.data.due_time !== undefined) {
      updates.due_time = validation.data.due_time || null;
    }

    if (validation.data.completion_difficulty !== undefined) {
      updates.completion_difficulty = validation.data.completion_difficulty;
    }

    if (validation.data.status !== undefined) {
      updates.status = validation.data.status;
    }
    if (validation.data.section !== undefined) {
      updates.section = validation.data.section;
    }
    if (validation.data.sort_order !== undefined) {
      updates.sort_order = validation.data.sort_order;
    }

    // Apply sync to keep status/is_completed consistent
    const syncedUpdates = syncTaskUpdate(updates);
    const tasksDB = new TasksDB(supabase);
    const task = await tasksDB.updateTask(id, user.id, syncedUpdates);
    return NextResponse.json({ task });
  } catch (error: unknown) {
    log.error('PATCH /api/tasks/[id] error', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]
 * Delete a task
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scopeParam = searchParams.get('scope');

    // Handle recurring task scope-based deletes
    if (scopeParam) {
      const scopeResult = editScopeSchema.safeParse(scopeParam);
      if (!scopeResult.success) {
        return NextResponse.json(
          { error: 'Invalid scope. Must be: this, following, or all' },
          { status: 400 }
        );
      }

      const recurringTasksDB = new RecurringTasksDB(supabase);
      await recurringTasksDB.deleteInstanceWithScope(id, user.id, scopeResult.data);
      return NextResponse.json({ success: true });
    }

    const tasksDB = new TasksDB(supabase);
    await tasksDB.deleteTask(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
