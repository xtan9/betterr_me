import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RoutineWithExercises,
  Workout,
  WorkoutWithExercises,
} from "@/lib/db/types";
import { RoutinesDB } from "@/lib/db/routines";
import {
  RoutineToWorkoutConversion,
  UnsupportedRoutineDataError,
} from "@/lib/fitness/routine-workout-conversion";
import { SupabaseRoutineWorkoutStore } from "@/lib/fitness/supabase-routine-workout-store";
import { log } from "@/lib/logger";

export type WorkoutStartSource =
  | { type: "blank"; title?: string }
  | { type: "routine"; routineId: string };

export interface WorkoutStartRequest {
  userId: string;
  source: WorkoutStartSource;
}

export type WorkoutStartRecord = Workout | WorkoutWithExercises;

export type WorkoutStartPersistenceOutcome<T extends WorkoutStartRecord> =
  | { type: "started"; workout: T }
  | { type: "conflict" };

export interface WorkoutStartPersistence {
  startBlank(
    userId: string,
    title: string,
  ): Promise<WorkoutStartPersistenceOutcome<Workout>>;
  getRoutine(
    routineId: string,
    userId: string,
  ): Promise<RoutineWithExercises | null>;
  startRoutine(
    userId: string,
    routine: RoutineWithExercises,
  ): Promise<WorkoutStartPersistenceOutcome<WorkoutWithExercises>>;
  markRoutinePerformed?(
    routineId: string,
    userId: string,
    performedAt: string,
  ): Promise<void>;
}

export type WorkoutStartOutcome =
  | { type: "started"; workout: WorkoutStartRecord }
  | { type: "conflict" }
  | { type: "not-found" }
  | { type: "invalid-source"; message: string };

type Clock = () => Date;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeRequest(
  request: WorkoutStartRequest,
):
  | { ok: true; userId: string; source: WorkoutStartSource }
  | { ok: false; message: string } {
  if (!isRecord(request) || typeof request.userId !== "string") {
    return { ok: false, message: "User identity is required" };
  }

  const userId = request.userId.trim();
  if (!userId) return { ok: false, message: "User identity is required" };

  if (!isRecord(request.source) || typeof request.source.type !== "string") {
    return { ok: false, message: "Workout source is required" };
  }

  if (request.source.type === "blank") {
    if (
      request.source.title !== undefined &&
      typeof request.source.title !== "string"
    ) {
      return { ok: false, message: "Workout title must be text" };
    }

    const title = request.source.title?.trim();
    if (title && title.length > 100) {
      return {
        ok: false,
        message: "Workout title must be 100 characters or less",
      };
    }

    return {
      ok: true,
      userId,
      source: { type: "blank", ...(title ? { title } : {}) },
    };
  }

  if (request.source.type === "routine") {
    if (typeof request.source.routineId !== "string") {
      return { ok: false, message: "Routine identity is required" };
    }
    const routineId = request.source.routineId.trim();
    if (!routineId) {
      return { ok: false, message: "Routine identity is required" };
    }
    return { ok: true, userId, source: { type: "routine", routineId } };
  }

  return { ok: false, message: "Workout source is invalid" };
}

export class WorkoutWrites {
  constructor(
    private readonly persistence: WorkoutStartPersistence,
    private readonly now: Clock = () => new Date(),
  ) {}

  async start(request: WorkoutStartRequest): Promise<WorkoutStartOutcome> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      return { type: "invalid-source", message: normalized.message };
    }

    if (normalized.source.type === "blank") {
      return this.persistence.startBlank(
        normalized.userId,
        normalized.source.title ?? "Workout",
      );
    }

    const routine = await this.persistence.getRoutine(
      normalized.source.routineId,
      normalized.userId,
    );
    if (!routine) return { type: "not-found" };

    let outcome: WorkoutStartPersistenceOutcome<WorkoutWithExercises>;
    try {
      outcome = await this.persistence.startRoutine(normalized.userId, routine);
    } catch (error) {
      if (isUnsupportedRoutineDataError(error)) {
        return { type: "invalid-source", message: error.message };
      }
      throw error;
    }

    if (outcome.type === "conflict") return outcome;

    if (this.persistence.markRoutinePerformed) {
      try {
        await this.persistence.markRoutinePerformed(
          normalized.source.routineId,
          normalized.userId,
          this.now().toISOString(),
        );
      } catch (error) {
        log.error("Failed to update routine last_performed_at", error, {
          routineId: normalized.source.routineId,
        });
      }
    }

    return outcome;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

function isUnsupportedRoutineDataError(
  error: unknown,
): error is UnsupportedRoutineDataError {
  const isInstance =
    typeof UnsupportedRoutineDataError === "function" &&
    error instanceof UnsupportedRoutineDataError;
  return (
    isInstance ||
    (isRecord(error) && error.code === "UNSUPPORTED_ROUTINE_DATA")
  );
}

export class SupabaseWorkoutStartPersistence
  implements WorkoutStartPersistence
{
  private readonly routines: RoutinesDB;
  private readonly routineConversion: RoutineToWorkoutConversion;

  constructor(private readonly supabase: SupabaseClient) {
    this.routines = new RoutinesDB(supabase);
    this.routineConversion = new RoutineToWorkoutConversion(
      new SupabaseRoutineWorkoutStore(supabase),
    );
  }

  async startBlank(
    userId: string,
    title: string,
  ): Promise<WorkoutStartPersistenceOutcome<Workout>> {
    const { data, error } = await this.supabase
      .from("workouts")
      .insert({
        user_id: userId,
        title,
        status: "in_progress" as const,
        started_at: new Date().toISOString(),
        routine_id: null,
      })
      .select()
      .single();

    if (error) {
      if (isUniqueViolation(error)) return { type: "conflict" };
      log.error("Failed to start workout", error);
      throw error;
    }

    return { type: "started", workout: data };
  }

  getRoutine(
    routineId: string,
    userId: string,
  ): Promise<RoutineWithExercises | null> {
    return this.routines.getRoutine(routineId, userId);
  }

  async startRoutine(
    userId: string,
    routine: RoutineWithExercises,
  ): Promise<WorkoutStartPersistenceOutcome<WorkoutWithExercises>> {
    try {
      const workout = await this.routineConversion.start(userId, routine);
      return { type: "started", workout };
    } catch (error) {
      if (isUniqueViolation(error)) return { type: "conflict" };
      throw error;
    }
  }

  updateRoutineLastPerformedAt(
    routineId: string,
    userId: string,
    performedAt: string,
  ): Promise<void> {
    return this.routines.updateRoutineLastPerformedAt(
      routineId,
      userId,
      performedAt,
    );
  }

  markRoutinePerformed(
    routineId: string,
    userId: string,
    performedAt: string,
  ): Promise<void> {
    return this.updateRoutineLastPerformedAt(routineId, userId, performedAt);
  }
}

export function createWorkoutWrites(supabase: SupabaseClient): WorkoutWrites {
  return new WorkoutWrites(new SupabaseWorkoutStartPersistence(supabase));
}
