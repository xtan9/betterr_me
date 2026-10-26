"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { WorkoutSummary } from "@/lib/db/workouts";
import type { WeightUnit } from "@/lib/db/types";
import { formatWeight } from "@/lib/fitness/units";
import { formatWorkoutDay, knownWorkoutDuration } from "@/lib/fitness/history-presentation";

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

export function WorkoutHistoryCard({
  workout,
  weightUnit,
}: WorkoutHistoryCardProps) {
  const t = useTranslations("workouts");
  const locale = useLocale();

  return (
    <Link href={`/workouts/${workout.id}`}>
      <Card className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transition-none cursor-pointer">
        <CardContent className="p-card-padding">
          {/* Top row: title + date */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold truncate">{workout.title}</h3>
            <span className="text-body text-muted-foreground whitespace-nowrap">
              {formatWorkoutDay(workout, locale) ?? t("workoutDayUnknown")}
            </span>
          </div>

          {/* Middle row: duration */}
          <p className="mt-1 text-body text-muted-foreground">
            {(() => {
              if (!knownWorkoutDuration(workout.duration_seconds)) return t("durationUnknown");
              const { hours, minutes } = formatDurationParts(
                workout.duration_seconds
              );
              return hours > 0
                ? t("hourMinuteShort", { hours, minutes })
                : t("minuteShort", { count: minutes });
            })()}
          </p>

          {/* Bottom row: stats */}
          {workout.recordedStatus === 'unsupported' ? <p className="mt-2 text-body text-muted-foreground">{t('recordedUnavailable')}</p> : <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            {workout.exerciseCount !== null && <span>{t("exercises", { count: workout.exerciseCount })}</span>}
            <span className="text-border">|</span>
            {workout.totalSets !== null && <span>{t("setsCount", { count: workout.totalSets })}</span>}
            {(workout.totalVolume === null || workout.totalVolume > 0) && (
              <>
                <span className="text-border">|</span>
                <span>{workout.totalVolume === null ? "—" : formatWeight(workout.totalVolume, weightUnit)}</span>
              </>
            )}
          </div>}

          {/* Exercise names */}
          {workout.exerciseNames.length > 0 && (
            <p className="mt-1.5 text-caption text-muted-foreground/70 truncate">
              {workout.exerciseNames.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
