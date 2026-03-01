import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoutinesDB } from "@/lib/db/routines";
import { validateRequestBody } from "@/lib/validations/api";
import { routineExerciseAddSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";

/**
 * GET /api/routines/[id]/exercises
 * Get all exercises for a routine.
 */
export async function GET(
  _request: NextRequest,
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

    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.getRoutine(id);

    if (!routine) {
      return NextResponse.json(
        { error: "Routine not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ exercises: routine.exercises });
  } catch (error) {
    log.error("GET /api/routines/[id]/exercises error", error);
    return NextResponse.json(
      { error: "Failed to fetch routine exercises" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/routines/[id]/exercises
 * Add an exercise to a routine.
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
    const validation = validateRequestBody(body, routineExerciseAddSchema);
    if (!validation.success) return validation.response;

    const routinesDB = new RoutinesDB(supabase);
    const exercise = await routinesDB.addExerciseToRoutine(
      id,
      validation.data
    );

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines/[id]/exercises error", error);
    return NextResponse.json(
      { error: "Failed to add exercise to routine" },
      { status: 500 }
    );
  }
}
