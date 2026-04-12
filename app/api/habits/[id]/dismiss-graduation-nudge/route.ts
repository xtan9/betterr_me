import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * POST /api/habits/[id]/dismiss-graduation-nudge
 * Stamp nudge_dismissed_at so the graduation nudge hides for 30 days.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  let userId: string | undefined;
  try {
    ({ id } = await params);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    userId = user.id;

    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.dismissGraduationNudge(id, user.id);
    return NextResponse.json({ habit });
  } catch (error) {
    log.error('[habits] POST dismiss-graduation-nudge', error, { id, userId });
    return NextResponse.json({ error: 'Failed to dismiss nudge' }, { status: 500 });
  }
}
