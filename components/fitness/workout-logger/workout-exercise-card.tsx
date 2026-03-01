"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import type { WorkoutSetUpdate, WeightUnit, ExerciseType } from "@/lib/db/types";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import { isNewPR, type PRCheckResult } from "@/lib/fitness/personal-records";
import { useExerciseRecords } from "@/lib/hooks/use-exercise-history";
import type { WorkoutExerciseWithPrevious } from "@/lib/hooks/use-active-workout";
import { PRBanner } from "@/components/fitness/progress/pr-banner";
import { WorkoutSetRow } from "./workout-set-row";

interface WorkoutExerciseCardProps {
  exercise: WorkoutExerciseWithPrevious;
  weightUnit: WeightUnit;
  onAddSet: () => Promise<void>;
  onUpdateSet: (setId: string, updates: WorkoutSetUpdate) => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
  onCompleteSet: (setId: string) => Promise<void>;
  onUpdateNotes: (notes: string) => Promise<void>;
  onUpdateRestTimer: (seconds: number) => Promise<void>;
  onRemoveExercise: () => Promise<void>;
}

const REST_TIMER_PRESETS = [30, 60, 90, 120, 180, 300];

export function WorkoutExerciseCard({
  exercise,
  weightUnit,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onCompleteSet,
  onUpdateNotes,
  onUpdateRestTimer,
  onRemoveExercise,
}: WorkoutExerciseCardProps) {
  const t = useTranslations("workouts");
  const tExercises = useTranslations("exercises");
  const [notesOpen, setNotesOpen] = useState(!!exercise.notes);
  const [notesValue, setNotesValue] = useState(exercise.notes ?? "");
  const [restTimerPopoverOpen, setRestTimerPopoverOpen] = useState(false);
  const [prBanner, setPrBanner] = useState<{
    prType: "weight" | "volume" | "reps" | "duration";
    value: number;
  } | null>(null);

  const exerciseInfo = exercise.exercise;
  const previousSets = exercise.previousSets ?? [];

  // Fetch current PR for this exercise (for mid-workout PR detection)
  // Skip PR detection when records fetch fails to avoid false-positive banners
  const { records: currentPR, error: recordsError } = useExerciseRecords(exerciseInfo.id);

  // Wrap onCompleteSet to check for PR before the async mutation (snapshot value before async mutation)
  const handleCompleteSetWithPR = useCallback(
    async (setId: string) => {
      // Capture set data BEFORE the async mutation
      const completedSet = exercise.sets.find((s) => s.id === setId);
      if (completedSet && !recordsError) {
        const setSnapshot = { ...completedSet, is_completed: true };
        const prResult: PRCheckResult = isNewPR(
          setSnapshot,
          exerciseInfo.exercise_type,
          currentPR
        );

        // Determine the most significant PR to show
        if (prResult.isWeightPR && setSnapshot.weight_kg != null) {
          setPrBanner({ prType: "weight", value: setSnapshot.weight_kg });
        } else if (
          prResult.isVolumePR &&
          setSnapshot.weight_kg != null &&
          setSnapshot.reps != null
        ) {
          setPrBanner({
            prType: "volume",
            value: setSnapshot.weight_kg * setSnapshot.reps,
          });
        } else if (prResult.isRepsPR && setSnapshot.reps != null) {
          setPrBanner({ prType: "reps", value: setSnapshot.reps });
        } else if (
          prResult.isDurationPR &&
          setSnapshot.duration_seconds != null
        ) {
          setPrBanner({
            prType: "duration",
            value: setSnapshot.duration_seconds,
          });
        }
      }

      // Fire the actual completion (async mutation)
      await onCompleteSet(setId);
    },
    [exercise.sets, exerciseInfo.exercise_type, currentPR, recordsError, onCompleteSet]
  );

  const handleNotesBlur = () => {
    const trimmed = notesValue.trim();
    if (trimmed !== (exercise.notes ?? "")) {
      void onUpdateNotes(trimmed).catch(() => toast.error(t("updateNotesError")));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{exerciseInfo.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {tExercises(
                  `muscleGroups.${exerciseInfo.muscle_group_primary}`
                )}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {tExercises(
                  `exerciseTypes.${exerciseInfo.exercise_type}`
                )}
              </Badge>
              <Popover
                open={restTimerPopoverOpen}
                onOpenChange={setRestTimerPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground"
                  >
                    <Timer className="h-3 w-3" />
                    {exercise.rest_timer_seconds}s
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <p className="mb-2 text-xs font-medium">
                    {t("restTimerEdit")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {REST_TIMER_PRESETS.map((seconds) => (
                      <Button
                        key={seconds}
                        variant={
                          exercise.rest_timer_seconds === seconds
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          void onUpdateRestTimer(seconds).catch(() => toast.error(t("updateRestTimerError")));
                          setRestTimerPopoverOpen(false);
                        }}
                      >
                        {seconds}s
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            onClick={() => void onRemoveExercise().catch(() => toast.error(t("removeExerciseError")))}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">{t("removeExercise")}</span>
          </Button>
        </div>

        {/* Exercise notes */}
        <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {notesOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {t("exerciseNotes")}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder={t("exerciseNotesPlaceholder")}
              className="mt-1 min-h-[40px] text-xs"
            />
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>

      <CardContent className="space-y-1 pb-3">
        {/* PR banner (shown inline when a new PR is detected) */}
        {prBanner && (
          <PRBanner
            exerciseName={exerciseInfo.name}
            prType={prBanner.prType}
            value={prBanner.value}
            weightUnit={weightUnit}
            onDismiss={() => setPrBanner(null)}
          />
        )}

        {/* Column headers */}
        <SetColumnHeaders
          exerciseType={exerciseInfo.exercise_type}
          weightUnit={weightUnit}
        />

        {/* Set rows */}
        {exercise.sets.map((set, index) => (
          <WorkoutSetRow
            key={set.id}
            set={set}
            exerciseType={exerciseInfo.exercise_type}
            weightUnit={weightUnit}
            previousSet={previousSets[index] ?? null}
            onUpdate={(updates) => onUpdateSet(set.id, updates)}
            onDelete={() => onDeleteSet(set.id)}
            onComplete={() => handleCompleteSetWithPR(set.id)}
          />
        ))}

        {/* Add set button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => void onAddSet().catch(() => toast.error(t("addSetError")))}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("addSet")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Column headers for set rows
// ---------------------------------------------------------------------------

function SetColumnHeaders({
  exerciseType,
  weightUnit,
}: {
  exerciseType: ExerciseType;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("workouts");
  const fields = EXERCISE_FIELD_MAP[exerciseType];

  // Count dynamic columns for grid sizing
  const dynamicCols = [
    fields.showWeight,
    fields.showReps,
    fields.showDuration,
    fields.showDistance,
  ].filter(Boolean).length;

  const gridClass =
    dynamicCols === 1
      ? "grid-cols-[40px_1fr_1fr_36px]"
      : dynamicCols === 2
        ? "grid-cols-[40px_1fr_1fr_1fr_36px]"
        : "grid-cols-[40px_1fr_1fr_1fr_1fr_36px]";

  return (
    <div
      className={`grid ${gridClass} items-center gap-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground`}
    >
      <span>{t("set")}</span>
      <span>{t("previous")}</span>
      {fields.showWeight && <span>{weightUnit.toUpperCase()}</span>}
      {fields.showReps && <span>{t("reps")}</span>}
      {fields.showDuration && <span>{t("duration")}</span>}
      {fields.showDistance && <span>{t("distance")}</span>}
      <span className="text-center">
        <span className="sr-only">{t("complete")}</span>
      </span>
    </div>
  );
}
