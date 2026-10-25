"use client";

import { useEffect, useRef, useState } from "react";
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
  exerciseMetadataFormSchema,
  type ExerciseFormValues,
} from "@/lib/validations/exercise";
import {
  MUSCLE_GROUPS,
  EQUIPMENT,
  EXERCISE_TYPES,
} from "@/lib/constants/enums";
import type { Exercise } from "@/lib/db/types";
import {
  currentExerciseCommand,
  prepareExerciseCommand,
  resolveExerciseRejection,
  sendExerciseCommand,
  ExerciseCommandError,
} from "@/lib/fitness/exercise-command-client";
import { exerciseConvention } from "@/lib/validations/train-exercises";

interface ExerciseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise?: Exercise;
  onSaved: () => void;
  ownerId?: string;
  canCreate?: boolean;
  variation?: Exercise;
}

export function ExerciseForm({
  open,
  onOpenChange,
  exercise,
  onSaved,
  ownerId,
  canCreate = false,
  variation,
}: ExerciseFormProps) {
  const t = useTranslations("exercises");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!exercise;
  const owner = ownerId ?? exercise?.user_id;
  const journal = owner ? currentExerciseCommand(owner) : null;
  const matchesJournal =
    journal &&
    (isEditing
      ? journal.request.command.exerciseId === exercise.id
      : journal.request.command.kind === "create");
  const locked =
    isSubmitting || !!(matchesJournal && journal.state === "pending");
  const [failure, setFailure] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const source = exercise ?? variation;
  const preservedSecondary =
    !!exercise &&
    (exercise.muscle_groups_secondary == null ||
      exercise.muscle_groups_secondary.some(
        (value) => !MUSCLE_GROUPS.includes(value),
      ));
  const frozen = matchesJournal ? journal.request.command : undefined;
  const input = (
    frozen?.kind === "create" ? frozen.definition : frozen?.patch
  ) as Record<string, unknown> | undefined;

  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(
      isEditing ? exerciseMetadataFormSchema : exerciseFormSchema,
    ),
    defaultValues: {
      name: typeof input?.name === "string" ? input.name : (source?.name ?? ""),
      muscle_group_primary:
        typeof input?.primaryMuscle === "string" &&
        MUSCLE_GROUPS.includes(
          input.primaryMuscle as Exercise["muscle_group_primary"],
        )
          ? (input.primaryMuscle as Exercise["muscle_group_primary"])
          : (source?.muscle_group_primary ?? "other"),
      muscle_groups_secondary: Array.isArray(input?.secondaryMuscles)
        ? input.secondaryMuscles.filter(
            (value): value is Exercise["muscle_group_primary"] =>
              MUSCLE_GROUPS.includes(value),
          )
        : (source?.muscle_groups_secondary?.filter((value) =>
            MUSCLE_GROUPS.includes(value),
          ) ?? []),
      equipment:
        typeof input?.equipment === "string" &&
        EQUIPMENT.includes(input.equipment as Exercise["equipment"])
          ? (input.equipment as Exercise["equipment"])
          : (source?.equipment ?? "barbell"),
      exercise_type:
        typeof input?.mode === "string" &&
        EXERCISE_TYPES.includes(input.mode as Exercise["exercise_type"])
          ? (input.mode as Exercise["exercise_type"])
          : (source?.exercise_type ?? "weight_reps"),
    },
  });
  const { dirtyFields } = form.formState;
  const convention = isEditing
    ? (exercise.measurement_convention ?? null)
    : exerciseConvention(form.watch("equipment"), form.watch("exercise_type"));

  const handleSubmit = async (data: ExerciseFormValues) => {
    setIsSubmitting(true);
    setFailure(null);
    try {
      if (!owner) throw new Error("unauthenticated");
      if (matchesJournal && journal.state === "pending") {
        await sendExerciseCommand(owner, journal.request);
        if (alive.current) {
          onOpenChange(false);
          onSaved();
        }
        return;
      }
      const patch: Record<string, unknown> = {};
      if (isEditing) {
        const reviewing =
          matchesJournal && journal.state === "rejected" && input;
        if (dirtyFields.name || (reviewing && Object.hasOwn(input, "name"))) {
          const name = exerciseFormSchema.shape.name.safeParse(data.name);
          if (!name.success) {
            form.setError("name", { message: name.error.issues[0].message });
            return;
          }
          if (name.data !== exercise.name || reviewing) patch.name = name.data;
        }
        if (
          data.muscle_group_primary !== exercise.muscle_group_primary ||
          (reviewing && Object.hasOwn(input, "primaryMuscle"))
        )
          patch.primaryMuscle = data.muscle_group_primary;
        // Untouched secondary labels, including legacy null/unknown values, stay
        // out of the patch. Editing one visible field never fills historical data.
        if (
          dirtyFields.muscle_groups_secondary ||
          (reviewing && Object.hasOwn(input, "secondaryMuscles"))
        )
          patch.secondaryMuscles = data.muscle_groups_secondary;
        if (!exercise.version) throw new Error("refresh_required");
        if (Object.keys(patch).length === 0) {
          onOpenChange(false);
          return;
        }
      } else if (!canCreate) throw new Error("not_ready");
      const command = isEditing
        ? {
            kind: "update-metadata",
            exerciseId: exercise.id,
            expectedVersion:
              matchesJournal &&
              journal.state === "rejected" &&
              journal.rejection?.current
                ? journal.rejection.current.version
                : exercise.version,
            patch,
          }
        : {
            kind: "create",
            definition: {
              name: data.name,
              equipment: data.equipment,
              mode: data.exercise_type,
              convention: exerciseConvention(
                data.equipment,
                data.exercise_type,
              ),
              primaryMuscle: data.muscle_group_primary,
              secondaryMuscles: data.muscle_groups_secondary,
            },
          };
      const request =
        matchesJournal && journal.state === "rejected"
          ? resolveExerciseRejection(owner, command)!
          : prepareExerciseCommand(owner, command);
      await sendExerciseCommand(owner, request);
      if (!alive.current) return;
      toast.success(isEditing ? t("saveSuccess") : t("createSuccess"));
      onOpenChange(false);
      onSaved();
    } catch (error) {
      if (!alive.current) return;
      const code =
        error instanceof ExerciseCommandError ? error.code : "unavailable";
      setFailure(code);
      toast.error(t("commandFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t("editExercise")
              : variation
                ? t("createVariation")
                : t("createCustom")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {variation && (
              <p className="text-body text-muted-foreground">
                {t("variationDescription")}
              </p>
            )}
            {!isEditing && !canCreate && (
              <p role="status">{t("creationUnavailable")}</p>
            )}
            {matchesJournal && journal.state === "pending" && (
              <p role="status">{t("pendingCommand")}</p>
            )}
            {matchesJournal && journal.state === "rejected" && (
              <div role="alert" className="space-y-2">
                <p>{t("reviewConflict")}</p>
                {journal.rejection?.current && (
                  <p>
                    {t("currentName", { name: journal.rejection.current.name })}
                  </p>
                )}
                <p>{t("proposalName", { name: form.getValues("name") })}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (owner) resolveExerciseRejection(owner);
                    onOpenChange(false);
                    onSaved();
                  }}
                >
                  {t("keepCurrent")}
                </Button>
              </div>
            )}
            {failure && !(matchesJournal && journal.state === "rejected") && (
              <p role="alert">{t("commandFailed")}</p>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("namePlaceholder")}
                      disabled={locked}
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
                    disabled={locked}
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
                      (mg) => mg !== form.watch("muscle_group_primary"),
                    ).map((mg) => (
                      <label
                        key={mg}
                        className="flex items-center gap-2 text-body"
                      >
                        <Checkbox
                          checked={field.value?.includes(mg) ?? false}
                          onCheckedChange={(checked) => {
                            const current = field.value ?? [];
                            if (checked) {
                              field.onChange([...current, mg]);
                            } else {
                              field.onChange(current.filter((v) => v !== mg));
                            }
                          }}
                          disabled={locked || preservedSecondary}
                        />
                        {t(`muscleGroups.${mg}`)}
                      </label>
                    ))}
                  </div>
                  {preservedSecondary && (
                    <p className="text-caption">
                      {t("preservedMetadata")}:{" "}
                      {exercise.muscle_groups_secondary?.join(", ") ??
                        t("unknownMeaning")}
                    </p>
                  )}
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
                    disabled={locked || isEditing}
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
                    disabled={locked || isEditing}
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
            <p className="text-body">
              {t("recordingConvention", {
                convention: convention
                  ? t(`conventions.${convention}`)
                  : t("unknownMeaning"),
              })}
            </p>
            {isEditing && (
              <p className="text-caption text-muted-foreground">
                {t("meaningPreserved")}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {matchesJournal && journal.state === "pending"
                  ? t("close")
                  : t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  (!isEditing &&
                    !canCreate &&
                    !(matchesJournal && journal.state === "pending"))
                }
              >
                {isSubmitting
                  ? isEditing
                    ? t("saving")
                    : t("creating")
                  : matchesJournal && journal.state === "pending"
                    ? t("retryCommand")
                    : matchesJournal && journal.state === "rejected"
                      ? t("applyReviewed")
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
