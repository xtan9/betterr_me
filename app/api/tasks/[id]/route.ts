import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { TasksDB, RecurringTasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { taskUpdateSchema } from '@/lib/validations/task';
import { editScopeSchema } from '@/lib/validations/recurring-task';
import { createTaskWrites } from '@/lib/tasks/writes';
import {
  createSupabaseOccurrenceAdapter,
  createSupabaseRecurringTaskLifecycle,
  isOccurrenceSuccess,
  occurrenceHttpFailure,
  toOccurrenceEditIntent,
} from '@/lib/recurring-tasks';
import type { TaskUpdateValues } from '@/lib/validations/task';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

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
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
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

      if (scopeResult.data === 'this') {
        const outcome = await createSupabaseOccurrenceAdapter(supabase).edit(
          toOccurrenceEditIntent({
            userId,
            taskId: id,
            ...toOccurrenceInput(validation.data),
            scope: 'this',
          }),
        );
        if (!isOccurrenceSuccess(outcome)) {
          const failure = occurrenceHttpFailure(outcome);
          return NextResponse.json(
            { error: failure.error },
            { status: failure.status },
          );
        }
        return NextResponse.json({ success: true });
      }

      const writes = createTaskWrites(supabase, {
        scopedUpdates: true,
        lifecycle: createSupabaseRecurringTaskLifecycle(supabase),
      });
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

    const outcome = await createSupabaseOccurrenceAdapter(supabase).edit(
      toOccurrenceEditIntent({
        userId,
        taskId: id,
        ...toOccurrenceInput(validation.data),
      }),
    );
    if (!isOccurrenceSuccess(outcome)) {
      const failure = occurrenceHttpFailure(outcome);
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }
    return NextResponse.json({ task: outcome.task });
  } catch (error: unknown) {
    log.error('PATCH /api/tasks/[id] error', error);
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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
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

      if (scopeResult.data === 'this') {
        const outcome = await createSupabaseOccurrenceAdapter(supabase).delete({
          taskId: id,
          userId,
          scope: 'this',
        });
        if (!isOccurrenceSuccess(outcome)) {
          const failure = occurrenceHttpFailure(outcome);
          return NextResponse.json(
            { error: failure.error },
            { status: failure.status },
          );
        }
        return NextResponse.json({ success: true });
      }

      const recurringTasksDB = new RecurringTasksDB(supabase, {
        lifecycle: createSupabaseRecurringTaskLifecycle(supabase),
      });
      await recurringTasksDB.deleteInstanceWithScope(id, userId, scopeResult.data);
      return NextResponse.json({ success: true });
    }

    const outcome = await createSupabaseOccurrenceAdapter(supabase).delete({
      taskId: id,
      userId,
      scope: 'this',
    });
    if (!isOccurrenceSuccess(outcome)) {
      const failure = occurrenceHttpFailure(outcome);
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}

function toOccurrenceInput(values: TaskUpdateValues) {
  return {
    title: values.title,
    description: values.description,
    priority: values.priority,
    categoryId: values.category_id,
    dueDate: values.due_date,
    dueTime: values.due_time,
    status: values.status,
    completed: values.is_completed,
    section: values.section,
    sortOrder: values.sort_order,
    projectId: values.project_id,
    completionDifficulty: values.completion_difficulty,
  };
}
