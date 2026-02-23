import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { JournalEntriesDB } from '@/lib/db';
import { log } from '@/lib/logger';

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const entries = await journalDB.getCalendarMonth(user.id, year, month);

    return NextResponse.json({ entries });
  } catch (error) {
    log.error('GET /api/journal/calendar error', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar data' },
      { status: 500 }
    );
  }
}
