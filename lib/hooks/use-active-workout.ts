"use client";

import { useCallback } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { fetcher } from "@/lib/fetcher";
import type {
  WorkoutWithExercises,
  WorkoutExerciseWithDetails,
  WorkoutSet,
  WorkoutSetUpdate,
  WeightUnit,
} from "@/lib/db/types";
import {
  saveWorkoutToStorage,
  clearWorkoutStorage,
} from "@/lib/fitness/workout-session";

// ---------------------------------------------------------------------------
// Extended types for API response (includes previousSets enrichment)
// ---------------------------------------------------------------------------

export interface WorkoutExerciseWithPrevious extends WorkoutExerciseWithDetails {
  previousSets: WorkoutSet[];
}

export interface ActiveWorkout extends Omit<WorkoutWithExercises, "exercises"> {
  exercises: WorkoutExerciseWithPrevious[];
}

interface ActiveWorkoutResponse {
  workout: ActiveWorkout | null;
}

// ---------------------------------------------------------------------------
// useActiveWorkout — SWR hook with optimistic mutations + localStorage dual-write
// ---------------------------------------------------------------------------

export interface UseActiveWorkoutActions {
  startWorkout: (title?: string) => Promise<void>;
  addExercise: (exerciseId: string, restTimerSeconds?: number) => Promise<void>;
  removeExercise: (workoutExerciseId: string) => Promise<void>;
  addSet: (workoutExerciseId: string) => Promise<void>;
  updateSet: (
    workoutExerciseId: string,
    setId: string,
    updates: WorkoutSetUpdate
  ) => Promise<void>;
  deleteSet: (workoutExerciseId: string, setId: string) => Promise<void>;
  completeSet: (
    workoutExerciseId: string,
    setId: string
  ) => Promise<boolean>;
  updateExerciseNotes: (
    workoutExerciseId: string,
    notes: string
  ) => Promise<void>;
  updateExerciseRestTimer: (
    workoutExerciseId: string,
    seconds: number
  ) => Promise<void>;
  updateWorkout: (updates: {
    title?: string;
    notes?: string | null;
  }) => Promise<void>;
  finishWorkout: () => Promise<void>;
  discardWorkout: () => Promise<void>;
}

export interface UseActiveWorkoutReturn {
  workout: ActiveWorkout | null;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<ActiveWorkoutResponse>;
  actions: UseActiveWorkoutActions;
}

const SWR_KEY = "/api/workouts/active";

