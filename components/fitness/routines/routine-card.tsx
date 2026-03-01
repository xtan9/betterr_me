"use client";

import { useTranslations } from "next-intl";
import { Play, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RoutineWithExercises } from "@/lib/db/types";

interface RoutineCardProps {
  routine: RoutineWithExercises;
  onStart: (id: string) => void;
  onEdit: (routine: RoutineWithExercises) => void;
  onDelete: (id: string) => void;
}

export function RoutineCard({
  routine,
  onStart,
  onEdit,
  onDelete,
}: RoutineCardProps) {
  const t = useTranslations("routines");

  const exerciseCount = routine.exercises.length;
  const lastPerformed = routine.last_performed_at
    ? new Date(routine.last_performed_at).toLocaleDateString()
    : t("never");

  // Build target summary for each exercise (e.g., "3x10" or "3x30s")
  const getTargetSummary = (
    re: RoutineWithExercises["exercises"][number]
  ): string => {
    const sets = re.target_sets;
    if (re.target_reps !== null && re.target_reps !== undefined) {
      return `${sets}x${re.target_reps}`;
    }
    if (
      re.target_duration_seconds !== null &&
      re.target_duration_seconds !== undefined
    ) {
      return `${sets}x${re.target_duration_seconds}s`;
    }
    return `${sets} ${t("sets")}`;
  };

  const displayExercises = routine.exercises.slice(0, 5);
  const remainingCount = exerciseCount - 5;

  return (
    <Card className="group">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base leading-tight">
          {routine.name}
        </CardTitle>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="default"
            size="sm"
            className="h-8"
            onClick={() => onStart(routine.id)}
          >
            <Play className="mr-1 h-3.5 w-3.5" />
            {t("start")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">{t("actions")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(routine)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(routine.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {t("exerciseCount", { count: exerciseCount })}
          </span>
          <span>
            {t("lastPerformed")}: {lastPerformed}
          </span>
        </div>

        {displayExercises.length > 0 && (
          <div className="space-y-1">
            {displayExercises.map((re) => (
              <div
                key={re.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate text-muted-foreground">
                  {re.exercise.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  {getTargetSummary(re)}
                </span>
              </div>
            ))}
            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground/70">
                +{remainingCount} {t("more")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
