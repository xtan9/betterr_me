"use client";

import { useTranslations } from "next-intl";
import { Dumbbell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExerciseProgressChart } from "@/components/fitness/progress/exercise-progress-chart";
import { useExerciseRecords } from "@/lib/hooks/use-exercise-history";
import { formatWeight } from "@/lib/fitness/units";
import type { Exercise, WeightUnit } from "@/lib/db/types";

interface ExerciseSummaryTabProps {
  exercise: Exercise;
  weightUnit: WeightUnit;
}

export function ExerciseSummaryTab({
  exercise,
  weightUnit,
}: ExerciseSummaryTabProps) {
  const t = useTranslations("exercises");
  const { records, isLoading: recordsLoading } = useExerciseRecords(
    exercise.id
  );

  const gifUrl = exercise.exercise_media?.gif_url;
  const showGif = gifUrl && exercise.exercise_media?.media_status !== "broken";
  const alternativeNames = exercise.exercise_media?.alternative_names;

  return (
    <div className="flex flex-col gap-section-gap">
      {/* Animated GIF */}
      <div className="flex justify-center">
        <div className="h-[200px] w-[200px] rounded-xl overflow-hidden bg-muted flex items-center justify-center">
          {showGif ? (
            <img
              src={gifUrl}
              alt={exercise.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Dumbbell className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Exercise Info */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge>{t("exerciseDetail.primaryMuscle")}: {t(`muscleGroups.${exercise.muscle_group_primary}`)}</Badge>
          {exercise.muscle_groups_secondary.map((mg) => (
            <Badge key={mg} variant="outline">
              {t(`muscleGroups.${mg}`)}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {t("exerciseDetail.equipmentLabel")}: {t(`equipmentTypes.${exercise.equipment}`)}
          </Badge>
          <Badge variant="secondary">
            {t("exerciseDetail.typeLabel")}: {t(`exerciseTypes.${exercise.exercise_type}`)}
          </Badge>
        </div>

        {alternativeNames && alternativeNames.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{t("exerciseDetail.alsoKnownAs")}:</span>{" "}
            {alternativeNames.join(", ")}
          </p>
        )}
      </div>

      {/* Personal Records */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("exerciseDetail.personalRecords")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : records ? (
            <div className="grid grid-cols-3 gap-4">
              {records.best_weight_kg != null && (
                <div className="text-center space-y-1">
                  <p className="text-2xl font-bold">
                    {formatWeight(records.best_weight_kg, weightUnit)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("exerciseDetail.bestWeight")}
                  </p>
                  {records.achieved_at && (
                    <p className="text-xs text-muted-foreground">
                      {t("exerciseDetail.achievedOn", {
                        date: new Date(records.achieved_at).toLocaleDateString(),
                      })}
                    </p>
                  )}
                </div>
              )}
              {records.best_reps != null && (
                <div className="text-center space-y-1">
                  <p className="text-2xl font-bold">{records.best_reps}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("exerciseDetail.bestReps")}
                  </p>
                </div>
              )}
              {records.best_volume != null && (
                <div className="text-center space-y-1">
                  <p className="text-2xl font-bold">
                    {formatWeight(records.best_volume, weightUnit)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("exerciseDetail.bestVolume")}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("exerciseDetail.noRecordsYet")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Progress Chart */}
      <ExerciseProgressChart
        exerciseId={exercise.id}
        exerciseName={exercise.name}
        weightUnit={weightUnit}
      />
    </div>
  );
}
