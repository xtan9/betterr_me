import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { tasksDB } from '@/lib/db';

/**
 * GET /api/tasks/overdue
 * Get overdue tasks
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

    const tasks = await tasksDB.getOverdueTasks(user.id);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('GET /api/tasks/overdue error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch overdue tasks' },
      { status: 500 }
    );
  }
}
