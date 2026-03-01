import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutSetCreateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

/**
 * POST /api/workouts/[id]/exercises/[weId]/sets
 * Add a set to a workout exercise.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string }> }
) {
  try {
    const { weId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, workoutSetCreateSchema);
    if (!validation.success) return validation.response;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    const set = await workoutExercisesDB.addSet(weId, validation.data);

    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/exercises/[weId]/sets error", error);
    return NextResponse.json(
      { error: "Failed to add set" },
      { status: 500 }
    );
  }
}
