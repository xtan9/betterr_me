"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useExercises } from "@/lib/hooks/use-exercises";
import { ExerciseCard } from "./exercise-card";
import { ExerciseFilterBar } from "./exercise-filter-bar";
import { ExerciseForm } from "./exercise-form";
import type { Exercise, MuscleGroup, Equipment } from "@/lib/db/types";

export function ExerciseLibrary() {
  const t = useTranslations("exercises");
  const { exercises, isLoading, mutate } = useExercises();

  // Filter state
  const [search, setSearch] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Delete confirmation state
  const [deletingExercise, setDeletingExercise] = useState<Exercise | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Client-side filtering (EXER-02: no server round-trips)
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
    const groups = new Map<MuscleGroup, Exercise[]>();
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

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingExercise) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/exercises/${deletingExercise.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete exercise");
      }

      toast.success(t("deleteSuccess"));
      mutate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete exercise";
      toast.error(message);
    } finally {
      setIsDeleting(false);
      setDeletingExercise(null);
    }
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingExercise(null);
    }
  };

  const handleSaved = () => {
    mutate();
    setEditingExercise(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-[180px]" />
          <Skeleton className="h-9 w-[180px]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button onClick={() => setIsFormOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {t("createCustom")}
        </Button>
      </div>

      <ExerciseFilterBar
        search={search}
        onSearchChange={setSearch}
        muscleGroup={muscleGroup}
        onMuscleGroupChange={setMuscleGroup}
        equipment={equipment}
        onEquipmentChange={setEquipment}
      />

      {filteredExercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Dumbbell className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="text-lg font-medium">{t("noResults")}</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("noResultsDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(groupedExercises.entries()).map(
            ([group, groupExercises]) => (
              <section key={group}>
                <h2 className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-wider">
                  {t(`muscleGroups.${group}`)} ({groupExercises.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groupExercises.map((exercise) => (
                    <ExerciseCard
                      key={exercise.id}
                      exercise={exercise}
                      onEdit={handleEdit}
                      onDelete={setDeletingExercise}
                    />
                  ))}
                </div>
              </section>
            )
          )}
        </div>
      )}

      <ExerciseForm
        open={isFormOpen}
        onOpenChange={handleFormClose}
        exercise={editingExercise ?? undefined}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={!!deletingExercise}
        onOpenChange={(open) => {
          if (!open) setDeletingExercise(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("deleteCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
