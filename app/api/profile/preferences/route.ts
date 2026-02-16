import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ProfilesDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { preferencesSchema } from '@/lib/validations/preferences';

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

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, preferencesSchema);
    if (!validation.success) return validation.response;

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.updatePreferences(user.id, validation.data);

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
