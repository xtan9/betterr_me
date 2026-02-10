import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TasksDB } from '@/lib/db';
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
    console.error('GET /api/tasks/[id] error:', error);
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

    const tasksDB = new TasksDB(supabase);
    const body = await request.json();

    // Build update object
    const updates: TaskUpdate = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json(
          { error: 'Title cannot be empty' },
          { status: 400 }
        );
      }
      updates.title = body.title.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description?.trim() || null;
    }

    if (body.is_completed !== undefined) {
      updates.is_completed = Boolean(body.is_completed);
      // Set completed_at timestamp
      updates.completed_at = body.is_completed ? new Date().toISOString() : null;
    }

    if (body.priority !== undefined) {
      const priority = parseInt(body.priority);
      if (isNaN(priority) || priority < 0 || priority > 3) {
        return NextResponse.json(
          { error: 'Priority must be 0-3' },
          { status: 400 }
        );
      }
      updates.priority = priority as 0 | 1 | 2 | 3;
    }

    if (body.due_date !== undefined) {
      updates.due_date = body.due_date || null;
    }

    if (body.due_time !== undefined) {
      updates.due_time = body.due_time || null;
    }

    if (body.completion_difficulty !== undefined) {
      const diff = body.completion_difficulty;
      if (diff !== null && (diff < 1 || diff > 3)) {
        return NextResponse.json(
          { error: 'completion_difficulty must be 1, 2, 3, or null' },
          { status: 400 }
        );
      }
      updates.completion_difficulty = diff;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    const task = await tasksDB.updateTask(id, user.id, updates);
    return NextResponse.json({ task });
  } catch (error: unknown) {
    console.error('PATCH /api/tasks/[id] error:', error);

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

    const tasksDB = new TasksDB(supabase);
    await tasksDB.deleteTask(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
