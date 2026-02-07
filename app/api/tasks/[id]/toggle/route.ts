import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TasksDB } from '@/lib/db';

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tasksDB = new TasksDB(supabase);
    const task = await tasksDB.toggleTaskCompletion(id, user.id);
    return NextResponse.json({ task });
  } catch (error: unknown) {
    console.error('POST /api/tasks/[id]/toggle error:', error);

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
