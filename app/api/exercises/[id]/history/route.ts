import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { log } from "@/lib/logger";

/**
 * GET /api/exercises/[id]/history
 * Get per-workout aggregated stats for an exercise across completed workouts.
 * Used for progression charts. Accepts optional `since` query param (ISO date).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: exerciseId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since") ?? undefined;

    const workoutsDB = new WorkoutsDB(supabase);
    const history = await workoutsDB.getExerciseHistory(
      exerciseId,
      user.id,
      { since }
    );

    return NextResponse.json(history);
  } catch (error) {
    log.error("GET /api/exercises/[id]/history error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercise history" },
      { status: 500 }
    );
  }
}
