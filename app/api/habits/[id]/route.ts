import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { habitsDB } from '@/lib/db';
import type { HabitUpdate, HabitFrequency, HabitCategory, HabitStatus } from '@/lib/db/types';

const VALID_CATEGORIES: HabitCategory[] = ['health', 'wellness', 'learning', 'productivity', 'other'];
const VALID_STATUSES: HabitStatus[] = ['active', 'paused', 'archived'];
const VALID_FREQUENCY_TYPES = ['daily', 'weekdays', 'weekly', 'times_per_week', 'custom'];

/**
 * Validate frequency object
 */
function isValidFrequency(frequency: unknown): frequency is HabitFrequency {
  if (!frequency || typeof frequency !== 'object') return false;

  const freq = frequency as Record<string, unknown>;
  if (!freq.type || !VALID_FREQUENCY_TYPES.includes(freq.type as string)) return false;

  switch (freq.type) {
    case 'daily':
    case 'weekdays':
    case 'weekly':
      return true;
    case 'times_per_week':
      return typeof freq.count === 'number' && (freq.count === 2 || freq.count === 3);
    case 'custom':
      return (
        Array.isArray(freq.days) &&
        freq.days.length > 0 &&
        freq.days.every((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)
      );
    default:
      return false;
  }
}

/**
 * GET /api/habits/[id]
 * Get a single habit by ID
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

    const habit = await habitsDB.getHabit(id, user.id);

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    return NextResponse.json({ habit });
  } catch (error) {
    console.error('GET /api/habits/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch habit' }, { status: 500 });
  }
}

/**
 * PATCH /api/habits/[id]
 * Update a habit
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

    // Build update object
    const updates: HabitUpdate = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description?.trim() || null;
    }

    if (body.category !== undefined) {
      if (body.category !== null && !VALID_CATEGORIES.includes(body.category)) {
        return NextResponse.json(
          { error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` },
          { status: 400 }
        );
      }
      updates.category = body.category;
    }

    if (body.frequency !== undefined) {
      if (!isValidFrequency(body.frequency)) {
        return NextResponse.json(
          {
            error: 'Invalid frequency. Must be one of: daily, weekdays, weekly, times_per_week (count: 2|3), custom (days: [0-6])',
          },
          { status: 400 }
        );
      }
      updates.frequency = body.frequency;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `Status must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      updates.status = body.status;

      // Set paused_at timestamp when pausing
      if (body.status === 'paused') {
        updates.paused_at = new Date().toISOString();
      } else if (body.status === 'active') {
        updates.paused_at = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
    }

    const habit = await habitsDB.updateHabit(id, user.id, updates);
    return NextResponse.json({ habit });
  } catch (error: unknown) {
    console.error('PATCH /api/habits/[id] error:', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 });
  }
}

/**
 * DELETE /api/habits/[id]
 * Delete a habit permanently
 *
 * Query parameter:
 * - archive: boolean - if true, archive instead of delete
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

    const searchParams = request.nextUrl.searchParams;
    const archive = searchParams.get('archive') === 'true';

    if (archive) {
      // Soft delete (archive)
      const habit = await habitsDB.archiveHabit(id, user.id);
      return NextResponse.json({ habit, archived: true });
    }

    // Hard delete
    await habitsDB.deleteHabit(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/habits/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 });
  }
}
