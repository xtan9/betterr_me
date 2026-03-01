import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ExercisesDB } from "@/lib/db/exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { exerciseUpdateSchema } from "@/lib/validations/exercise";
import { log } from "@/lib/logger";

/**
 * GET /api/exercises/[id]
 * Get a single exercise by ID.
 */
export async function GET(
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

    const exercisesDB = new ExercisesDB(supabase);
    const exercise = await exercisesDB.getExercise(id);

    if (!exercise) {
      return NextResponse.json(
        { error: "Exercise not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ exercise });
  } catch (error) {
    log.error("GET /api/exercises/[id] error", error);
    return NextResponse.json(
      { error: "Failed to fetch exercise" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/exercises/[id]
 * Update a custom exercise. Preset exercises cannot be modified (RLS enforces).
 */
export async function PATCH(
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
    const validation = validateRequestBody(body, exerciseUpdateSchema);
    if (!validation.success) return validation.response;

    const exercisesDB = new ExercisesDB(supabase);
    const exercise = await exercisesDB.updateExercise(id, validation.data);

    return NextResponse.json({ exercise });
  } catch (error: unknown) {
    log.error("PATCH /api/exercises/[id] error", error);

    // RLS prevents updating preset exercises — surfaces as PGRST116 (no rows returned)
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "PGRST116") {
      return NextResponse.json(
        { error: "Cannot modify preset exercises" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update exercise" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/exercises/[id]
 * Delete a custom exercise. Preset exercises cannot be deleted (RLS enforces).
 */
export async function DELETE(
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

    const exercisesDB = new ExercisesDB(supabase);
    await exercisesDB.deleteExercise(id);

    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    log.error("DELETE /api/exercises/[id] error", error);

    const message = error instanceof Error ? error.message : String(error);

    // FK violation — exercise used in workouts
    if (message.includes("used in workouts")) {
      return NextResponse.json(
        {
          error:
            "This exercise has been used in workouts and cannot be deleted.",
        },
        { status: 409 }
      );
    }

    // RLS prevents deleting preset exercises — check for no rows affected
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (code === "PGRST116") {
      return NextResponse.json(
        { error: "Cannot delete preset exercises" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete exercise" },
      { status: 500 }
    );
  }
}
