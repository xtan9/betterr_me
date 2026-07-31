import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { CalendarEventsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { calendarEventUpdateSchema } from '@/lib/validations/calendar-events';
import { SchedulingLifecycle } from '@/lib/scheduling/lifecycle';
import { log } from '@/lib/logger';
import type { CalendarEventUpdate } from '@/lib/db/types';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/calendar-events/[id]
 * Get a single calendar event by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid event ID format' }, { status: 400 });
    }
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const db = new CalendarEventsDB(supabase);
    const event = await db.getEvent(id, userId);

    if (!event) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    log.error('GET /api/calendar-events/[id] error', error);
    return NextResponse.json({ error: 'Failed to fetch calendar event' }, { status: 500 });
  }
}

/**
 * PATCH /api/calendar-events/[id]
 * Update a calendar event.
 *
 * Editing a recurring parent updates all future occurrences.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid event ID format' }, { status: 400 });
    }
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, calendarEventUpdateSchema);
    if (!validation.success) return validation.response;

    // Build update object — only include fields that were provided
    const updates: CalendarEventUpdate = {};
    const data = validation.data;

    if (data.title !== undefined) {
      updates.title = data.title.trim();
    }
    if (data.description !== undefined) {
      updates.description = data.description;
    }
    if (data.start_date !== undefined) {
      updates.start_date = data.start_date;
    }
    if (data.start_time !== undefined) {
      updates.start_time = data.start_time;
    }
    if (data.end_date !== undefined) {
      updates.end_date = data.end_date;
    }
    if (data.end_time !== undefined) {
      updates.end_time = data.end_time;
    }
    if (data.location !== undefined) {
      updates.location = data.location;
    }
    if (data.color !== undefined) {
      updates.color = data.color;
    }
    if (data.category_id !== undefined) {
      updates.category_id = data.category_id;
    }
    if (data.is_recurring !== undefined) {
      updates.is_recurring = data.is_recurring;
    }
    if (data.recurrence_rule !== undefined) {
      updates.recurrence_rule = data.recurrence_rule;
    }
    if (data.end_type !== undefined) {
      updates.end_type = data.end_type;
    }
    if (data.end_date_recurrence !== undefined) {
      updates.end_date_recurrence = data.end_date_recurrence;
    }
    if (data.end_count !== undefined) {
      updates.end_count = data.end_count;
    }

    const lifecycle = new SchedulingLifecycle(supabase);
    const outcome = await lifecycle.update(userId, id, {
      event: updates,
      ...(data.reminders !== undefined
        ? {
            reminders: data.reminders.map((reminder) => ({
              ...reminder,
              relative_minutes: reminder.relative_minutes ?? null,
              absolute_time: reminder.absolute_time ?? null,
            })),
          }
        : {}),
    });

    return NextResponse.json(outcome);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['PGRST116', 'P0002'].includes((error as { code: string }).code)
    ) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
    }

    log.error('PATCH /api/calendar-events/[id] error', error);
    return NextResponse.json({ error: 'Failed to update calendar event' }, { status: 500 });
  }
}

/**
 * DELETE /api/calendar-events/[id]
 * Delete a calendar event.
 *
 * Deleting a recurring parent cascade-deletes all exception records (FK constraint).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid event ID format' }, { status: 400 });
    }
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const lifecycle = new SchedulingLifecycle(supabase);
    const outcome = await lifecycle.delete(userId, id);

    return NextResponse.json(outcome);
  } catch (error) {
    log.error('DELETE /api/calendar-events/[id] error', error);
    return NextResponse.json({ error: 'Failed to delete calendar event' }, { status: 500 });
  }
}
