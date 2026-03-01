"use client";

import { useTranslations } from "next-intl";
import { Dumbbell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface WorkoutStatsWidgetProps {
  lastWorkoutAt: string | null;
  weekWorkoutCount: number;
}

/**
 * Compute a relative date string from an ISO timestamp.
 * Returns "Today", "Yesterday", or "N days ago" based on the difference.
 */
function getRelativeDate(
  isoTimestamp: string,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const workoutDate = new Date(isoTimestamp);
  const now = new Date();

  // Compare calendar dates (not timestamps) to handle timezone correctly
  const workoutDay = new Date(
    workoutDate.getFullYear(),
    workoutDate.getMonth(),
    workoutDate.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = today.getTime() - workoutDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t("today");
  if (diffDays === 1) return t("yesterday");
  return t("daysAgo", { count: diffDays });
}

export function WorkoutStatsWidget({
  lastWorkoutAt,
  weekWorkoutCount,
}: WorkoutStatsWidgetProps) {
  const t = useTranslations("dashboard.workoutStats");

  return (
    <Card data-testid="workout-stats-widget" className="min-w-0 gap-0 py-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="rounded-full bg-stat-icon-purple-bg p-2.5 shrink-0"
            aria-hidden="true"
          >
            <Dumbbell className="size-4 text-stat-icon-purple" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">{t("title")}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("lastWorkout")}</p>
                <p className="text-stat mt-0.5">
                  {lastWorkoutAt
                    ? getRelativeDate(lastWorkoutAt, t)
                    : t("noWorkoutsYet")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("thisWeek")}</p>
                <p className="text-stat mt-0.5">
                  {t("workoutsCount", { count: weekWorkoutCount })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
