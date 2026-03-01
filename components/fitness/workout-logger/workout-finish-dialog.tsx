"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutTemplate, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkoutWithExercises, WeightUnit } from "@/lib/db/types";
import { formatWeight } from "@/lib/fitness/units";

interface WorkoutFinishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutWithExercises;
  /** Duration in seconds, computed by the parent when opening the dialog */
  durationSeconds: number;
  /** User's preferred weight unit for volume display */
  weightUnit: WeightUnit;
  onConfirm: () => void;
}

/**
 * Format a duration in seconds to a human-readable string (e.g., "1h 23m" or "45m").
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function WorkoutFinishDialog({
  open,
  onOpenChange,
  workout,
  durationSeconds,
  weightUnit,
  onConfirm,
}: WorkoutFinishDialogProps) {
  const t = useTranslations("workouts");
  const tRoutines = useTranslations("routines");

  // Save as routine state
  const [showSaveRoutine, setShowSaveRoutine] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [saving, setSaving] = useState(false);
  const [routineSaved, setRoutineSaved] = useState(false);

  const stats = useMemo(() => {
    const exerciseCount = workout.exercises.length;
    let completedSets = 0;
    let totalVolume = 0;

    for (const we of workout.exercises) {
      for (const set of we.sets) {
        if (set.is_completed) {
          completedSets++;
          if (set.weight_kg != null && set.reps != null) {
            totalVolume += set.weight_kg * set.reps;
          }
        }
      }
    }

    return {
      exerciseCount,
      completedSets,
      totalVolume: Math.round(totalVolume * 100) / 100,
    };
  }, [workout]);

  const hasExercises = workout.exercises.length > 0;

  const handleSaveAsRoutine = async () => {
    const name = routineName.trim();
    if (!name) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/workouts/${workout.id}/save-as-routine`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save as routine");
      }

      toast.success(tRoutines("saveAsRoutineSuccess"));
      setRoutineSaved(true);
      setShowSaveRoutine(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save as routine";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setShowSaveRoutine(false);
      setRoutineName("");
      setSaving(false);
      setRoutineSaved(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("finishWorkoutTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("finishWorkoutDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-muted-foreground text-xs">{t("workoutDuration")}</p>
            <p className="text-lg font-semibold">
              {formatDuration(durationSeconds)}
            </p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-muted-foreground text-xs">{t("workoutExercises")}</p>
            <p className="text-lg font-semibold">{stats.exerciseCount}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-muted-foreground text-xs">{t("workoutSets")}</p>
            <p className="text-lg font-semibold">{stats.completedSets}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-muted-foreground text-xs">{t("workoutVolume")}</p>
            <p className="text-lg font-semibold">
              {stats.totalVolume > 0
                ? formatWeight(stats.totalVolume, weightUnit)
                : "-"}
            </p>
          </div>
        </div>

        {/* Save as Routine section */}
        {hasExercises && !routineSaved && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground hover:text-foreground"
              onClick={() => {
                setShowSaveRoutine(!showSaveRoutine);
                if (!routineName && workout.title) {
                  setRoutineName(workout.title);
                }
              }}
            >
              <span className="flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4" />
                {tRoutines("saveAsRoutine")}
              </span>
              {showSaveRoutine ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {showSaveRoutine && (
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder={tRoutines("saveAsRoutinePlaceholder")}
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && routineName.trim()) {
                      handleSaveAsRoutine();
                    }
                  }}
                  disabled={saving}
                />
                <Button
                  size="sm"
                  disabled={saving || !routineName.trim()}
                  onClick={handleSaveAsRoutine}
                  className="shrink-0"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    tRoutines("save")
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t("finishCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("finishConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
