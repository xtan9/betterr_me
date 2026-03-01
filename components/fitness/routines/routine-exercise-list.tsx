"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import { displayWeight, toKg } from "@/lib/fitness/units";
import type {
  RoutineExercise,
  Exercise,
  ExerciseType,
  WeightUnit,
} from "@/lib/db/types";

type RoutineExerciseWithExercise = RoutineExercise & { exercise: Exercise };

interface RoutineExerciseListProps {
  exercises: RoutineExerciseWithExercise[];
  onUpdate: (reId: string, updates: Record<string, unknown>) => void;
  onRemove: (reId: string) => void;
  weightUnit: WeightUnit;
}

/** Inline editable row for a single routine exercise. */
function RoutineExerciseRow({
  re,
  onUpdate,
  onRemove,
  weightUnit,
}: {
  re: RoutineExerciseWithExercise;
  onUpdate: (reId: string, updates: Record<string, unknown>) => void;
  onRemove: (reId: string) => void;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("routines");
  const exerciseType = re.exercise.exercise_type as ExerciseType;
  const fieldConfig = EXERCISE_FIELD_MAP[exerciseType];

  // Local state for blur-commit pattern
  const [sets, setSets] = useState(String(re.target_sets));
  const [weight, setWeight] = useState(
    re.target_weight_kg !== null
      ? String(displayWeight(re.target_weight_kg, weightUnit))
      : ""
  );
  const [reps, setReps] = useState(
    re.target_reps !== null ? String(re.target_reps) : ""
  );
  const [duration, setDuration] = useState(
    re.target_duration_seconds !== null
      ? String(re.target_duration_seconds)
      : ""
  );

  const handleBlur = useCallback(
    (field: string, value: string) => {
      const num = value === "" ? null : Number(value);
      if (num !== null && isNaN(num)) return;

      switch (field) {
        case "target_sets":
          if (num !== null && num >= 1) {
            onUpdate(re.id, { target_sets: num });
          }
          break;
        case "target_weight_kg":
          onUpdate(re.id, {
            target_weight_kg: num !== null ? toKg(num, weightUnit) : null,
          });
          break;
        case "target_reps":
          onUpdate(re.id, { target_reps: num });
          break;
        case "target_duration_seconds":
          onUpdate(re.id, { target_duration_seconds: num });
          break;
      }
    },
    [re.id, onUpdate, weightUnit]
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-medium">
            {re.exercise.name}
          </span>
          {re.rest_timer_seconds > 0 && (
            <span className="text-xs text-muted-foreground shrink-0 ml-2">
              {re.rest_timer_seconds}s {t("rest")}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sets - always shown */}
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">
              {t("setsLabel")}
            </Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              onBlur={() => handleBlur("target_sets", sets)}
              className="h-7 w-14 text-xs"
            />
          </div>

          {/* Weight - if applicable */}
          {fieldConfig.showWeight && (
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">
                {weightUnit}
              </Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onBlur={() => handleBlur("target_weight_kg", weight)}
                className="h-7 w-16 text-xs"
                placeholder="0"
              />
            </div>
          )}

          {/* Reps - if applicable */}
          {fieldConfig.showReps && (
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">
                {t("repsLabel")}
              </Label>
              <Input
                type="number"
                min={0}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                onBlur={() => handleBlur("target_reps", reps)}
                className="h-7 w-14 text-xs"
                placeholder="0"
              />
            </div>
          )}

          {/* Duration - if applicable */}
          {fieldConfig.showDuration && (
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">
                {t("durationLabel")}
              </Label>
              <Input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                onBlur={() => handleBlur("target_duration_seconds", duration)}
                className="h-7 w-16 text-xs"
                placeholder="0s"
              />
            </div>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(re.id)}
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">{t("removeExercise")}</span>
      </Button>
    </div>
  );
}

export function RoutineExerciseList({
  exercises,
  onUpdate,
  onRemove,
  weightUnit,
}: RoutineExerciseListProps) {
  const t = useTranslations("routines");

  if (exercises.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {t("noExercises")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {exercises.map((re) => (
        <RoutineExerciseRow
          key={re.id}
          re={re}
          onUpdate={onUpdate}
          onRemove={onRemove}
          weightUnit={weightUnit}
        />
      ))}
    </div>
  );
}
