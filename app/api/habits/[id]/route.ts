import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { habitUpdateSchema } from '@/lib/validations/habit';
import type { HabitUpdate } from '@/lib/db/types';

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

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.getHabit(id, user.id);

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    return NextResponse.json({ habit });
  } catch (error) {
    log.error('GET /api/habits/[id] error', error);
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

    // Validate with Zod schema
    const validation = validateRequestBody(body, habitUpdateSchema);
    if (!validation.success) return validation.response;

    // Build update object from validated data
    const updates: HabitUpdate = {};

    if (validation.data.name !== undefined) {
      updates.name = validation.data.name.trim();
    }

    if (validation.data.description !== undefined) {
      updates.description = validation.data.description?.trim() || null;
    }

    if (validation.data.category !== undefined) {
      updates.category = validation.data.category;
    }

    if (validation.data.frequency !== undefined) {
      updates.frequency = validation.data.frequency;
    }

    if (validation.data.status !== undefined) {
      updates.status = validation.data.status;

      // Set paused_at timestamp when pausing
      if (validation.data.status === 'paused') {
        updates.paused_at = new Date().toISOString();
      } else if (validation.data.status === 'active') {
        updates.paused_at = null;
      }
    }

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.updateHabit(id, user.id, updates);

    return NextResponse.json({ habit });
  } catch (error: unknown) {
    log.error('PATCH /api/habits/[id] error', error);

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

    const habitsDB = new HabitsDB(supabase);
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
    log.error('DELETE /api/habits/[id] error', error);
    return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 });
  }
}
