import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { tasksDB } from '@/lib/db';

/**
 * GET /api/tasks/upcoming?days=7
 * Get upcoming tasks (default 7 days)
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

    // Parse days parameter
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');

    if (isNaN(days) || days < 1) {
      return NextResponse.json(
        { error: 'Days must be a positive number' },
        { status: 400 }
      );
    }

    const tasks = await tasksDB.getUpcomingTasks(user.id, days);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('GET /api/tasks/upcoming error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch upcoming tasks' },
      { status: 500 }
    );
  }
}
