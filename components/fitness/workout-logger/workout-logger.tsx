"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { log } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  useActiveWorkout,
  useWeightUnit,
} from "@/lib/hooks/use-active-workout";
import { useRestTimer } from "@/lib/fitness/rest-timer";
import { WorkoutHeader } from "./workout-header";
import { WorkoutExerciseCard } from "./workout-exercise-card";
import { WorkoutAddExercise } from "./workout-add-exercise";
import { WorkoutFinishDialog } from "./workout-finish-dialog";
import { WorkoutDiscardDialog } from "./workout-discard-dialog";

export function WorkoutLogger() {
  const t = useTranslations("workouts");
  const router = useRouter();
  const { workout, error, isLoading, actions } = useActiveWorkout();
  const weightUnit = useWeightUnit();
  const restTimer = useRestTimer();
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [finishDuration, setFinishDuration] = useState(0);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // No active workout — show empty state
  if (!isLoading && !workout) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Dumbbell className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t("noActiveWorkout")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("noActiveWorkoutDescription")}
          </p>
        </div>
        <Button onClick={() => router.push("/workouts")}>
          {t("goToWorkouts")}
        </Button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t("loadError")}</p>
      </div>
    );
  }

  // Loading state
  if (isLoading || !workout) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const handleCompleteSet = async (
    workoutExerciseId: string,
    setId: string,
    restTimerSeconds: number
  ) => {
    try {
      await actions.completeSet(workoutExerciseId, setId);
      if (restTimerSeconds > 0) {
        restTimer.start(restTimerSeconds);
      }
    } catch (error) {
      log.error("Failed to complete set", error);
      toast.error(t("completeSetError"));
    }
  };

  return (
    <div className="relative pb-24">
      {/* Sticky header */}
      <WorkoutHeader
        workout={workout}
        onUpdateWorkout={actions.updateWorkout}
        onFinish={async () => {
          setFinishDuration(
            Math.floor(
              (Date.now() - new Date(workout.started_at).getTime()) / 1000
            )
          );
          setShowFinishDialog(true);
        }}
        onDiscard={async () => setShowDiscardDialog(true)}
        restTimer={restTimer}
      />

      {/* Exercise cards */}
      <div className="space-y-4 px-4 pt-4">
        {workout.exercises.map((exercise) => (
          <WorkoutExerciseCard
            key={exercise.id}
            exercise={exercise}
            weightUnit={weightUnit}
            onAddSet={async () => {
              try { await actions.addSet(exercise.id); }
              catch (error) { log.error("Failed to add set", error); toast.error(t("addSetError")); }
            }}
            onUpdateSet={async (setId, updates) => {
              try { await actions.updateSet(exercise.id, setId, updates); }
              catch (error) { log.error("Failed to update set", error); toast.error(t("updateSetError")); }
            }}
            onDeleteSet={async (setId) => {
              try { await actions.deleteSet(exercise.id, setId); }
              catch (error) { log.error("Failed to delete set", error); toast.error(t("deleteSetError")); }
            }}
            onCompleteSet={(setId) =>
              handleCompleteSet(
                exercise.id,
                setId,
                exercise.rest_timer_seconds
              )
            }
            onUpdateNotes={async (notes) => {
              try { await actions.updateExerciseNotes(exercise.id, notes); }
              catch (error) { log.error("Failed to update notes", error); toast.error(t("updateNotesError")); }
            }}
            onUpdateRestTimer={async (seconds) => {
              try { await actions.updateExerciseRestTimer(exercise.id, seconds); }
              catch (error) { log.error("Failed to update rest timer", error); toast.error(t("updateRestTimerError")); }
            }}
            onRemoveExercise={async () => {
              try { await actions.removeExercise(exercise.id); }
              catch (error) { log.error("Failed to remove exercise", error); toast.error(t("removeExerciseError")); }
            }}
          />
        ))}

        {/* Add Exercise button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setAddExerciseOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("addExercise")}
        </Button>
      </div>

      {/* Exercise picker sheet */}
      <WorkoutAddExercise
        open={addExerciseOpen}
        onOpenChange={setAddExerciseOpen}
        onSelectExercise={async (id) => {
          try { await actions.addExercise(id); }
          catch (error) { log.error("Failed to add exercise", error); toast.error(t("addExerciseError")); }
        }}
        workoutExerciseIds={workout.exercises.map((e) => e.exercise_id)}
      />

      {/* Finish confirmation dialog */}
      <WorkoutFinishDialog
        open={showFinishDialog}
        onOpenChange={setShowFinishDialog}
        workout={workout}
        durationSeconds={finishDuration}
        weightUnit={weightUnit}
        onConfirm={async () => {
          try {
            await actions.finishWorkout();
            setShowFinishDialog(false);
          } catch (error) {
            log.error("Failed to finish workout", error);
            toast.error(t("finishError"));
          }
        }}
      />

      {/* Discard confirmation dialog */}
      <WorkoutDiscardDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        onConfirm={async () => {
          try {
            await actions.discardWorkout();
            setShowDiscardDialog(false);
          } catch (error) {
            log.error("Failed to discard workout", error);
            toast.error(t("discardError"));
          }
        }}
      />
    </div>
  );
}
