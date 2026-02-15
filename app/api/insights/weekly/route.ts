import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProfilesDB, InsightsDB } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("GET /api/insights/weekly auth error:", authError);
      return NextResponse.json(
        { error: "Authentication service error" },
        { status: 500 },
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date") || undefined;

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.getProfile(user.id);
    const weekStartDay = profile?.preferences?.week_start_day ?? 1;

    const insightsDB = new InsightsDB(supabase);
    const insights = await insightsDB.getWeeklyInsights(
      user.id,
      weekStartDay,
      date,
    );

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("GET /api/insights/weekly error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly insights" },
      { status: 500 },
    );
  }
}
