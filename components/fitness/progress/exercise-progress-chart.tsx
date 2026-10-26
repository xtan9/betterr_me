"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useExerciseRecords } from "@/lib/hooks/use-exercise-history";
import type { WeightUnit } from "@/lib/db/types";
import { ComparableProgress } from "./comparable-progress";

export function ExerciseProgressChart({ exerciseId, weightUnit }: {
  exerciseId: string;
  exerciseName: string;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("workouts");
  const { records, error, isLoading } = useExerciseRecords(exerciseId);
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (error) return <p role="status">{t("loadError")}</p>;
  if (records?.comparisonCoverage !== "current") return <p role="status">{t("comparable.unavailable")}</p>;
  if (!records.comparableGroups?.length) return <p>{t("comparable.empty")}</p>;
  return <div className="space-y-2 pt-2">
    <h4 className="text-caption font-medium">{t("progression")}</h4>
    <ComparableProgress groups={records.comparableGroups} weightUnit={weightUnit} mode="history" />
  </div>;
}
