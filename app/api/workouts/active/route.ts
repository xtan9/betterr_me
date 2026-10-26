import { NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { WorkoutsDB } from "@/lib/db/workouts";
import { priorRequestForExercise } from "@/lib/fitness/prior-result-target";
import { readWebPriorResults } from "@/lib/fitness/web-prior-results";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/workouts/active
 * Get the active (in_progress) workout with nested exercises, sets,
 * and previous workout values for each exercise.
 * Returns { workout: null } if no active workout exists.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.getActiveWorkout(userId);

    if (!workout) {
      return NextResponse.json({ workout: null });
    }

    // Enrich each exercise with previous sets from the most recent completed workout
    const enrichedExercises = await Promise.all(
      (workout.exercises ?? []).map(async (exercise) => {
        const previousSets = await workoutsDB
          .getPreviousSets(exercise.exercise_id, userId)
          .catch((err) => {
            log.error("Failed to fetch previous sets", err, {
              exerciseId: exercise.exercise_id,
            });
            return [];
          });
        const priorRequest = priorRequestForExercise(userId, workout.id, exercise.exercise);
        const priorPage = priorRequest ? await readWebPriorResults(supabase, priorRequest).catch(() => {
          log.error('[train] Active prior reference unavailable', undefined, { classification: 'read_failure' });
          return { protocolVersion: 1 as const, ownerId: userId, status: 'unavailable' as const, reason: 'service_unavailable' as const };
        }) : null;
        return {
          ...exercise,
          previousSets,
          priorResults: priorRequest && priorPage ? { request: priorRequest, page: priorPage } : null,
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
