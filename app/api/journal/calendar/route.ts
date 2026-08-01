import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { JournalEntriesDB } from '@/lib/db';
import { log } from '@/lib/logger';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/journal/calendar
 * Returns lightweight date+mood+title array for a given month.
 *
 * Query parameters:
 * - year: number (required)
 * - month: number 1-12 (required)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    if (!yearParam || !monthParam) {
      return NextResponse.json(
        { error: 'year and month query parameters are required' },
        { status: 400 }
      );
    }

    const year = Number(yearParam);
    const month = Number(monthParam);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Invalid year or month (month must be 1-12)' },
        { status: 400 }
      );
    }

    const journalDB = new JournalEntriesDB(supabase);
    const entries = await journalDB.getCalendarMonth(userId, year, month);

    return NextResponse.json({ entries });
  } catch (error) {
    log.error('GET /api/journal/calendar error', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar data' },
      { status: 500 }
    );
  }
}
