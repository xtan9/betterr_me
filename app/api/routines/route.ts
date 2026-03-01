import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoutinesDB } from "@/lib/db/routines";
import { validateRequestBody } from "@/lib/validations/api";
import { routineCreateSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";

/**
 * GET /api/routines
 * List all routines for the authenticated user with nested exercises.
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

    const routinesDB = new RoutinesDB(supabase);
    const routines = await routinesDB.getUserRoutines(user.id);

    return NextResponse.json({ routines });
  } catch (error) {
    log.error("GET /api/routines error", error);
    return NextResponse.json(
      { error: "Failed to fetch routines" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/routines
 * Create a new routine.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, routineCreateSchema);
    if (!validation.success) return validation.response;

    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.createRoutine(user.id, validation.data);

    return NextResponse.json({ routine }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines error", error);
    return NextResponse.json(
      { error: "Failed to create routine" },
      { status: 500 }
    );
  }
}
