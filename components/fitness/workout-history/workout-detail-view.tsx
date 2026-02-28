"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  WorkoutWithExercises,
  WorkoutExerciseWithDetails,
  WorkoutSet,
  WeightUnit,
  ExerciseType,
} from "@/lib/db/types";
import { displayWeight, formatWeight } from "@/lib/fitness/units";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import { useExerciseRecords } from "@/lib/hooks/use-exercise-history";
import { ExerciseProgressChart } from "@/components/fitness/progress/exercise-progress-chart";

interface WorkoutDetailViewProps {
  workout: WorkoutWithExercises;
  weightUnit: WeightUnit;
}

// ---------------------------------------------------------------------------
// Summary stats strip
// ---------------------------------------------------------------------------

function SummaryStats({
  workout,
  weightUnit,
}: {
  workout: WorkoutWithExercises;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("workouts");

  const totalSets = workout.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.is_completed).length,
    0
  );
  const totalVolume = workout.exercises.reduce(
    (sum, ex) =>
      sum +
      ex.sets
        .filter((s) => s.is_completed)
        .reduce(
          (v, s) => v + ((s.weight_kg ?? 0) * (s.reps ?? 0)),
          0
        ),
    0
  );

  const durationMinutes = workout.duration_seconds
    ? Math.floor(workout.duration_seconds / 60)
    : 0;
  const durationHours = Math.floor(durationMinutes / 60);
  const remainingMinutes = durationMinutes % 60;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label={t("totalDuration")}
        value={
          durationHours > 0
            ? t("hourMinuteShort", {
                hours: durationHours,
                minutes: remainingMinutes,
              })
            : t("minuteShort", { count: durationMinutes })
        }
      />
      <StatCard
        label={t("totalExercises")}
        value={String(workout.exercises.length)}
      />
      <StatCard label={t("totalSets")} value={String(totalSets)} />
      {totalVolume > 0 && (
        <StatCard
          label={t("totalVolume")}
          value={formatWeight(totalVolume, weightUnit)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercise detail card (read-only)
// ---------------------------------------------------------------------------

function ExerciseDetailCard({
  exerciseDetail,
  weightUnit,
}: {
  exerciseDetail: WorkoutExerciseWithDetails;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("workouts");
  const tExercises = useTranslations("exercises");
  const exerciseInfo = exerciseDetail.exercise;
  const completedSets = exerciseDetail.sets.filter((s) => s.is_completed);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">
            {exerciseInfo.name}
          </CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {tExercises(
                `muscleGroups.${exerciseInfo.muscle_group_primary}`
              )}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {tExercises(`exerciseTypes.${exerciseInfo.exercise_type}`)}
            </Badge>
          </div>
        </div>
        {exerciseDetail.notes && (
          <p className="mt-1 text-xs text-muted-foreground">
            {exerciseDetail.notes}
          </p>
        )}
      </CardHeader>

      <CardContent className="pb-3">
        {/* Column headers */}
        <SetHeaders
          exerciseType={exerciseInfo.exercise_type}
          weightUnit={weightUnit}
        />

        {/* Set rows */}
        {completedSets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            exerciseType={exerciseInfo.exercise_type}
            exerciseId={exerciseInfo.id}
            weightUnit={weightUnit}
          />
        ))}

        {completedSets.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            {t("setsCount", { count: 0 })}
          </p>
        )}

        {/* Exercise progression chart */}
        <ExerciseProgressChart
          exerciseId={exerciseInfo.id}
          exerciseName={exerciseInfo.name}
          weightUnit={weightUnit}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Set column headers (read-only version)
// ---------------------------------------------------------------------------

function SetHeaders({
  exerciseType,
  weightUnit,
}: {
  exerciseType: ExerciseType;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("workouts");
  const fields = EXERCISE_FIELD_MAP[exerciseType];

  const dynamicCols = [
    fields.showWeight,
    fields.showReps,
    fields.showDuration,
    fields.showDistance,
  ].filter(Boolean).length;

  // Grid: set# + dynamic cols + type badge
  const gridClass =
    dynamicCols === 1
      ? "grid-cols-[40px_1fr_auto]"
      : dynamicCols === 2
        ? "grid-cols-[40px_1fr_1fr_auto]"
        : "grid-cols-[40px_1fr_1fr_1fr_auto]";

  return (
    <div
      className={`grid ${gridClass} items-center gap-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1`}
    >
      <span>{t("set")}</span>
      {fields.showWeight && <span>{weightUnit.toUpperCase()}</span>}
      {fields.showReps && <span>{t("reps")}</span>}
      {fields.showDuration && <span>{t("duration")}</span>}
      {fields.showDistance && <span>{t("distance")}</span>}
      <span></span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Set row (read-only) with PR badge
// ---------------------------------------------------------------------------

const SET_TYPE_COLORS: Record<string, string> = {
  warmup: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  normal: "bg-secondary text-secondary-foreground",
  drop: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  failure: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function SetRow({
  set,
  exerciseType,
  exerciseId,
  weightUnit,
}: {
  set: WorkoutSet;
  exerciseType: ExerciseType;
  exerciseId: string;
  weightUnit: WeightUnit;
}) {
  const t = useTranslations("workouts");
  const fields = EXERCISE_FIELD_MAP[exerciseType];
  const { records, isLoading: recordsLoading } =
    useExerciseRecords(exerciseId);

  const dynamicCols = [
    fields.showWeight,
    fields.showReps,
    fields.showDuration,
    fields.showDistance,
  ].filter(Boolean).length;

  const gridClass =
    dynamicCols === 1
      ? "grid-cols-[40px_1fr_auto]"
      : dynamicCols === 2
        ? "grid-cols-[40px_1fr_1fr_auto]"
        : "grid-cols-[40px_1fr_1fr_1fr_auto]";

  // Determine which PR badges to show
  const prBadges: string[] = [];
  if (!recordsLoading && records && set.is_completed && set.set_type === "normal") {
    if (
      fields.showWeight &&
      set.weight_kg != null &&
      set.weight_kg > 0 &&
      records.best_weight_kg != null &&
      set.weight_kg >= records.best_weight_kg
    ) {
      prBadges.push("weight");
    }
    if (
      fields.showReps &&
      set.reps != null &&
      set.reps > 0 &&
      records.best_reps != null &&
      set.reps >= records.best_reps
    ) {
      prBadges.push("reps");
    }
    if (
      fields.showDuration &&
      set.duration_seconds != null &&
      set.duration_seconds > 0 &&
      records.best_duration_seconds != null &&
      set.duration_seconds >= records.best_duration_seconds
    ) {
      prBadges.push("duration");
    }
    if (
      fields.showWeight &&
      fields.showReps &&
      set.weight_kg != null &&
      set.reps != null
    ) {
      const volume = set.weight_kg * set.reps;
      if (
        volume > 0 &&
        records.best_volume != null &&
        volume >= records.best_volume
      ) {
        prBadges.push("volume");
      }
    }
  }

  return (
    <div
      className={`grid ${gridClass} items-center gap-1 px-1 py-1.5 text-sm rounded hover:bg-muted/50`}
    >
      <span className="text-xs text-muted-foreground">{set.set_number}</span>
      {fields.showWeight && (
        <span>
          {set.weight_kg != null
            ? displayWeight(set.weight_kg, weightUnit)
            : "\u2014"}
        </span>
      )}
      {fields.showReps && (
        <span>{set.reps != null ? set.reps : "\u2014"}</span>
      )}
      {fields.showDuration && (
        <span>
          {set.duration_seconds != null ? `${set.duration_seconds}s` : "\u2014"}
        </span>
      )}
      {fields.showDistance && (
        <span>
          {set.distance_meters != null
            ? `${set.distance_meters}m`
            : "\u2014"}
        </span>
      )}
      <div className="flex items-center gap-1">
        {set.set_type !== "normal" && (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${SET_TYPE_COLORS[set.set_type] ?? ""}`}
          >
            {t(set.set_type === "drop" ? "dropSet" : set.set_type)}
          </span>
        )}
        {prBadges.length > 0 && (
          <span
            className="inline-flex items-center rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-medium px-1.5 py-0.5"
            title={t("prBadgeTooltip")}
          >
            {t("prBadge")}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkoutDetailView({
  workout,
  weightUnit,
}: WorkoutDetailViewProps) {
  const t = useTranslations("workouts");

  return (
    <div className="space-y-4">
      <SummaryStats workout={workout} weightUnit={weightUnit} />

      {workout.exercises.map((ex) => (
        <ExerciseDetailCard
          key={ex.id}
          exerciseDetail={ex}
          weightUnit={weightUnit}
        />
      ))}

      {/* Workout notes */}
      {workout.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("workoutNotes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {workout.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
