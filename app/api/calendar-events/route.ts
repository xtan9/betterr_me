import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { CalendarEventsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { calendarEventCreateSchema } from '@/lib/validations/calendar-events';
import { expandEventsForRange } from '@/lib/calendar/recurrence';
import { log } from '@/lib/logger';
import { ensureProfile } from '@/lib/db/ensure-profile';
import {
  createSchedulingWrites,
  toCalendarEventResponse,
  toReminderResponse,
  type ScheduleRecurrenceRule,
  type ScheduleWeekPosition,
} from '@/lib/scheduling/writes';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

function toDomainRecurrenceRule(value: unknown): ScheduleRecurrenceRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rule = value as Record<string, unknown>;
  const interval = Number(rule.interval);
  if (rule.frequency === 'daily') {
    return { frequency: 'daily', interval };
  }
  if (rule.frequency === 'weekly' && Array.isArray(rule.days_of_week)) {
    return {
      frequency: 'weekly',
      interval,
      daysOfWeek: rule.days_of_week.map(Number),
    };
  }
  if (
    rule.frequency === 'monthly' &&
    typeof rule.week_position === 'string'
  ) {
    return {
      frequency: 'monthly',
      interval,
      weekPosition: rule.week_position as ScheduleWeekPosition,
      dayOfWeekMonthly: Number(rule.day_of_week_monthly),
    };
  }
  if (rule.frequency === 'monthly') {
    return {
      frequency: 'monthly',
      interval,
      dayOfMonth: Number(rule.day_of_month),
    };
  }
  if (rule.frequency === 'yearly') {
    return {
      frequency: 'yearly',
      interval,
      monthOfYear: Number(rule.month_of_year),
      dayOfMonth: Number(rule.day_of_month),
    };
  }
  return null;
}

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

    // Map validated transport fields into the storage-independent domain request.
    const domainRecurrenceRule = toDomainRecurrenceRule(
      validation.data.recurrence_rule,
    );

    // Support exception creation (edit this occurrence) — fields validated by Zod
    const outcome = await createSchedulingWrites(supabase).create({
      userId,
      event: {
        title: validation.data.title.trim(),
        description: validation.data.description ?? null,
        startDate: validation.data.start_date,
        startTime: validation.data.start_time ?? null,
        endDate: validation.data.end_date,
        endTime: validation.data.end_time ?? null,
        location: validation.data.location ?? null,
        color: validation.data.color ?? null,
        categoryId: validation.data.category_id ?? null,
        isRecurring: validation.data.is_recurring ?? false,
        recurrenceRule: domainRecurrenceRule,
        endType: validation.data.end_type ?? null,
        endDateRecurrence: validation.data.end_date_recurrence ?? null,
        endCount: validation.data.end_count ?? null,
        recurringEventId: validation.data.recurring_event_id ?? null,
        originalDate: validation.data.original_date ?? null,
        isException: Boolean(validation.data.recurring_event_id),
      },
      reminders: (validation.data.reminders ?? []).map((reminder) =>
        reminder.reminder_type === 'relative'
          ? {
              reminderType: 'relative' as const,
              relativeMinutes: reminder.relative_minutes ?? 0,
              channels: reminder.channels,
            }
          : {
              reminderType: 'absolute' as const,
              absoluteTime: reminder.absolute_time ?? '',
              channels: reminder.channels,
            },
      ),
    });

    if (outcome.type === 'not-found') {
      return NextResponse.json(
        { error: 'Calendar related entity not found' },
        { status: 404 },
      );
    }
    if (outcome.type === 'conflict') {
      return NextResponse.json(
        { error: 'Calendar event creation conflicted' },
        { status: 409 },
      );
    }
    if (outcome.type === 'invalid') {
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        event: toCalendarEventResponse(outcome.event),
        reminders: outcome.reminders.map(toReminderResponse),
      },
      { status: 201 },
    );
  } catch (error) {
    log.error('POST /api/calendar-events error', error);
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 });
  }
}
