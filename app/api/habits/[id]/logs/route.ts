import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { habitLogsDB } from '@/lib/db';

/**
 * GET /api/habits/[id]/logs
 * Get logs for a habit within a date range
 *
 * Query parameters:
 * - start_date: string (YYYY-MM-DD) - required
 * - end_date: string (YYYY-MM-DD) - defaults to today
 * - days: number - alternative to start_date, gets last N days
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: habitId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const today = new Date().toISOString().split('T')[0];

    let startDate: string;
    const endDate = searchParams.get('end_date') || today;

    // Use days parameter or start_date
    if (searchParams.has('days')) {
      const days = parseInt(searchParams.get('days')!);
      if (isNaN(days) || days < 1 || days > 365) {
        return NextResponse.json(
          { error: 'Days must be between 1 and 365' },
          { status: 400 }
        );
      }
      const start = new Date();
      start.setDate(start.getDate() - days);
      startDate = start.toISOString().split('T')[0];
    } else if (searchParams.has('start_date')) {
      startDate = searchParams.get('start_date')!;
    } else {
      // Default to last 30 days
      const start = new Date();
      start.setDate(start.getDate() - 30);
      startDate = start.toISOString().split('T')[0];
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const logs = await habitLogsDB.getLogsByDateRange(habitId, user.id, startDate, endDate);

    return NextResponse.json({
      logs,
      startDate,
      endDate,
      count: logs.length,
    });
  } catch (error) {
    console.error('GET /api/habits/[id]/logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
