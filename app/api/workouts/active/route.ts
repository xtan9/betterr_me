import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { log } from "@/lib/logger";

/**
 * GET /api/workouts/active
 * Get the active (in_progress) workout with nested exercises, sets,
 * and previous workout values for each exercise.
 * Returns { workout: null } if no active workout exists.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.getActiveWorkout(user.id);

    if (!workout) {
      return NextResponse.json({ workout: null });
    }

    // Enrich each exercise with previous sets from the most recent completed workout
    const enrichedExercises = await Promise.all(
      (workout.exercises ?? []).map(async (exercise) => {
        const previousSets = await workoutsDB.getPreviousSets(
          exercise.exercise_id
        );
        return {
          ...exercise,
          previousSets,
        };
      })
    );

    return NextResponse.json({
      workout: {
        ...workout,
        exercises: enrichedExercises,
      },
    });
  } catch (error) {
    log.error("GET /api/workouts/active error", error);
    return NextResponse.json(
      { error: "Failed to fetch active workout" },
      { status: 500 }
    );
  }
}
