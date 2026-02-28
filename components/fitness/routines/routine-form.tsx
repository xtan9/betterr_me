"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { WorkoutAddExercise } from "@/components/fitness/workout-logger/workout-add-exercise";
import { RoutineExerciseList } from "./routine-exercise-list";
import { useRoutines } from "@/lib/hooks/use-routines";
import { useWeightUnit } from "@/lib/hooks/use-active-workout";
import {
  routineCreateSchema,
  type RoutineCreateValues,
} from "@/lib/validations/routine";
import type { RoutineWithExercises } from "@/lib/db/types";

interface RoutineFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routine?: RoutineWithExercises | null;
  onSaved: () => void;
}

export function RoutineForm({
  open,
  onOpenChange,
  routine,
  onSaved,
}: RoutineFormProps) {
  const t = useTranslations("routines");
  const { mutate } = useRoutines();
  const weightUnit = useWeightUnit();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false);
  const isEditing = !!routine;

  const form = useForm<RoutineCreateValues>({
    resolver: zodResolver(routineCreateSchema),
    defaultValues: {
      name: routine?.name ?? "",
      notes: routine?.notes ?? "",
    },
  });

  // Handle adding an exercise to the routine (edit mode only)
  const handleAddExercise = useCallback(
    async (exerciseId: string) => {
      if (!routine) return;

      try {
        const res = await fetch(`/api/routines/${routine.id}/exercises`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exercise_id: exerciseId }),
        });

        if (!res.ok) {
          throw new Error("Failed to add exercise");
        }

        toast.success(t("exerciseAdded"));
        mutate();
      } catch {
        toast.error(t("addExerciseError"));
      }
    },
    [routine, mutate, t]
  );

  // Handle updating a routine exercise's targets
  const handleUpdateExercise = useCallback(
    async (reId: string, updates: Record<string, unknown>) => {
      if (!routine) return;

      try {
        const res = await fetch(
          `/api/routines/${routine.id}/exercises/${reId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );

        if (!res.ok) {
          throw new Error("Failed to update exercise");
        }

        mutate();
      } catch {
        toast.error(t("updateExerciseError"));
      }
    },
    [routine, mutate, t]
  );

  // Handle removing an exercise from the routine
  const handleRemoveExercise = useCallback(
    async (reId: string) => {
      if (!routine) return;

      try {
        const res = await fetch(
          `/api/routines/${routine.id}/exercises/${reId}`,
          { method: "DELETE" }
        );

        if (!res.ok) {
          throw new Error("Failed to remove exercise");
        }

        toast.success(t("exerciseRemoved"));
        mutate();
      } catch {
        toast.error(t("removeExerciseError"));
      }
    },
    [routine, mutate, t]
  );

  const handleSubmit = async (data: RoutineCreateValues) => {
    setIsSubmitting(true);
    try {
      const url = isEditing
        ? `/api/routines/${routine.id}`
        : "/api/routines";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save routine");
      }

      toast.success(isEditing ? t("updateSuccess") : t("createSuccess"));
      onOpenChange(false);
      onSaved();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save routine";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get exercise IDs already in the routine for the picker's "added" badges
  const routineExerciseIds = routine?.exercises.map((re) => re.exercise_id) ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t("editRoutine") : t("createRoutine")}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("namePlaceholder")}
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("notes")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("notesPlaceholder")}
                        disabled={isSubmitting}
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Exercise management section - only in edit mode */}
              {isEditing && routine && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">
                        {t("exercises")}
                      </h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsExercisePickerOpen(true)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t("addExercise")}
                      </Button>
                    </div>

                    <RoutineExerciseList
                      exercises={routine.exercises}
                      onUpdate={handleUpdateExercise}
                      onRemove={handleRemoveExercise}
                      weightUnit={weightUnit}
                    />
                  </div>
                </>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  {t("deleteCancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? isEditing
                      ? t("saving")
                      : t("creating")
                    : isEditing
                      ? t("save")
                      : t("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Exercise picker sheet (reuse workout add exercise component) */}
      {isEditing && (
        <WorkoutAddExercise
          open={isExercisePickerOpen}
          onOpenChange={setIsExercisePickerOpen}
          onSelectExercise={handleAddExercise}
          workoutExerciseIds={routineExerciseIds}
        />
      )}
    </>
  );
}
