"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, LayoutTemplate } from "lucide-react";
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
import { useRoutines } from "@/lib/hooks/use-routines";
import { RoutineCard } from "./routine-card";
import { RoutineForm } from "./routine-form";
import type { RoutineWithExercises } from "@/lib/db/types";

export function RoutinesPageContent() {
  const t = useTranslations("routines");
  const router = useRouter();
  const { routines, error, isLoading, mutate } = useRoutines();

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] =
    useState<RoutineWithExercises | null>(null);

  // Delete confirmation state
  const [deletingRoutineId, setDeletingRoutineId] = useState<string | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Start from routine
  const handleStart = useCallback(
    async (routineId: string) => {
      try {
        const res = await fetch(`/api/routines/${routineId}/start`, {
          method: "POST",
        });

        if (res.status === 409) {
          toast.error(t("activeWorkoutExists"));
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to start workout");
        }

        router.push("/workouts/active");
      } catch {
        toast.error(t("startError"));
      }
    },
    [router, t]
  );

  // Edit routine
  const handleEdit = useCallback((routine: RoutineWithExercises) => {
    setEditingRoutine(routine);
    setIsFormOpen(true);
  }, []);

  // Delete routine
  const handleDelete = useCallback(async () => {
    if (!deletingRoutineId) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/routines/${deletingRoutineId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete routine");
      }

      toast.success(t("deleteSuccess"));
      mutate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete routine";
      toast.error(message);
    } finally {
      setIsDeleting(false);
      setDeletingRoutineId(null);
    }
  }, [deletingRoutineId, mutate, t]);

  // Form close
  const handleFormClose = useCallback(
    (open: boolean) => {
      setIsFormOpen(open);
      if (!open) {
        setEditingRoutine(null);
      }
    },
    []
  );

  // Form saved
  const handleSaved = useCallback(() => {
    mutate();
    setEditingRoutine(null);
  }, [mutate]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t("loadError")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("createRoutine")}
        </Button>
      </div>

      {routines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutTemplate className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onStart={handleStart}
              onEdit={handleEdit}
              onDelete={setDeletingRoutineId}
            />
          ))}
        </div>
      )}

      {/* Create/Edit form dialog */}
      <RoutineForm
        open={isFormOpen}
        onOpenChange={handleFormClose}
        routine={editingRoutine}
        onSaved={handleSaved}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deletingRoutineId}
        onOpenChange={(open) => {
          if (!open) setDeletingRoutineId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteRoutineTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteRoutineDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("deleteCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
