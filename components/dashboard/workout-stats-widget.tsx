"use client";

import { useTranslations } from "next-intl";
import { Dumbbell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface WorkoutStatsWidgetProps {
  lastWorkoutAt: string | null;
  lastWorkout?: { workoutDay: string | null; startedAt: string | null } | null;
  weekWorkoutCount: number;
}

/**
 * Compute a relative date from the recorded civil day without a timezone shift.
 * Returns "Today", "Yesterday", or "N days ago" based on the difference.
 */
function getRelativeDate(
  fact: { workoutDay: string | null; startedAt: string | null },
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (fact.workoutDay === null) return t("workoutDayUnknown");
  const [year, month, day] = fact.workoutDay.split("-").map(Number);
  const workoutDate = new Date(0);
  workoutDate.setUTCFullYear(year, month - 1, day);
  if (year < 1 || workoutDate.getUTCFullYear() !== year || workoutDate.getUTCMonth() !== month - 1 || workoutDate.getUTCDate() !== day) return t("workoutDayUnknown");
  const now = new Date(), today = new Date(0);
  today.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - workoutDate.getTime()) / 86400000);

  if (diffDays === 0) return t("today");
  if (diffDays === 1) return t("yesterday");
  return t("daysAgo", { count: diffDays });
}

export function WorkoutStatsWidget({
  lastWorkoutAt,
  lastWorkout,
  weekWorkoutCount,
}: WorkoutStatsWidgetProps) {
  const t = useTranslations("dashboard.workoutStats");
  let fact = lastWorkout;
  if (fact === undefined) {
    const at = lastWorkoutAt ? new Date(lastWorkoutAt) : null;
    fact = at ? { startedAt: lastWorkoutAt, workoutDay: Number.isFinite(at.getTime())
      ? `${String(at.getFullYear()).padStart(4, "0")}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}` : null } : null;
  }

  return (
    <Card data-testid="workout-stats-widget" className="min-w-0 gap-0 py-0 shadow-sm">
      <CardContent className="p-card-padding">
        <div className="flex items-start gap-3">
          <div
            className="rounded-pill bg-stat-icon-purple-bg p-2.5 shrink-0"
            aria-hidden="true"
          >
            <Dumbbell className="size-4 text-stat-icon-purple" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-body font-medium">{t("title")}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-body text-muted-foreground">{t("lastWorkout")}</p>
                <p className="text-stat mt-0.5">
                  {fact
                    ? getRelativeDate(fact, t)
                    : t("noWorkoutsYet")}
                </p>
              </div>
              <div>
                <p className="text-body text-muted-foreground">{t("thisWeek")}</p>
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
