"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  exerciseFormSchema,
  type ExerciseFormValues,
} from "@/lib/validations/exercise";
import { MUSCLE_GROUPS, EQUIPMENT, EXERCISE_TYPES } from "@/lib/constants/enums";
import type { Exercise } from "@/lib/db/types";

interface ExerciseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise?: Exercise;
  onSaved: () => void;
}

export function ExerciseForm({
  open,
  onOpenChange,
  exercise,
  onSaved,
}: ExerciseFormProps) {
  const t = useTranslations("exercises");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!exercise;

  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      name: exercise?.name ?? "",
      muscle_group_primary: exercise?.muscle_group_primary ?? "chest",
      muscle_groups_secondary: exercise?.muscle_groups_secondary ?? [],
      equipment: exercise?.equipment ?? "barbell",
      exercise_type: exercise?.exercise_type ?? "weight_reps",
    },
  });

  const handleSubmit = async (data: ExerciseFormValues) => {
    setIsSubmitting(true);
    try {
      const url = isEditing
        ? `/api/exercises/${exercise.id}`
        : "/api/exercises";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save exercise");
      }

      toast.success(isEditing ? t("saveSuccess") : t("createSuccess"));
      onOpenChange(false);
      onSaved();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save exercise";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("editExercise") : t("createCustom")}
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
              name="muscle_group_primary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("muscleGroup")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MUSCLE_GROUPS.map((mg) => (
                        <SelectItem key={mg} value={mg}>
                          {t(`muscleGroups.${mg}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="muscle_groups_secondary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("secondaryMuscles")}</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {MUSCLE_GROUPS.filter(
                      (mg) => mg !== form.watch("muscle_group_primary")
                    ).map((mg) => (
                      <label
                        key={mg}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={field.value?.includes(mg) ?? false}
                          onCheckedChange={(checked) => {
                            const current = field.value ?? [];
                            if (checked) {
                              field.onChange([...current, mg]);
                            } else {
                              field.onChange(
                                current.filter((v) => v !== mg)
                              );
                            }
                          }}
                          disabled={isSubmitting}
                        />
                        {t(`muscleGroups.${mg}`)}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="equipment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("equipment")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EQUIPMENT.map((eq) => (
                        <SelectItem key={eq} value={eq}>
                          {t(`equipmentTypes.${eq}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="exercise_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("exerciseType")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EXERCISE_TYPES.map((et) => (
                        <SelectItem key={et} value={et}>
                          {t(`exerciseTypes.${et}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {t("cancel")}
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
  );
}
