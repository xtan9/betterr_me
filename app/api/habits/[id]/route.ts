import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { habitUpdateSchema } from '@/lib/validations/habit';
import { createHabitWrites, toHabitResponse } from '@/lib/habits/writes';

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

    const updateRequest = {
      userId,
      habitId: id,
      ...(validation.data.name !== undefined
        ? { name: validation.data.name }
        : {}),
      ...(validation.data.description !== undefined
        ? { description: validation.data.description }
        : {}),
      ...(validation.data.category_id !== undefined
        ? { categoryId: validation.data.category_id }
        : {}),
      ...(validation.data.frequency !== undefined
        ? { frequency: validation.data.frequency }
        : {}),
    };
    const outcome = await createHabitWrites(supabase).update(updateRequest);

    if (outcome.type === 'not-found') {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (outcome.type === 'conflict') {
      return NextResponse.json(
        { error: 'Habit update conflict' },
        { status: 409 },
      );
    }
    if (outcome.type === 'invalid') {
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 },
      );
    }

    return NextResponse.json({ habit: toHabitResponse(outcome.habit) });
  } catch (error: unknown) {
    log.error('PATCH /api/habits/[id] error', error);
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

    const outcome = await createHabitWrites(supabase).delete({
      habitId: id,
      userId,
    });
    if (outcome.type === 'not-found') {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('[habits] DELETE', error);
    return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 });
  }
}
