import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db';
import type { HabitInsert, HabitFilters, HabitFrequency, HabitCategory } from '@/lib/db/types';

const VALID_CATEGORIES: HabitCategory[] = ['health', 'wellness', 'learning', 'productivity', 'other'];
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

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Validate frequency
    if (!body.frequency || !isValidFrequency(body.frequency)) {
      return NextResponse.json(
        {
          error: 'Invalid frequency. Must be one of: daily, weekdays, weekly, times_per_week (count: 2|3), custom (days: [0-6])',
        },
        { status: 400 }
      );
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    const habitsDB = new HabitsDB(supabase);
    const habitData: HabitInsert = {
      user_id: user.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      category: body.category || null,
      frequency: body.frequency,
      status: 'active',
    };

    const habit = await habitsDB.createHabit(habitData);
    return NextResponse.json({ habit }, { status: 201 });
  } catch (error) {
    console.error('POST /api/habits error:', error);
    return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 });
  }
}
