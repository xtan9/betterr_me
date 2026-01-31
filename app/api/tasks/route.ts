import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { tasksDB } from '@/lib/db';
import type { TaskInsert, TaskFilters } from '@/lib/db/types';

/**
 * GET /api/tasks
 * Get all tasks for the authenticated user with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const filters: TaskFilters = {};

    if (searchParams.has('is_completed')) {
      filters.is_completed = searchParams.get('is_completed') === 'true';
    }
    if (searchParams.has('priority')) {
      const priority = parseInt(searchParams.get('priority')!);
      if (priority >= 0 && priority <= 3) {
        filters.priority = priority as 0 | 1 | 2 | 3;
      }
    }
    if (searchParams.has('due_date')) {
      filters.due_date = searchParams.get('due_date')!;
    }
    if (searchParams.has('has_due_date')) {
      filters.has_due_date = searchParams.get('has_due_date') === 'true';
    }

    const tasks = await tasksDB.getUserTasks(user.id, filters);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks
 * Create a new task
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // Validate priority if provided
    if (body.priority !== undefined) {
      const priority = parseInt(body.priority);
      if (isNaN(priority) || priority < 0 || priority > 3) {
        return NextResponse.json(
          { error: 'Priority must be 0-3' },
          { status: 400 }
        );
      }
      body.priority = priority;
    }

    const taskData: TaskInsert = {
      user_id: user.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      is_completed: body.is_completed ?? false,
      priority: body.priority ?? 0,
      due_date: body.due_date || null,
      due_time: body.due_time || null,
    };

    const task = await tasksDB.createTask(taskData);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
