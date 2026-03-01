"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Check, Dumbbell } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ExerciseFilterBar } from "@/components/fitness/exercise-library/exercise-filter-bar";
import { useExercises } from "@/lib/hooks/use-exercises";
import { Skeleton } from "@/components/ui/skeleton";
import type { MuscleGroup, Equipment } from "@/lib/db/types";

interface WorkoutAddExerciseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExercise: (exerciseId: string) => void;
  workoutExerciseIds: string[];
}

export function WorkoutAddExercise({
  open,
  onOpenChange,
  onSelectExercise,
  workoutExerciseIds,
}: WorkoutAddExerciseProps) {
  const t = useTranslations("exercises");
  const tWorkouts = useTranslations("workouts");
  const { exercises, isLoading } = useExercises();

  // Filter state
  const [search, setSearch] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  // Client-side filtering (same pattern as ExerciseLibrary)
  const filteredExercises = useMemo(() => {
    return exercises.filter((e) => {
      if (search && !e.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (muscleGroup && e.muscle_group_primary !== muscleGroup) {
        return false;
      }
      if (equipment && e.equipment !== equipment) {
        return false;
      }
      return true;
    });
  }, [exercises, search, muscleGroup, equipment]);

  // Group filtered exercises by muscle_group_primary
  const groupedExercises = useMemo(() => {
    const groups = new Map<MuscleGroup, typeof filteredExercises>();
    for (const exercise of filteredExercises) {
      const group = groups.get(exercise.muscle_group_primary);
      if (group) {
        group.push(exercise);
      } else {
        groups.set(exercise.muscle_group_primary, [exercise]);
      }
    }
    return groups;
  }, [filteredExercises]);

  const alreadyAddedSet = useMemo(
    () => new Set(workoutExerciseIds),
    [workoutExerciseIds]
  );

  const handleSelect = (exerciseId: string) => {
    onSelectExercise(exerciseId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-hidden flex flex-col sm:max-w-lg sm:mx-auto">
        <SheetHeader>
          <SheetTitle>{tWorkouts("addExercise")}</SheetTitle>
        </SheetHeader>

        <div className="px-1 py-3">
          <ExerciseFilterBar
            search={search}
            onSearchChange={setSearch}
            muscleGroup={muscleGroup}
            onMuscleGroupChange={setMuscleGroup}
            equipment={equipment}
            onEquipmentChange={setEquipment}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-1 pb-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Dumbbell className="text-muted-foreground mb-4 h-12 w-12" />
              <h3 className="text-lg font-medium">{t("noResults")}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("noResultsDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(groupedExercises.entries()).map(
                ([group, groupExercises]) => (
                  <section key={group}>
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
                      {t(`muscleGroups.${group}`)} ({groupExercises.length})
                    </h3>
                    <div className="space-y-1">
                      {groupExercises.map((exercise) => {
                        const isAdded = alreadyAddedSet.has(exercise.id);
                        return (
                          <button
                            key={exercise.id}
                            type="button"
                            onClick={() => handleSelect(exercise.id)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium">
                                  {exercise.name}
                                </span>
                                {isAdded && (
                                  <Badge
                                    variant="secondary"
                                    className="shrink-0 text-[10px]"
                                  >
                                    <Check className="mr-0.5 h-3 w-3" />
                                    {tWorkouts("added")}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-muted-foreground text-xs">
                                  {t(`muscleGroups.${exercise.muscle_group_primary}`)}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {t(`exerciseTypes.${exercise.exercise_type}`)}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
