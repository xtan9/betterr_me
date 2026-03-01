"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { WorkoutSummary } from "@/lib/db/workouts";
import type { WeightUnit } from "@/lib/db/types";
import { formatWeight } from "@/lib/fitness/units";

interface WorkoutHistoryCardProps {
  workout: WorkoutSummary;
  weightUnit: WeightUnit;
}

/** Format duration_seconds into hours/minutes display. */
function formatDurationParts(seconds: number | null): {
  hours: number;
  minutes: number;
} {
  if (seconds == null || seconds <= 0) return { hours: 0, minutes: 0 };
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
  };
}

/** Format a date string into a localized short date. */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function WorkoutHistoryCard({
  workout,
  weightUnit,
}: WorkoutHistoryCardProps) {
  const t = useTranslations("workouts");

  return (
    <Link href={`/workouts/${workout.id}`}>
      <Card className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transition-none cursor-pointer">
        <CardContent className="p-4">
          {/* Top row: title + date */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold truncate">{workout.title}</h3>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {formatDate(workout.started_at)}
            </span>
          </div>

          {/* Middle row: duration */}
          <p className="mt-1 text-sm text-muted-foreground">
            {(() => {
              const { hours, minutes } = formatDurationParts(
                workout.duration_seconds
              );
              return hours > 0
                ? t("hourMinuteShort", { hours, minutes })
                : t("minuteShort", { count: minutes });
            })()}
          </p>

          {/* Bottom row: stats */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t("exercises", { count: workout.exerciseCount })}</span>
            <span className="text-border">|</span>
            <span>{t("setsCount", { count: workout.totalSets })}</span>
            {workout.totalVolume > 0 && (
              <>
                <span className="text-border">|</span>
                <span>{formatWeight(workout.totalVolume, weightUnit)}</span>
              </>
            )}
          </div>

          {/* Exercise names */}
          {workout.exerciseNames.length > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground/70 truncate">
              {workout.exerciseNames.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
