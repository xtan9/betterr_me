import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ProfilesDB } from '@/lib/db';
import { invalidateUserStatsCache } from '@/lib/cache';
import type { Profile } from '@/lib/db/types';

/**
 * PATCH /api/profile/preferences
 * Update user preferences (merges with existing)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profilesDB = new ProfilesDB(supabase);
    const body = await request.json();

    // Validate preferences object
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Preferences must be an object' },
        { status: 400 }
      );
    }

    const updates: Partial<Profile['preferences']> = {};

    if (body.date_format !== undefined) {
      if (typeof body.date_format !== 'string') {
        return NextResponse.json(
          { error: 'Date format must be a string' },
          { status: 400 }
        );
      }
      updates.date_format = body.date_format;
    }

    if (body.week_start_day !== undefined) {
      const day = parseInt(body.week_start_day);
      if (isNaN(day) || day < 0 || day > 6) {
        return NextResponse.json(
          { error: 'Week start day must be 0-6' },
          { status: 400 }
        );
      }
      updates.week_start_day = day;
    }

    if (body.theme !== undefined) {
      if (!['system', 'light', 'dark'].includes(body.theme)) {
        return NextResponse.json(
          { error: 'Theme must be system, light, or dark' },
          { status: 400 }
        );
      }
      updates.theme = body.theme;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid preference updates provided' },
        { status: 400 }
      );
    }

    const profile = await profilesDB.updatePreferences(user.id, updates);

    // Invalidate all stats cache when week_start_day changes,
    // since it affects how weekly stats are calculated
    if (updates.week_start_day !== undefined) {
      invalidateUserStatsCache(user.id);
    }

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    console.error('PATCH /api/profile/preferences error:', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
