import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { WorkoutToRoutineConversion } from "@/lib/fitness/routine-workout-conversion";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";
import { validateRequestBody } from "@/lib/validations/api";
import { saveAsRoutineSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";

/**
 * POST /api/workouts/[id]/save-as-routine
 * Creates a new routine from a workout's exercises and sets.
 * Works for in_progress, completed, or discarded workouts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workoutId } = await params;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate body
    const body = await request.json();
    const validation = validateRequestBody(body, saveAsRoutineSchema);
    if (!validation.success) return validation.response;

    // Fetch workout with exercises and sets via DB class
    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.getWorkoutWithExercises(workoutId);

    if (!workout) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404 }
      );
    }

    const conversion = new WorkoutToRoutineConversion(
      new SupabaseRoutineWorkoutStore(supabase),
    );
    const routine = await conversion.save(
      user.id,
      validation.data.name,
      workout,
    );

    return NextResponse.json({ routine }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/save-as-routine error", error);

    return NextResponse.json(
      { error: "Failed to save workout as routine" },
      { status: 500 }
    );
  }
}