export function useActiveWorkout(): UseActiveWorkoutReturn {
  const { data, error, isLoading, mutate } = useSWR<ActiveWorkoutResponse>(
    SWR_KEY,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const workout = data?.workout ?? null;

  // ---------------------------------------------------------------------------
  // Helper: dual-write after optimistic update
  // ---------------------------------------------------------------------------
  const dualWrite = useCallback((updated: ActiveWorkout | null) => {
    if (updated) {
      saveWorkoutToStorage(updated as unknown as WorkoutWithExercises);
    } else {
      clearWorkoutStorage();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // startWorkout
  // ---------------------------------------------------------------------------
  const startWorkout = useCallback(
    async (title?: string) => {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to start workout");
      // Revalidate to get the full workout with exercises
      await mutate();
    },
    [mutate]
  );

  // ---------------------------------------------------------------------------
  // addExercise
  // ---------------------------------------------------------------------------
  const addExercise = useCallback(
    async (exerciseId: string, restTimerSeconds?: number) => {
      if (!workout) return;

      await mutate(
        async () => {
          const res = await fetch(
            `/api/workouts/${workout.id}/exercises`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                exercise_id: exerciseId,
                rest_timer_seconds: restTimerSeconds,
              }),
            }
          );
          if (!res.ok) throw new Error("Failed to add exercise");
          // Revalidate to get the exercise with details, previous sets, etc.
          const activeRes = await fetch(SWR_KEY);
          const activeData = (await activeRes.json()) as ActiveWorkoutResponse;
          if (activeData.workout) dualWrite(activeData.workout);
          return activeData;
        },
        { revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // removeExercise
  // ---------------------------------------------------------------------------
  const removeExercise = useCallback(
    async (workoutExerciseId: string) => {
      if (!workout) return;

      const optimistic: ActiveWorkoutResponse = {
        workout: {
          ...workout,
          exercises: workout.exercises.filter(
            (e) => e.id !== workoutExerciseId
          ),
        },
      };

      await mutate(
        async () => {
          const res = await fetch(
            `/api/workouts/${workout.id}/exercises/${workoutExerciseId}`,
            { method: "DELETE" }
          );
          if (!res.ok) throw new Error("Failed to remove exercise");
          dualWrite(optimistic.workout);
          return optimistic;
        },
        { optimisticData: optimistic, revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // addSet
  // ---------------------------------------------------------------------------
  const addSet = useCallback(
    async (workoutExerciseId: string) => {
      if (!workout) return;

      await mutate(
        async () => {
          const res = await fetch(
            `/api/workouts/${workout.id}/exercises/${workoutExerciseId}/sets`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }
          );
          if (!res.ok) throw new Error("Failed to add set");
          const { set } = (await res.json()) as { set: WorkoutSet };

          const updated: ActiveWorkoutResponse = {
            workout: {
              ...workout,
              exercises: workout.exercises.map((e) =>
                e.id === workoutExerciseId
                  ? { ...e, sets: [...e.sets, set] }
                  : e
              ),
            },
          };
          dualWrite(updated.workout);
          return updated;
        },
        { revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // updateSet — uses revalidate: false to prevent Pitfall 4 race conditions
  // ---------------------------------------------------------------------------
  const updateSet = useCallback(
    async (
      workoutExerciseId: string,
      setId: string,
      updates: WorkoutSetUpdate
    ) => {
      if (!workout) return;

      const optimistic: ActiveWorkoutResponse = {
        workout: {
          ...workout,
          exercises: workout.exercises.map((e) =>
            e.id === workoutExerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s) =>
                    s.id === setId ? { ...s, ...updates } : s
                  ),
                }
              : e
          ),
        },
      };

      await mutate(
        async () => {
          const res = await fetch(
            `/api/workouts/${workout.id}/exercises/${workoutExerciseId}/sets/${setId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            }
          );
          if (!res.ok) throw new Error("Failed to update set");
          const { set } = (await res.json()) as { set: WorkoutSet };

          const updated: ActiveWorkoutResponse = {
            workout: {
              ...workout,
              exercises: workout.exercises.map((e) =>
                e.id === workoutExerciseId
                  ? {
                      ...e,
                      sets: e.sets.map((s) => (s.id === setId ? set : s)),
                    }
                  : e
              ),
            },
          };
          dualWrite(updated.workout);
          return updated;
        },
        { optimisticData: optimistic, revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // deleteSet
  // ---------------------------------------------------------------------------
  const deleteSet = useCallback(
    async (workoutExerciseId: string, setId: string) => {
      if (!workout) return;

      const optimistic: ActiveWorkoutResponse = {
        workout: {
          ...workout,
          exercises: workout.exercises.map((e) =>
            e.id === workoutExerciseId
              ? { ...e, sets: e.sets.filter((s) => s.id !== setId) }
              : e
          ),
        },
      };

      await mutate(
        async () => {
          const res = await fetch(
            `/api/workouts/${workout.id}/exercises/${workoutExerciseId}/sets/${setId}`,
            { method: "DELETE" }
          );
          if (!res.ok) throw new Error("Failed to delete set");
          dualWrite(optimistic.workout);
          return optimistic;
        },
        { optimisticData: optimistic, revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // completeSet — shortcut for updateSet with is_completed: true, returns true
  // to signal rest timer should start
  // ---------------------------------------------------------------------------
  const completeSet = useCallback(
    async (workoutExerciseId: string, setId: string): Promise<boolean> => {
      await updateSet(workoutExerciseId, setId, { is_completed: true });
      return true;
    },
    [updateSet]
  );

  // ---------------------------------------------------------------------------
  // updateExerciseNotes
  // ---------------------------------------------------------------------------
  const updateExerciseNotes = useCallback(
    async (workoutExerciseId: string, notes: string) => {
      if (!workout) return;

      const optimistic: ActiveWorkoutResponse = {
        workout: {
          ...workout,
          exercises: workout.exercises.map((e) =>
            e.id === workoutExerciseId ? { ...e, notes } : e
          ),
        },
      };

      await mutate(
        async () => {
          const res = await fetch(
            `/api/workouts/${workout.id}/exercises/${workoutExerciseId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ notes }),
            }
          );
          if (!res.ok) throw new Error("Failed to update exercise notes");
          dualWrite(optimistic.workout);
          return optimistic;
        },
        { optimisticData: optimistic, revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // updateExerciseRestTimer
  // ---------------------------------------------------------------------------
  const updateExerciseRestTimer = useCallback(
    async (workoutExerciseId: string, seconds: number) => {
      if (!workout) return;

      const optimistic: ActiveWorkoutResponse = {
        workout: {
          ...workout,
          exercises: workout.exercises.map((e) =>
            e.id === workoutExerciseId
              ? { ...e, rest_timer_seconds: seconds }
              : e
          ),
        },
      };

      await mutate(
        async () => {
          const res = await fetch(
            `/api/workouts/${workout.id}/exercises/${workoutExerciseId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rest_timer_seconds: seconds }),
            }
          );
          if (!res.ok) throw new Error("Failed to update rest timer");
          dualWrite(optimistic.workout);
          return optimistic;
        },
        { optimisticData: optimistic, revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // updateWorkout — update title or notes
  // ---------------------------------------------------------------------------
  const updateWorkout = useCallback(
    async (updates: { title?: string; notes?: string | null }) => {
      if (!workout) return;

      const optimistic: ActiveWorkoutResponse = {
        workout: { ...workout, ...updates },
      };

      await mutate(
        async () => {
          const res = await fetch(`/api/workouts/${workout.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
          if (!res.ok) throw new Error("Failed to update workout");
          dualWrite(optimistic.workout);
          return optimistic;
        },
        { optimisticData: optimistic, revalidate: false }
      );
    },
    [workout, mutate, dualWrite]
  );

  // ---------------------------------------------------------------------------
  // finishWorkout
  // ---------------------------------------------------------------------------
  const finishWorkout = useCallback(async () => {
    if (!workout) return;

    await mutate(
      async () => {
        const res = await fetch(`/api/workouts/${workout.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        if (!res.ok) throw new Error("Failed to finish workout");
        clearWorkoutStorage();
        return { workout: null };
      },
      { revalidate: false }
    );
  }, [workout, mutate]);

  // ---------------------------------------------------------------------------
  // discardWorkout
  // ---------------------------------------------------------------------------
  const discardWorkout = useCallback(async () => {
    if (!workout) return;

    await mutate(
      async () => {
        const res = await fetch(`/api/workouts/${workout.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "discarded" }),
        });
        if (!res.ok) throw new Error("Failed to discard workout");
        clearWorkoutStorage();
        return { workout: null };
      },
      { revalidate: false }
    );
  }, [workout, mutate]);

  // ---------------------------------------------------------------------------
  // Actions object
  // ---------------------------------------------------------------------------
  const actions: UseActiveWorkoutActions = {
    startWorkout,
    addExercise,
    removeExercise,
    addSet,
    updateSet,
    deleteSet,
    completeSet,
    updateExerciseNotes,
    updateExerciseRestTimer,
    updateWorkout,
    finishWorkout,
    discardWorkout,
  };

  return {
    workout,
    error,
    isLoading,
    mutate,
    actions,
  };
}

// ---------------------------------------------------------------------------
// useWeightUnit — reads weight_unit from profile SWR cache
// ---------------------------------------------------------------------------

export function useWeightUnit(): WeightUnit {
  const { data } = useSWR<{ preferences?: { weight_unit?: string } }>(
    "/api/profile",
    fetcher,
    {
      dedupingInterval: 600000, // 10 min — profile rarely changes
      revalidateOnFocus: false,
    }
  );
  return (data?.preferences?.weight_unit as WeightUnit) ?? "kg";
}
