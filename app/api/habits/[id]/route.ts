import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { habitUpdateSchema } from '@/lib/validations/habit';
import type { HabitUpdate } from '@/lib/db/types';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

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
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.getHabit(id, userId);

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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

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

    if (validation.data.category_id !== undefined) {
      updates.category_id = validation.data.category_id;
    }

    if (validation.data.frequency !== undefined) {
      updates.frequency = validation.data.frequency;
    }

    if (validation.data.status !== undefined) {
      updates.status = validation.data.status;

      // Set paused_at timestamp when pausing, clear when returning to active.
      // status === 'formed' intentionally does not touch paused_at — graduation
      // should go through POST /graduate, which handles state transitions.
      if (validation.data.status === 'paused') {
        updates.paused_at = new Date().toISOString();
      } else if (validation.data.status === 'active') {
        updates.paused_at = null;
      }
    }

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.updateHabit(id, userId, updates);

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
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const habitsDB = new HabitsDB(supabase);
    await habitsDB.deleteHabit(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('[habits] DELETE', error);
    return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 });
  }
}
