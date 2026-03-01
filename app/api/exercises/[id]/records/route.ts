import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { computePersonalRecords } from "@/lib/fitness/personal-records";
import { log } from "@/lib/logger";

/**
 * GET /api/exercises/[id]/records
 * Compute personal records for an exercise from all completed normal sets.
 * Returns a PersonalRecord object with best weight, reps, volume, and duration.
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

    const workoutsDB = new WorkoutsDB(supabase);
    const sets = await workoutsDB.getExerciseSets(exerciseId, user.id);
    const records = computePersonalRecords(exerciseId, sets);

    return NextResponse.json(records);
  } catch (error) {
    log.error("GET /api/exercises/[id]/records error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercise records" },
      { status: 500 }
    );
  }
}
