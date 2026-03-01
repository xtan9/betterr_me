import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutExercisesDB } from "@/lib/db/workout-exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { addExerciseToWorkoutSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

/**
 * POST /api/workouts/[id]/exercises
 * Add an exercise to a workout.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, addExerciseToWorkoutSchema);
    if (!validation.success) return validation.response;

    const workoutExercisesDB = new WorkoutExercisesDB(supabase);
    const exercise = await workoutExercisesDB.addExercise(
      id,
      validation.data.exercise_id,
      validation.data.rest_timer_seconds
    );

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/exercises error", error);
    return NextResponse.json(
      { error: "Failed to add exercise to workout" },
      { status: 500 }
    );
  }
}
