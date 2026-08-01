import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { HabitsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { habitFormSchema } from '@/lib/validations/habit';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { MAX_HABITS_PER_USER } from '@/lib/constants';
import type { HabitInsert, HabitFilters } from '@/lib/db/types';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/habits
 * Get habits for the authenticated user with optional filters
 *
 * Query parameters:
 * - status: 'active' | 'paused' | 'formed'
 * - category_id: UUID of user-defined category
 * - with_today: boolean - include today's completion status
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

    const habitsDB = new HabitsDB(supabase);
    const searchParams = request.nextUrl.searchParams;
    const withToday = searchParams.get('with_today') === 'true';

    // If with_today is requested, use the optimized query
    if (withToday) {
      const date = searchParams.get('date') || undefined;
      const habits = await habitsDB.getHabitsWithTodayStatus(userId, date);
      return NextResponse.json({ habits });
    }

    // Handle regular filtering
    const filters: HabitFilters = {};

    if (searchParams.has('status')) {
      const status = searchParams.get('status');
      if (status === 'active' || status === 'paused' || status === 'formed') {
        filters.status = status;
      }
    }

    if (searchParams.has('category_id')) {
      const categoryId = searchParams.get('category_id');
      if (categoryId) {
        filters.category_id = categoryId;
      }
    }

    const habits = await habitsDB.getUserHabits(userId, filters);
    return NextResponse.json({ habits });
  } catch (error) {
    log.error('GET /api/habits error', error);
    return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 });
  }
}

/**
 * POST /api/habits
 * Create a new habit
 */
export async function POST(request: NextRequest) {
  try {
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
    const validation = validateRequestBody(body, habitFormSchema);
    if (!validation.success) return validation.response;

    // Ensure user profile exists (required by FK constraint on habits.user_id)
    await ensureProfile(supabase, {
      id: userId,
      ...auth.principal.profile,
    });

    // Check habit count limit
    const habitsDB = new HabitsDB(supabase);
    const activeCount = await habitsDB.getActiveHabitCount(userId);
    if (activeCount >= MAX_HABITS_PER_USER) {
      return NextResponse.json(
        { error: `You have ${activeCount}/${MAX_HABITS_PER_USER} habits. Remove one before adding another.` },
        { status: 400 }
      );
    }

    const habitData: HabitInsert = {
      user_id: userId,
      name: validation.data.name.trim(),
      description: validation.data.description?.trim() || null,
      category_id: validation.data.category_id || null,
      frequency: validation.data.frequency,
      status: 'active',
    };

    const habit = await habitsDB.createHabit(habitData);
    return NextResponse.json({ habit }, { status: 201 });
  } catch (error) {
    log.error('POST /api/habits error', error);
    return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 });
  }
}
