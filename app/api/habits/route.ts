import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { habitFormSchema } from '@/lib/validations/habit';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { MAX_HABITS_PER_USER } from '@/lib/constants';
import type { HabitInsert, HabitFilters, HabitCategory } from '@/lib/db/types';

const VALID_CATEGORIES: HabitCategory[] = ['health', 'wellness', 'learning', 'productivity', 'other'];

/**
 * GET /api/habits
 * Get habits for the authenticated user with optional filters
 *
 * Query parameters:
 * - status: 'active' | 'paused' | 'archived'
 * - category: 'health' | 'wellness' | 'learning' | 'productivity' | 'other'
 * - with_today: boolean - include today's completion status
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

    const habitsDB = new HabitsDB(supabase);
    const searchParams = request.nextUrl.searchParams;
    const withToday = searchParams.get('with_today') === 'true';

    // If with_today is requested, use the optimized query
    if (withToday) {
      const date = searchParams.get('date') || undefined;
      const habits = await habitsDB.getHabitsWithTodayStatus(user.id, date);
      return NextResponse.json({ habits });
    }

    // Handle regular filtering
    const filters: HabitFilters = {};

    if (searchParams.has('status')) {
      const status = searchParams.get('status');
      if (status === 'active' || status === 'paused' || status === 'archived') {
        filters.status = status;
      }
    }

    if (searchParams.has('category')) {
      const category = searchParams.get('category') as HabitCategory;
      if (VALID_CATEGORIES.includes(category)) {
        filters.category = category;
      }
    }

    const habits = await habitsDB.getUserHabits(user.id, filters);
    return NextResponse.json({ habits });
  } catch (error) {
    console.error('GET /api/habits error:', error);
    return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 });
  }
}

/**
 * POST /api/habits
 * Create a new habit
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, habitFormSchema);
    if (!validation.success) return validation.response;

    // Ensure user profile exists (required by FK constraint on habits.user_id)
    await ensureProfile(supabase, user);

    // Check habit count limit
    const habitsDB = new HabitsDB(supabase);
    const activeCount = await habitsDB.getActiveHabitCount(user.id);
    if (activeCount >= MAX_HABITS_PER_USER) {
      return NextResponse.json(
        { error: `You have ${activeCount}/${MAX_HABITS_PER_USER} habits. Remove one before adding another.` },
        { status: 400 }
      );
    }

    const habitData: HabitInsert = {
      user_id: user.id,
      name: validation.data.name.trim(),
      description: validation.data.description?.trim() || null,
      category: validation.data.category || null,
      frequency: validation.data.frequency,
      status: 'active',
    };

    const habit = await habitsDB.createHabit(habitData);
    return NextResponse.json({ habit }, { status: 201 });
  } catch (error) {
    console.error('POST /api/habits error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create habit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
