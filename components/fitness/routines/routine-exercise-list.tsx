"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import { useWeightInput } from "@/components/fitness/use-weight-input";
import { parseWholeInput } from "@/lib/fitness/measurement-input";
import type {
  RoutineExercise,
  Exercise,
  ExerciseType,
  WeightUnit,
} from "@/lib/db/types";

type RoutineExerciseWithExercise = RoutineExercise & { exercise: Exercise };

interface RoutineExerciseListProps {
  exercises: RoutineExerciseWithExercise[];
  onUpdate: (reId: string, updates: Record<string, unknown>) => void | Promise<void>;
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
  onUpdate: (reId: string, updates: Record<string, unknown>) => void | Promise<void>;
  onRemove: (reId: string) => void;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("routines");
  const exerciseType = re.exercise.exercise_type as ExerciseType;
  const fieldConfig = EXERCISE_FIELD_MAP[exerciseType];

  // Local state for blur-commit pattern
  const [sets, setSets] = useState(String(re.target_sets));
  const weight = useWeightInput(re.id, re.target_weight_kg, weightUnit);
  const [reps, setReps] = useState(
    re.target_reps !== null ? String(re.target_reps) : ""
  );
  const [duration, setDuration] = useState(
    re.target_duration_seconds !== null
      ? String(re.target_duration_seconds)
      : ""
  );

  const handleBlur = useCallback(
    (field: "target_sets" | "target_reps" | "target_duration_seconds", value: string) => {
      const num = parseWholeInput(value, field === "target_sets" ? 1 : 0,
        field === "target_sets" ? 20 : field === "target_duration_seconds" ? 86400 : Number.MAX_SAFE_INTEGER);
      if (num === undefined || field === "target_sets" && num === null || num === re[field]) return;
      onUpdate(re.id, { [field]: num });
    },
    [re, onUpdate]
  );

  return (
    <div className="flex items-center gap-3 rounded-card border p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="truncate text-body font-medium">
            {re.exercise.name}
          </span>
          {re.rest_timer_seconds !== null && re.rest_timer_seconds > 0 && (
            <span className="text-caption text-muted-foreground shrink-0 ml-2">
              {re.rest_timer_seconds}s {t("rest")}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sets - always shown */}
          <div className="flex items-center gap-1">
            <Label className="text-caption text-muted-foreground">
              {t("setsLabel")}
            </Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              onBlur={() => handleBlur("target_sets", sets)}
              className="h-7 w-14 text-caption"
            />
          </div>

          {/* Weight - if applicable */}
          {fieldConfig.showWeight && (
            <div className="flex items-center gap-1">
              <Label className="text-caption text-muted-foreground">
                {weight.unit}
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                aria-label={`${t("targetWeight")} (${weight.unit})`}
                aria-invalid={!weight.valid}
                value={weight.value}
                onChange={(e) => weight.change(e.target.value)}
                onBlur={() => {
                  if (!weight.edited || !weight.valid) return;
                  if (weight.anchorKg === re.target_weight_kg) { weight.acknowledge(); return; }
                  const saving = onUpdate(re.id, { target_weight_kg: weight.anchorKg });
                  // The form owns save-error presentation; failed edits stay retryable.
                  if (saving) void saving.then(weight.acknowledge, () => {});
                  else weight.acknowledge();
                }}
                className="h-7 w-16 text-caption"
                placeholder="0"
              />
              {weight.unit !== weightUnit && <p className="text-caption text-muted-foreground">{t("inputUnitKept", { unit: weight.unit })}</p>}
              {!weight.valid && <p className="text-caption text-destructive">{t("measurementInvalid")}</p>}
            </div>
          )}

          {/* Reps - if applicable */}
          {fieldConfig.showReps && (
            <div className="flex items-center gap-1">
              <Label className="text-caption text-muted-foreground">
                {t("repsLabel")}
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                aria-label={t("targetReps")}
                aria-invalid={parseWholeInput(reps, 0, Number.MAX_SAFE_INTEGER) === undefined}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                onBlur={() => handleBlur("target_reps", reps)}
                className="h-7 w-14 text-caption"
                placeholder="0"
              />
            </div>
          )}

          {/* Duration - if applicable */}
          {fieldConfig.showDuration && (
            <div className="flex items-center gap-1">
              <Label className="text-caption text-muted-foreground">
                {t("durationLabel")}
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                aria-label={t("targetDuration")}
                aria-invalid={parseWholeInput(duration, 0, 86400) === undefined}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                onBlur={() => handleBlur("target_duration_seconds", duration)}
                className="h-7 w-16 text-caption"
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
      <p className="py-4 text-center text-body text-muted-foreground">
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
