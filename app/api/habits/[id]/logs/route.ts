import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitLogsDB } from '@/lib/db';
import { getLocalDateString } from '@/lib/utils';
import { log } from '@/lib/logger';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

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
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const searchParams = request.nextUrl.searchParams;
    const today = getLocalDateString();

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
      startDate = getLocalDateString(start);
    } else if (searchParams.has('start_date')) {
      startDate = searchParams.get('start_date')!;
    } else {
      // Default to last 30 days
      const start = new Date();
      start.setDate(start.getDate() - 30);
      startDate = getLocalDateString(start);
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const habitLogsDB = new HabitLogsDB(supabase);
    const logs = await habitLogsDB.getLogsByDateRange(habitId, userId, startDate, endDate);

    return NextResponse.json({
      logs,
      startDate,
      endDate,
      count: logs.length,
    });
  } catch (error) {
    log.error('GET /api/habits/[id]/logs error', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
