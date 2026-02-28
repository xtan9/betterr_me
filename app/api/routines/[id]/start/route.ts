import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoutinesDB } from "@/lib/db/routines";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import { log } from "@/lib/logger";
import type { ExerciseType } from "@/lib/db/types";

/**
 * POST /api/routines/[id]/start
 * Copy-on-start: creates a new workout from a routine template.
 * Deep-copies all routine exercises and pre-fills sets based on target values.
 * Returns 409 if the user already has an active workout.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routineId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch routine with exercises
    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.getRoutine(routineId);

    if (!routine) {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }

    // 2. Create workout (direct insert to set routine_id and title from routine)
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .insert({
        user_id: user.id,
        title: routine.name,
        status: "in_progress" as const,
        started_at: new Date().toISOString(),
        routine_id: routineId,
      })
      .select()
      .single();

    if (workoutError) {
      if (workoutError.code === "23505") {
        return NextResponse.json(
          { error: "You already have an active workout" },
          { status: 409 }
        );
      }
      log.error("Failed to create workout from routine", workoutError);
      throw workoutError;
    }

    // 3. Deep-copy each routine exercise with pre-filled sets
    const sortedExercises = [...routine.exercises].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    for (const re of sortedExercises) {
      // Insert workout exercise
      const { data: we, error: weError } = await supabase
        .from("workout_exercises")
        .insert({
          workout_id: workout.id,
          exercise_id: re.exercise_id,
          sort_order: re.sort_order,
          notes: re.notes,
          rest_timer_seconds: re.rest_timer_seconds,
        })
        .select()
        .single();

      if (weError) {
        log.error("Failed to copy routine exercise to workout", weError);
        throw weError;
      }

      // Get exercise type field config
      const exerciseType = re.exercise.exercise_type as ExerciseType;
      const fieldConfig = EXERCISE_FIELD_MAP[exerciseType];

      // Create pre-filled sets
      const targetSets = re.target_sets || 1;
      const setsToInsert = Array.from({ length: targetSets }, (_, i) => ({
        workout_exercise_id: we.id,
        set_number: i + 1,
        set_type: "normal" as const,
        weight_kg: fieldConfig.showWeight ? (re.target_weight_kg ?? null) : null,
        reps: fieldConfig.showReps ? (re.target_reps ?? null) : null,
        duration_seconds: fieldConfig.showDuration
          ? (re.target_duration_seconds ?? null)
          : null,
        is_completed: false,
      }));

      if (setsToInsert.length > 0) {
        const { error: setsError } = await supabase
          .from("workout_sets")
          .insert(setsToInsert);

        if (setsError) {
          log.error("Failed to create pre-filled sets", setsError);
          throw setsError;
        }
      }
    }

    // 4. Update routine's last_performed_at
    await routinesDB.updateRoutine(routineId, {
      last_performed_at: new Date().toISOString(),
    });

    return NextResponse.json({ workout }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines/[id]/start error", error);

    // Re-check for 23505 in case it was thrown from WorkoutsDB
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "23505") {
      return NextResponse.json(
        { error: "You already have an active workout" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to start workout from routine" },
      { status: 500 }
    );
  }
}
