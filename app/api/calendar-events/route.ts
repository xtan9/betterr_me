import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { CalendarEventsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { calendarEventCreateSchema } from '@/lib/validations/calendar-events';
import { expandEventsForRange } from '@/lib/calendar/recurrence';
import { log } from '@/lib/logger';
import { ensureProfile } from '@/lib/db/ensure-profile';
import type { CalendarEventInsert } from '@/lib/db/types';
import { SchedulingLifecycle } from '@/lib/scheduling/lifecycle';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/calendar-events
 * List calendar events for a date range with recurrence expansion.
 *
 * Query parameters (required):
 * - start_date: YYYY-MM-DD
 * - end_date: YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'start_date and end_date query parameters are required' },
        { status: 400 }
      );
    }
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: 'start_date and end_date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    const db = new CalendarEventsDB(supabase);
    const events = await db.getUserEvents(userId, startDate, endDate);
    const expanded = expandEventsForRange(events, startDate, endDate);

    return NextResponse.json({ events: expanded });
  } catch (error) {
    log.error('GET /api/calendar-events error', error);
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
}

/**
 * POST /api/calendar-events
 * Create a new calendar event.
 *
 * Supports exception creation: include recurring_event_id and original_date
 * in the body to create an exception for a specific occurrence.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, calendarEventCreateSchema);
    if (!validation.success) return validation.response;

    await ensureProfile(supabase, {
      id: userId,
      ...auth.principal.profile,
    });

    // Build insert data from validated fields
    const insertData: Omit<CalendarEventInsert, 'user_id'> = {
      title: validation.data.title.trim(),
      description: validation.data.description ?? null,
      start_date: validation.data.start_date,
      start_time: validation.data.start_time ?? null,
      end_date: validation.data.end_date,
      end_time: validation.data.end_time ?? null,
      location: validation.data.location ?? null,
      color: validation.data.color ?? null,
      category_id: validation.data.category_id ?? null,
      is_recurring: validation.data.is_recurring ?? false,
      recurrence_rule: validation.data.recurrence_rule ?? null,
      end_type: validation.data.end_type ?? null,
      end_date_recurrence: validation.data.end_date_recurrence ?? null,
      end_count: validation.data.end_count ?? null,
      is_exception: false,
      recurring_event_id: null,
      original_date: null,
    };

    // Support exception creation (edit this occurrence) — fields validated by Zod
    if (validation.data.recurring_event_id) {
      insertData.is_exception = true;
      insertData.recurring_event_id = validation.data.recurring_event_id;
      insertData.original_date = validation.data.original_date ?? null;
    }

    const lifecycle = new SchedulingLifecycle(supabase);
    const outcome = await lifecycle.create(userId, {
      event: insertData,
      reminders: (validation.data.reminders ?? []).map((reminder) => ({
        ...reminder,
        relative_minutes: reminder.relative_minutes ?? null,
        absolute_time: reminder.absolute_time ?? null,
      })),
    });
    return NextResponse.json(outcome, { status: 201 });
  } catch (error) {
    log.error('POST /api/calendar-events error', error);
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 });
  }
}
