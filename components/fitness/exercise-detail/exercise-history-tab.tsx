"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatWorkoutDay } from "@/lib/fitness/history-presentation";
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
  const tw = useTranslations("workouts");
  const locale = useLocale();
  const { history, error, isLoading } = useExerciseHistory(exercise.id);


  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) return <p role="status">{tw("loadError")}</p>;

  if (history.length === 0) {
    return (
      <div className="rounded-card border border-dashed p-8 text-center">
        <p className="text-body text-muted-foreground">
          {t("exerciseDetail.noHistoryYet")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <Card key={entry.workout_id}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <Link className="text-body font-medium underline" href={`/workouts/${entry.workout_id}`}>
                {formatWorkoutDay(entry, locale, { weekday: "short", year: "numeric", month: "short", day: "numeric" }) ?? tw("workoutDayUnknown")}
              </Link>
              <p className="text-caption text-muted-foreground">
                {t("exerciseDetail.sets", { count: entry.total_sets })}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              {entry.best_set_weight_kg != null && (
                <div>
                  <p className="text-body font-semibold">
                    {formatWeight(entry.best_set_weight_kg, weightUnit)}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {t("exerciseDetail.bestWeight")}
                  </p>
                </div>
              )}
              {entry.best_set_reps != null && (
                <div>
                  <p className="text-body font-semibold">{entry.best_set_reps}</p>
                  <p className="text-caption text-muted-foreground">
                    {t("exerciseDetail.bestReps")}
                  </p>
                </div>
              )}
              {entry.total_volume != null && (
                <div>
                  <p className="text-body font-semibold">
                    {formatWeight(entry.total_volume, weightUnit)}
                  </p>
                  <p className="text-caption text-muted-foreground">
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
