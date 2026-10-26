"use client";

import { useCallback, useRef, useState } from "react";
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
import { formatWeight } from "@/lib/fitness/units";
import { useWeightInput } from "@/components/fitness/use-weight-input";
import type { PriorPerformed } from "@/lib/validations/train-prior-results";
import type { WebPriorRead } from "@/lib/validations/web-prior-results";
import { PriorResultsPicker } from "./prior-results-picker";
import { parseWholeInput } from "@/lib/fitness/measurement-input";

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
  priorResults?: WebPriorRead | null;
  onUpdate: (updates: WorkoutSetUpdate) => Promise<void>;
  onDelete: () => Promise<void>;
  onComplete: () => Promise<void>;
}

export function WorkoutSetRow({
  set,
  exerciseType,
  weightUnit,
  previousSet,
  priorResults,
  onUpdate,
  onDelete,
  onComplete,
}: WorkoutSetRowProps) {
  const t = useTranslations("workouts");
  const fields = EXERCISE_FIELD_MAP[exerciseType];
  const supportedMeasurement = ["weight_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight", "duration"].includes(exerciseType);
  const minimumDuration = exerciseType === "duration" ? 1 : 0;
  const typeConfig = SET_TYPE_CONFIG[set.set_type];
  const [typeOpen, setTypeOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const update = useCallback((updates: WorkoutSetUpdate) => {
    const key = JSON.stringify(updates);
    if (pending.current?.key === key) return pending.current.promise;
    const promise = writes.current.catch(() => {}).then(() => onUpdate(updates));
    const request = { key, promise };
    pending.current = request;
    writes.current = promise;
    const settle = () => { if (pending.current === request) pending.current = null; };
    void promise.then(settle, settle);
    return promise;
  }, [onUpdate]);

  // Local state for inputs to allow fast typing (optimistic blur-on-commit updates)
  const weightInput = useWeightInput(set.id, set.weight_kg, weightUnit);
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
    if (!weightInput.edited || !weightInput.valid) return;
    const kg = weightInput.anchorKg;
    if (kg !== set.weight_kg) {
      void update({ weight_kg: kg }).then(weightInput.acknowledge, () => toast.error(t("updateSetError")));
    } else weightInput.acknowledge();
  }, [weightInput, set.weight_kg, update, t]);

  const handleRepsBlur = useCallback(() => {
    const value = parseWholeInput(localReps, 1, Number.MAX_SAFE_INTEGER);
    if (value === undefined) return;
    if (value !== set.reps) {
      void update({ reps: value }).catch(() => toast.error(t("updateSetError")));
    }
  }, [localReps, set.reps, update, t]);

  const handleDurationBlur = useCallback(() => {
    const value = parseWholeInput(localDuration, minimumDuration, 86400);
    if (value === undefined) return;
    if (value !== set.duration_seconds) {
      void update({ duration_seconds: value }).catch(() => toast.error(t("updateSetError")));
    }
  }, [localDuration, minimumDuration, set.duration_seconds, update, t]);

  const handleDistanceBlur = useCallback(() => {
    const parsed = parseFloat(localDistance);
    const value = isNaN(parsed) ? null : parsed;
    if (value !== set.distance_meters) {
      void update({ distance_meters: value }).catch(() => toast.error(t("updateSetError")));
    }
  }, [localDistance, set.distance_meters, update, t]);

  const handleSetTypeChange = useCallback(
    (newType: SetType) => {
      setTypeOpen(false);
      if (newType !== set.set_type) {
        void update({ set_type: newType }).catch(() => toast.error(t("updateSetError")));
      }
    },
    [set.set_type, update, t]
  );

  const handleCheckChange = (checked: boolean) => {
    if (!checked) {
      void update({ is_completed: false }).catch(() => toast.error(t("updateSetError")));
      return;
    }
    const reps = parseWholeInput(localReps, 1, Number.MAX_SAFE_INTEGER);
    const duration = parseWholeInput(localDuration, minimumDuration, 86400);
    if (supportedMeasurement && (fields.showWeight && (!weightInput.valid || weightInput.anchorKg === null)
      || fields.showReps && reps == null || fields.showDuration && duration == null)) {
      toast.error(t("measurementInvalid"));
      return;
    }
    const changes: WorkoutSetUpdate = {};
    if (fields.showWeight && weightInput.edited && weightInput.valid && weightInput.anchorKg !== set.weight_kg) changes.weight_kg = weightInput.anchorKg;
    if (fields.showReps && reps !== undefined && reps !== set.reps) changes.reps = reps;
    if (fields.showDuration && duration !== undefined && duration !== set.duration_seconds) changes.duration_seconds = duration;
    setCompleting(true);
    void (async () => {
      try {
        if (Object.keys(changes).length) await update(changes);
        else await writes.current;
        weightInput.acknowledge();
        await onComplete();
      } catch { toast.error(t("completeSetError")); }
      finally { setCompleting(false); }
    })();
  };

  const reuseMeasurements = async (performed: PriorPerformed) => {
    if (set.is_completed || performed.mode !== exerciseType) throw new Error('Measurements cannot be reused');
    const changes: WorkoutSetUpdate = performed.mode === 'duration' ? { duration_seconds: performed.durationSeconds }
      : performed.mode === 'bodyweight_reps' ? { reps: performed.reps }
      : { weight_kg: performed.mode === 'weight_reps' ? performed.weightKg
        : performed.mode === 'weighted_bodyweight' ? performed.addedWeightKg : performed.assistanceKg, reps: performed.reps };
    setCompleting(true);
    try {
      await update(changes);
      if (changes.weight_kg !== undefined) weightInput.replaceWithCanonical(changes.weight_kg);
      if (changes.reps !== undefined) setLocalReps(changes.reps === null ? '' : String(changes.reps));
      if (changes.duration_seconds !== undefined) setLocalDuration(changes.duration_seconds === null ? '' : String(changes.duration_seconds));
    } finally { setCompleting(false); }
  };

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
            disabled={completing}
            className={`flex h-7 w-9 items-center justify-center rounded text-caption font-semibold ${typeConfig.color}`}
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
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-caption hover:bg-accent ${
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
      {priorResults ? <PriorResultsPicker key={JSON.stringify(priorResults.request)} read={priorResults}
        weightUnit={weightUnit} disabled={set.is_completed || completing} onUse={reuseMeasurements} />
        : <span className="truncate text-caption text-muted-foreground" title={t('prior.legacy')}>{previousDisplay}</span>}

      {/* Weight input */}
      {fields.showWeight && (
        <div>
        <Input
          type="text"
          inputMode="decimal"
          disabled={completing}
          aria-label={`${t(exerciseType === "assisted_bodyweight" ? "assistance" : exerciseType === "weighted_bodyweight" ? "addedLoad" : "weight")} (${weightInput.unit})`}
          aria-invalid={!weightInput.valid}
          value={weightInput.value}
          onChange={(e) => weightInput.change(e.target.value)}
          onBlur={handleWeightBlur}
          placeholder="-"
          className="h-8 text-center text-caption [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-caption text-muted-foreground">{weightInput.unit}</span>
        {weightInput.unit !== weightUnit && <p className="text-caption text-muted-foreground">{t("inputUnitKept", { unit: weightInput.unit })}</p>}
        {!weightInput.valid && <p className="text-caption text-destructive">{t("measurementInvalid")}</p>}
        </div>
      )}

      {/* Reps input */}
      {fields.showReps && (
        <Input
          type="text"
          inputMode="numeric"
          disabled={completing}
          aria-label={t("reps")}
          aria-invalid={parseWholeInput(localReps, 1, Number.MAX_SAFE_INTEGER) === undefined}
          value={localReps}
          onChange={(e) => setLocalReps(e.target.value)}
          onBlur={handleRepsBlur}
          placeholder="-"
          className="h-8 text-center text-caption [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}

      {/* Duration input */}
      {fields.showDuration && (
        <Input
          type="text"
          inputMode="numeric"
          disabled={completing}
          aria-label={t("duration")}
          aria-invalid={parseWholeInput(localDuration, minimumDuration, 86400) === undefined}
          value={localDuration}
          onChange={(e) => setLocalDuration(e.target.value)}
          onBlur={handleDurationBlur}
          placeholder="-"
          className="h-8 text-center text-caption [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}

      {/* Distance input */}
      {fields.showDistance && (
        <Input
          type="number"
          inputMode="decimal"
          disabled={completing}
          value={localDistance}
          onChange={(e) => setLocalDistance(e.target.value)}
          onBlur={handleDistanceBlur}
          placeholder="-"
          className="h-8 text-center text-caption [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      )}

      {/* Complete checkbox + delete */}
      <div className="flex items-center justify-center">
        <Checkbox
          checked={set.is_completed}
          disabled={completing}
          aria-label={t("complete")}
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
