"use client";

import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import type { Exercise } from "@/lib/db/types";

interface ExerciseCardProps {
  exercise: Exercise;
  onEdit?: (exercise: Exercise) => void;
  onDelete?: (exercise: Exercise) => void;
}

export function ExerciseCard({ exercise, onEdit, onDelete }: ExerciseCardProps) {
  const t = useTranslations("exercises");

  const fieldConfig = EXERCISE_FIELD_MAP[exercise.exercise_type];
  const trackingFields: string[] = [];
  if (fieldConfig.showWeight) trackingFields.push("Weight");
  if (fieldConfig.showReps) trackingFields.push("Reps");
  if (fieldConfig.showDuration) trackingFields.push("Duration");
  if (fieldConfig.showDistance) trackingFields.push("Distance");

  return (
    <Card className="group relative">
      <CardContent className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium">{exercise.name}</h3>
            {exercise.is_custom && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {t("custom")}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {t(`muscleGroups.${exercise.muscle_group_primary}`)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {t(`equipmentTypes.${exercise.equipment}`)}
            </Badge>
            {exercise.muscle_groups_secondary.map((mg) => (
              <Badge
                key={mg}
                variant="outline"
                className="text-muted-foreground text-[10px]"
              >
                {t(`muscleGroups.${mg}`)}
              </Badge>
            ))}
          </div>

          <p className="text-muted-foreground text-xs">
            {t(`exerciseTypes.${exercise.exercise_type}`)}
            {trackingFields.length > 0 && (
              <span className="ml-1">
                ({trackingFields.join(" + ")})
              </span>
            )}
          </p>
        </div>

        {exercise.is_custom && (onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(exercise)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t("editExercise")}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(exercise)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("deleteExercise")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}
