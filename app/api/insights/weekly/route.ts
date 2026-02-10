import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ProfilesDB } from '@/lib/db';
import { InsightsDB } from '@/lib/db/insights';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.getProfile(user.id);
    const weekStartDay = profile?.preferences?.week_start_day ?? 1;

    const insightsDB = new InsightsDB(supabase);
    const insights = await insightsDB.getWeeklyInsights(user.id, weekStartDay);

    return NextResponse.json({ insights });
  } catch (error) {
    console.error('GET /api/insights/weekly error:', error);
    return NextResponse.json({ error: 'Failed to fetch weekly insights' }, { status: 500 });
  }
}
