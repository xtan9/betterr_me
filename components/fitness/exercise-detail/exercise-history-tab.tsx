"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useExerciseHistory } from "@/lib/hooks/use-exercise-history";
import { formatWeight } from "@/lib/fitness/units";
import type { Exercise, WeightUnit } from "@/lib/db/types";

interface ExerciseHistoryTabProps {
  exercise: Exercise;
  weightUnit: WeightUnit;
}

export function ExerciseHistoryTab({
  exercise,
  weightUnit,
}: ExerciseHistoryTabProps) {
  const t = useTranslations("exercises");
  const { history, isLoading } = useExerciseHistory(exercise.id);

  // Sort by date descending (most recent first)
  const sortedHistory = useMemo(() => {
    return [...history].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }, [history]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (sortedHistory.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("exerciseDetail.noHistoryYet")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedHistory.map((entry) => (
        <Card key={entry.workout_id}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                {new Date(entry.started_at).toLocaleDateString(undefined, {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("exerciseDetail.sets", { count: entry.total_sets })}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              {entry.best_set_weight_kg != null && (
                <div>
                  <p className="text-sm font-semibold">
                    {formatWeight(entry.best_set_weight_kg, weightUnit)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("exerciseDetail.bestWeight")}
                  </p>
                </div>
              )}
              {entry.best_set_reps != null && (
                <div>
                  <p className="text-sm font-semibold">{entry.best_set_reps}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("exerciseDetail.bestReps")}
                  </p>
                </div>
              )}
              {entry.total_volume != null && (
                <div>
                  <p className="text-sm font-semibold">
                    {formatWeight(entry.total_volume, weightUnit)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("exerciseDetail.volume")}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
