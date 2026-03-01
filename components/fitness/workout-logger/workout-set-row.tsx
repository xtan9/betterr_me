"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  WorkoutSet,
  WorkoutSetUpdate,
  SetType,
  ExerciseType,
  WeightUnit,
} from "@/lib/db/types";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import { displayWeight, toKg, formatWeight } from "@/lib/fitness/units";

// ---------------------------------------------------------------------------
// Set type configuration
// ---------------------------------------------------------------------------

const SET_TYPE_CONFIG: Record<
  SetType,
  { label: string; color: string; shortLabel: string }
> = {
  warmup: { label: "warmup", color: "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950", shortLabel: "W" },
  normal: { label: "normal", color: "text-foreground bg-muted", shortLabel: "" },
  drop: { label: "dropSet", color: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950", shortLabel: "D" },
  failure: { label: "failure", color: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950", shortLabel: "F" },
};

const SET_TYPES: SetType[] = ["warmup", "normal", "drop", "failure"];

// ---------------------------------------------------------------------------
// WorkoutSetRow
// ---------------------------------------------------------------------------

interface WorkoutSetRowProps {
  set: WorkoutSet;
  exerciseType: ExerciseType;
  weightUnit: WeightUnit;
  previousSet: WorkoutSet | null;
  onUpdate: (updates: WorkoutSetUpdate) => Promise<void>;
  onDelete: () => Promise<void>;
  onComplete: () => Promise<void>;
}

export function WorkoutSetRow({
  set,
  exerciseType,
  weightUnit,
  previousSet,
  onUpdate,
  onDelete,
  onComplete,
}: WorkoutSetRowProps) {
  const t = useTranslations("workouts");
  const fields = EXERCISE_FIELD_MAP[exerciseType];
  const typeConfig = SET_TYPE_CONFIG[set.set_type];
  const [typeOpen, setTypeOpen] = useState(false);

  // Local state for inputs to allow fast typing (optimistic blur-on-commit updates)
  const [localWeight, setLocalWeight] = useState(
    set.weight_kg != null ? String(displayWeight(set.weight_kg, weightUnit)) : ""
  );
  const [localReps, setLocalReps] = useState(
    set.reps != null ? String(set.reps) : ""
  );
  const [localDuration, setLocalDuration] = useState(
    set.duration_seconds != null ? String(set.duration_seconds) : ""
  );
  const [localDistance, setLocalDistance] = useState(
    set.distance_meters != null ? String(set.distance_meters) : ""
  );

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

  // ---------------------------------------------------------------------------
  // Input blur handlers — commit value to API
  // ---------------------------------------------------------------------------

  const handleWeightBlur = useCallback(() => {
    const parsed = parseFloat(localWeight);
    const kg = isNaN(parsed) ? null : toKg(parsed, weightUnit);
    if (kg !== set.weight_kg) {
      void onUpdate({ weight_kg: kg }).catch(() => toast.error(t("updateSetError")));
    }
  }, [localWeight, weightUnit, set.weight_kg, onUpdate, t]);

  const handleRepsBlur = useCallback(() => {
    const parsed = parseInt(localReps, 10);
    const value = isNaN(parsed) ? null : parsed;
    if (value !== set.reps) {
      void onUpdate({ reps: value }).catch(() => toast.error(t("updateSetError")));
    }
  }, [localReps, set.reps, onUpdate, t]);

  const handleDurationBlur = useCallback(() => {
    const parsed = parseInt(localDuration, 10);
    const value = isNaN(parsed) ? null : parsed;
    if (value !== set.duration_seconds) {
      void onUpdate({ duration_seconds: value }).catch(() => toast.error(t("updateSetError")));
    }
  }, [localDuration, set.duration_seconds, onUpdate, t]);

  const handleDistanceBlur = useCallback(() => {
    const parsed = parseFloat(localDistance);
    const value = isNaN(parsed) ? null : parsed;
    if (value !== set.distance_meters) {
      void onUpdate({ distance_meters: value }).catch(() => toast.error(t("updateSetError")));
    }
  }, [localDistance, set.distance_meters, onUpdate, t]);

  const handleSetTypeChange = useCallback(
    (newType: SetType) => {
      setTypeOpen(false);
      if (newType !== set.set_type) {
        void onUpdate({ set_type: newType }).catch(() => toast.error(t("updateSetError")));
      }
    },
    [set.set_type, onUpdate, t]
  );

  const handleCheckChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        void onComplete().catch(() => toast.error(t("completeSetError")));
      } else {
        void onUpdate({ is_completed: false }).catch(() => toast.error(t("updateSetError")));
      }
    },
    [onComplete, onUpdate, t]
  );

  // ---------------------------------------------------------------------------
  // Previous values display
  // ---------------------------------------------------------------------------
  const previousDisplay = previousSet
    ? formatPreviousSet(previousSet, fields.showWeight, weightUnit)
    : "\u2014";

  return (
    <div
      className={`group grid ${gridClass} items-center gap-1 rounded px-1 py-0.5 ${
        set.is_completed ? "opacity-60" : ""
      }`}
    >
      {/* Set number badge with type selector */}
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex h-7 w-9 items-center justify-center rounded text-xs font-semibold ${typeConfig.color}`}
          >
            {typeConfig.shortLabel || set.set_number}
            {typeConfig.shortLabel && (
              <span className="ml-0.5 text-[9px]">{set.set_number}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="start">
          <div className="space-y-0.5">
            {SET_TYPES.map((type) => {
              const cfg = SET_TYPE_CONFIG[type];
              return (
                <button
                  key={type}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent ${
                    set.set_type === type ? "bg-accent" : ""
                  }`}
                  onClick={() => handleSetTypeChange(type)}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold ${cfg.color}`}
                  >
                    {cfg.shortLabel || "#"}
                  </span>
                  {t(cfg.label)}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Previous values */}
      <span className="truncate text-xs text-muted-foreground">
        {previousDisplay}
      </span>

      {/* Weight input */}
      {fields.showWeight && (
        <Input
          type="number"
          inputMode="decimal"
          value={localWeight}
          onChange={(e) => setLocalWeight(e.target.value)}
          onBlur={handleWeightBlur}
          placeholder="-"
          className="h-8 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}

      {/* Reps input */}
      {fields.showReps && (
        <Input
          type="number"
          inputMode="numeric"
          value={localReps}
          onChange={(e) => setLocalReps(e.target.value)}
          onBlur={handleRepsBlur}
          placeholder="-"
          className="h-8 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}

      {/* Duration input */}
      {fields.showDuration && (
        <Input
          type="number"
          inputMode="numeric"
          value={localDuration}
          onChange={(e) => setLocalDuration(e.target.value)}
          onBlur={handleDurationBlur}
          placeholder="-"
          className="h-8 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}

      {/* Distance input */}
      {fields.showDistance && (
        <Input
          type="number"
          inputMode="decimal"
          value={localDistance}
          onChange={(e) => setLocalDistance(e.target.value)}
          onBlur={handleDistanceBlur}
          placeholder="-"
          className="h-8 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}

      {/* Complete checkbox + delete */}
      <div className="flex items-center justify-center">
        <Checkbox
          checked={set.is_completed}
          onCheckedChange={handleCheckChange}
          className="h-5 w-5"
        />
        <Button
          variant="ghost"
          size="sm"
          className="ml-0.5 hidden h-6 w-6 p-0 text-muted-foreground hover:text-destructive group-hover:flex"
          onClick={() => void onDelete().catch(() => toast.error(t("deleteSetError")))}
        >
          <Trash2 className="h-3 w-3" />
          <span className="sr-only">{t("deleteSet")}</span>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format previous set values for display
// ---------------------------------------------------------------------------

function formatPreviousSet(
  prevSet: WorkoutSet,
  showWeight: boolean,
  weightUnit: WeightUnit
): string {
  const parts: string[] = [];

  if (showWeight && prevSet.weight_kg != null) {
    parts.push(formatWeight(prevSet.weight_kg, weightUnit));
  }
  if (prevSet.reps != null) {
    parts.push(`${prevSet.reps}`);
  }
  if (prevSet.duration_seconds != null) {
    parts.push(`${prevSet.duration_seconds}s`);
  }
  if (prevSet.distance_meters != null) {
    parts.push(`${prevSet.distance_meters}m`);
  }

  if (parts.length === 0) return "\u2014";

  // Format as "60kg x 10" for weight+reps, or join with " x "
  if (showWeight && prevSet.weight_kg != null && prevSet.reps != null) {
    return `${formatWeight(prevSet.weight_kg, weightUnit)} x ${prevSet.reps}`;
  }

  return parts.join(" x ");
}
