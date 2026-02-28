"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useWorkouts } from "@/lib/hooks/use-workouts";
import { useWeightUnit } from "@/lib/hooks/use-active-workout";
import { WorkoutHistoryCard } from "./workout-history-card";

const PAGE_SIZE = 20;

export function WorkoutHistoryList() {
  const t = useTranslations("workouts");
  const weightUnit = useWeightUnit();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { workouts, error, isLoading } = useWorkouts({ limit, offset: 0 });

  if (isLoading && workouts.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("history")}</h2>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("history")}</h2>
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("loadError")}</p>
        </div>
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("history")}</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <Calendar className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-muted-foreground">
            {t("noWorkouts")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {t("noWorkoutsDescription")}
          </p>
        </div>
      </div>
    );
  }

  const hasMore = workouts.length === limit;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("history")}</h2>
      {workouts.map((workout) => (
        <WorkoutHistoryCard
          key={workout.id}
          workout={workout}
          weightUnit={weightUnit}
        />
      ))}
      {hasMore && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
        >
          {t("showMore")}
        </Button>
      )}
    </div>
  );
}
