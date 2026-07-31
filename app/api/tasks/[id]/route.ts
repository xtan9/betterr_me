import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  USER_API_READ_POLICY,
  USER_API_WRITE_POLICY,
} from '@/lib/auth/authenticated-request';
import { TasksDB, RecurringTasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { taskUpdateSchema } from '@/lib/validations/task';
import { editScopeSchema } from '@/lib/validations/recurring-task';
import { createTaskWrites } from '@/lib/tasks/writes';

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
    const auth = await authenticateRequest(request, USER_API_READ_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const tasksDB = new TasksDB(supabase);
    const task = await tasksDB.getTask(id, userId);

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
    const auth = await authenticateRequest(request, USER_API_WRITE_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

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

      const writes = createTaskWrites(supabase, { scopedUpdates: true });
      await writes.execute({
        type: 'update',
        taskId: id,
        userId,
        scope: scopeResult.data,
        values: validation.data,
      });
      return NextResponse.json({ success: true });
    }

    // Validate with Zod schema
    const validation = validateRequestBody(body, taskUpdateSchema);
    if (!validation.success) return validation.response;

    const writes = createTaskWrites(supabase);
    const outcome = validation.data.sort_order !== undefined
      && Object.keys(validation.data).length === 1
      ? await writes.execute({
        type: 'order',
        taskId: id,
        userId,
        sortOrder: validation.data.sort_order,
      })
      : await writes.execute({
        type: 'update',
        taskId: id,
        userId,
        values: validation.data,
      });
    return NextResponse.json({ task: outcome.task });
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
    const auth = await authenticateRequest(request, USER_API_WRITE_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

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
      await recurringTasksDB.deleteInstanceWithScope(id, userId, scopeResult.data);
      return NextResponse.json({ success: true });
    }

    const tasksDB = new TasksDB(supabase);
    await tasksDB.deleteTask(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
