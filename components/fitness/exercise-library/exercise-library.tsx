"use client";

import { selectExercises } from "@/lib/fitness/exercise-selection";

import { useState, useMemo, useRef, useEffect } from "react";
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
import {
  prepareExerciseCommand,
  resolveExerciseRejection,
  sendExerciseCommand,
} from "@/lib/fitness/exercise-command-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ExerciseLibrary() {
  const t = useTranslations("exercises");
  const { exercises, error, isLoading, mutate, ownerId, canCreate, journal } =
    useExercises({ includeArchived: true });
  const ownerRef = useRef(ownerId);
  useEffect(() => {
    ownerRef.current = ownerId;
  }, [ownerId]);
  const [archiveScope, setArchiveScope] = useState("active");
  const [variation, setVariation] = useState<Exercise | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Delete confirmation state
  const [deletingExercise, setDeletingExercise] = useState<Exercise | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const { filteredExercises, groupedExercises } = useMemo(
    () =>
      selectExercises(
        exercises.filter((exercise) =>
          archiveScope === "archived"
            ? !!exercise.archived_at
            : !exercise.archived_at,
        ),
        { search, muscleGroup, equipment },
      ),
    [exercises, search, muscleGroup, equipment, archiveScope],
  );

  const handleEdit = (exercise: Exercise) => {
    setVariation(null);
    setEditingExercise(exercise);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingExercise || !ownerId || !deletingExercise.version) return;

    setIsDeleting(true);
    try {
      const request = prepareExerciseCommand(ownerId, {
        kind: deletingExercise.archived_at ? "restore" : "archive",
        exerciseId: deletingExercise.id,
        expectedVersion: deletingExercise.version,
      });
      await sendExerciseCommand(ownerId, request);
      if (ownerRef.current !== ownerId) return;
      toast.success(
        t(deletingExercise.archived_at ? "restoreSuccess" : "archiveSuccess"),
      );
      mutate();
    } catch (error) {
      void error;
      if (ownerRef.current === ownerId) toast.error(t("commandFailed"));
    } finally {
      setIsDeleting(false);
      setDeletingExercise(null);
    }
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingExercise(null);
      setVariation(null);
    }
  };

  const handleSaved = () => {
    mutate();
    setEditingExercise(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-section-gap">
        <div className="flex flex-col gap-field-gap sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-[180px]" />
          <Skeleton className="h-9 w-[180px]" />
        </div>
        <div className="grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
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
    <div className="flex flex-col gap-section-gap">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-page-title tracking-tight">{t("title")}</h1>
        <Button
          onClick={() => {
            setVariation(null);
            setEditingExercise(null);
            setIsFormOpen(true);
          }}
          size="sm"
          disabled={
            !canCreate ||
            !!(journal && ["pending", "rejected"].includes(journal.state))
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("createCustom")}
        </Button>
      </div>
      {!canCreate && (
        <p role="status" className="text-muted-foreground">
          {t("creationUnavailable")}
        </p>
      )}
      {journal && ["pending", "rejected"].includes(journal.state) && (
        <div role="status" className="space-y-2">
          <p>
            {t(
              journal.state === "pending" ? "pendingCommand" : "reviewConflict",
            )}
          </p>
          {journal.state === "pending" ? (
            <Button
              disabled={isRetrying}
              onClick={async () => {
                if (!ownerId) return;
                setIsRetrying(true);
                try {
                  await sendExerciseCommand(ownerId, journal.request);
                  if (ownerRef.current === ownerId) await mutate();
                } catch {
                  if (ownerRef.current === ownerId)
                    toast.error(t("commandFailed"));
                } finally {
                  setIsRetrying(false);
                }
              }}
            >
              {t("retryCommand")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (ownerId) resolveExerciseRejection(ownerId);
                  mutate();
                }}
              >
                {t("keepCurrent")}
              </Button>
              {journal.rejection?.current &&
              ["archive", "restore"].includes(
                String(journal.request.command.kind),
              ) ? (
                <>
                  <p>
                    {t("currentName", { name: journal.rejection.current.name })}
                  </p>
                  <Button
                    disabled={isRetrying}
                    onClick={async () => {
                      if (!ownerId || !journal.rejection?.current) return;
                      setIsRetrying(true);
                      try {
                        const request = resolveExerciseRejection(ownerId, {
                          ...journal.request.command,
                          expectedVersion: journal.rejection.current.version,
                        })!;
                        await sendExerciseCommand(ownerId, request);
                        if (ownerRef.current === ownerId) await mutate();
                      } catch {
                        if (ownerRef.current === ownerId)
                          toast.error(t("commandFailed"));
                      } finally {
                        setIsRetrying(false);
                      }
                    }}
                  >
                    {t("applyReviewed")}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    const target = exercises.find(
                      (exercise) =>
                        exercise.id === journal.request.command.exerciseId,
                    );
                    if (target) {
                      setEditingExercise(target);
                      setVariation(null);
                      setIsFormOpen(true);
                    } else if (journal.request.command.kind === "create") {
                      setEditingExercise(null);
                      setVariation(null);
                      setIsFormOpen(true);
                    }
                  }}
                >
                  {t("reviewProposal")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      <Tabs value={archiveScope} onValueChange={setArchiveScope}>
        <TabsList>
          <TabsTrigger value="active">{t("activeLibrary")}</TabsTrigger>
          <TabsTrigger value="archived">{t("archivedLibrary")}</TabsTrigger>
        </TabsList>
        <TabsContent value={archiveScope} className="space-y-4">
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
              <h3 className="text-section-heading font-medium">
                {t("noResults")}
              </h3>
              <p className="text-muted-foreground mt-1 text-body">
                {t("noResultsDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {Array.from(groupedExercises.entries()).map(
                ([group, groupExercises]) => (
                  <section key={group}>
                    <h2 className="text-muted-foreground mb-3 text-body font-semibold uppercase tracking-wider">
                      {t(`muscleGroups.${group}`)} ({groupExercises.length})
                    </h2>
                    <div className="grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
                      {groupExercises.map((exercise) => (
                        <ExerciseCard
                          key={exercise.id}
                          exercise={exercise}
                          onEdit={handleEdit}
                          onDelete={setDeletingExercise}
                          onCreateVariation={
                            canCreate
                              ? (exercise) => {
                                  setEditingExercise(null);
                                  setVariation(exercise);
                                  setIsFormOpen(true);
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </section>
                ),
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ExerciseForm
        key={`${ownerId}:${editingExercise?.id ?? variation?.id ?? "new"}:${variation ? "variation" : "edit"}`}
        open={
          isFormOpen &&
          (!editingExercise || editingExercise.user_id === ownerId) &&
          (!variation || variation.user_id === ownerId)
        }
        onOpenChange={handleFormClose}
        exercise={editingExercise ?? undefined}
        onSaved={handleSaved}
        ownerId={ownerId ?? undefined}
        canCreate={canCreate}
        variation={variation ?? undefined}
      />

      <AlertDialog
        open={!!deletingExercise && deletingExercise.user_id === ownerId}
        onOpenChange={(open) => {
          if (!open) setDeletingExercise(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                deletingExercise?.archived_at
                  ? "restoreExercise"
                  : "archiveExercise",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                deletingExercise?.archived_at
                  ? "restoreDescription"
                  : "archiveDescription",
              )}
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
              {t(
                deletingExercise?.archived_at
                  ? "restoreExercise"
                  : "archiveExercise",
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
