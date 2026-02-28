import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { RoutinesDB } from "@/lib/db/routines";
import { validateRequestBody } from "@/lib/validations/api";
import { saveAsRoutineSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";
import type { Routine, WorkoutSet } from "@/lib/db/types";

/**
 * POST /api/workouts/[id]/save-as-routine
 * Creates a new routine from a completed workout's exercises and sets.
 * Works for in_progress, completed, or discarded workouts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workoutId } = await params;
  let routine: Routine | undefined;
  let routinesDB: RoutinesDB | undefined;

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

    // Create routine via DB class
    routinesDB = new RoutinesDB(supabase);
    routine = await routinesDB.createRoutine(user.id, {
      name: validation.data.name,
    });

    // Sort workout exercises by sort_order
    const sortedExercises = [...workout.exercises].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    // Create routine exercises from workout exercises
    for (const we of sortedExercises) {
      const sets = (we.sets as WorkoutSet[]) ?? [];
      const completedSets = sets.filter((s) => s.is_completed);

      // Find best values from completed sets
      let targetWeightKg: number | null = null;
      let targetReps: number | null = null;
      let targetDurationSeconds: number | null = null;

      if (completedSets.length > 0) {
        // Max weight from completed sets
        const weights = completedSets
          .map((s) => s.weight_kg)
          .filter((w): w is number => w !== null);
        if (weights.length > 0) {
          targetWeightKg = Math.max(...weights);
        }

        // First completed set's reps as target
        targetReps = completedSets[0].reps ?? null;

        // First completed set's duration as target
        targetDurationSeconds = completedSets[0].duration_seconds ?? null;
      }

      const targetSetCount =
        completedSets.length > 0 ? completedSets.length : sets.length;

      await routinesDB.addExerciseToRoutine(routine.id, {
        exercise_id: we.exercise_id,
        target_sets: targetSetCount || 1,
        target_reps: targetReps,
        target_weight_kg: targetWeightKg,
        target_duration_seconds: targetDurationSeconds,
        rest_timer_seconds: we.rest_timer_seconds ?? 90,
        notes: we.notes ?? null,
      });
    }

    return NextResponse.json({ routine }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/save-as-routine error", error);

    // Clean up partially created routine
    if (routine?.id && routinesDB) {
      const routineId = routine.id;
      await routinesDB.deleteRoutine(routineId).catch((cleanupErr) => {
        log.error("Failed to clean up partial routine", cleanupErr, { routineId });
      });
    }

    return NextResponse.json(
      { error: "Failed to save workout as routine" },
      { status: 500 }
    );
  }
}
