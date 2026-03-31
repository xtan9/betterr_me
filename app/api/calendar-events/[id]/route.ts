import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CalendarEventsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { calendarEventUpdateSchema } from '@/lib/validations/calendar-events';
import { log } from '@/lib/logger';
import type { CalendarEventUpdate } from '@/lib/db/types';

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = new CalendarEventsDB(supabase);
    const event = await db.getEvent(id, user.id);

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const db = new CalendarEventsDB(supabase);
    const event = await db.updateEvent(id, user.id, updates);

    return NextResponse.json({ event });
  } catch (error: unknown) {
    log.error('PATCH /api/calendar-events/[id] error', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
    }

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = new CalendarEventsDB(supabase);
    await db.deleteEvent(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/calendar-events/[id] error', error);
    return NextResponse.json({ error: 'Failed to delete calendar event' }, { status: 500 });
  }
}
