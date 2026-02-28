import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateRequestBody } from "@/lib/validations/api";
import { saveAsRoutineSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";
import type { WorkoutSet } from "@/lib/db/types";

/**
 * POST /api/workouts/[id]/save-as-routine
 * Creates a new routine from a completed workout's exercises and sets.
 * Works for in_progress, completed, or discarded workouts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workoutId } = await params;
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

    // Fetch workout with exercises and sets
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .select(
        `
        *,
        workout_exercises (
          *,
          exercise:exercises (*),
          sets:workout_sets (*)
        )
      `
      )
      .eq("id", workoutId)
      .single();

    if (workoutError) {
      if (workoutError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Workout not found" },
          { status: 404 }
        );
      }
      log.error("Failed to fetch workout", workoutError);
      throw workoutError;
    }

    // Create routine
    const { data: routine, error: routineError } = await supabase
      .from("routines")
      .insert({
        user_id: user.id,
        name: validation.data.name,
      })
      .select()
      .single();

    if (routineError) {
      log.error("Failed to create routine from workout", routineError);
      throw routineError;
    }

    // Sort workout exercises by sort_order
    const sortedExercises = [
      ...(workout.workout_exercises as Record<string, unknown>[]),
    ].sort(
      (a, b) =>
        (a.sort_order as number) - (b.sort_order as number)
    );

    // Create routine exercises from workout exercises
    for (let i = 0; i < sortedExercises.length; i++) {
      const we = sortedExercises[i];
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

      const sortOrder = (i + 1) * 65536;
      const targetSetCount =
        completedSets.length > 0 ? completedSets.length : sets.length;

      const { error: reError } = await supabase
        .from("routine_exercises")
        .insert({
          routine_id: routine.id,
          exercise_id: we.exercise_id as string,
          sort_order: sortOrder,
          target_sets: targetSetCount || 1,
          target_reps: targetReps,
          target_weight_kg: targetWeightKg,
          target_duration_seconds: targetDurationSeconds,
          rest_timer_seconds: (we.rest_timer_seconds as number) ?? 90,
          notes: (we.notes as string) ?? null,
        });

      if (reError) {
        log.error("Failed to create routine exercise from workout", reError);
        throw reError;
      }
    }

    return NextResponse.json({ routine }, { status: 201 });
  } catch (error) {
    log.error("POST /api/workouts/[id]/save-as-routine error", error);
    return NextResponse.json(
      { error: "Failed to save workout as routine" },
      { status: 500 }
    );
  }
}
