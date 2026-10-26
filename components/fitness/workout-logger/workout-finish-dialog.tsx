"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LayoutTemplate, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkoutWithExercises, WeightUnit } from "@/lib/db/types";
import { formatWeight } from "@/lib/fitness/units";
import { currentTemplateCommand, prepareTemplateCommand, sendTemplateCommand } from "@/lib/fitness/template-command-client";
import { useTemplateAccess, useTemplateJournal } from "../routines/use-template-library";

interface WorkoutFinishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutWithExercises;
  /** Duration in seconds, computed by the parent when opening the dialog */
  durationSeconds: number;
  /** User's preferred weight unit for volume display */
  weightUnit: WeightUnit;
  onConfirm: () => void;
}

/**
 * Format a duration in seconds to a human-readable string (e.g., "1h 23m" or "45m").
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function WorkoutFinishDialog(props: WorkoutFinishDialogProps) {
  const access = useTemplateAccess();
  return <WorkoutFinishContent key={`${access.ownerId}:${props.workout.id}`} {...props} access={access} />;
}

function WorkoutFinishContent({
  open,
  onOpenChange,
  workout,
  durationSeconds,
  weightUnit,
  onConfirm,
  access,
}: WorkoutFinishDialogProps & { access: ReturnType<typeof useTemplateAccess> }) {
  const t = useTranslations("workouts");
  const tRoutines = useTranslations("routines");
  const tt = useTranslations("routines.templates"), { journal, error: journalFailed } = useTemplateJournal(access.ownerId);
  const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const matchingRequest = journal?.request.command.kind === "save-workout-as-template" && journal.request.command.workoutId === workout.id ? journal : null;
  const pendingName = matchingRequest?.state === "pending" && typeof matchingRequest.request.command.name === "string" ? matchingRequest.request.command.name : null;

  // Save as routine state
  const [showSaveRoutine, setShowSaveRoutine] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [saving, setSaving] = useState(false);
  const [routineSaved, setRoutineSaved] = useState(false);

  const stats = useMemo(() => {
    const exerciseCount = workout.exercises.length;
    let completedSets = 0;
    let totalVolume = 0;

    for (const we of workout.exercises) {
      for (const set of we.sets) {
        if (set.is_completed) {
          completedSets++;
          if (set.weight_kg != null && set.reps != null) {
            totalVolume += set.weight_kg * set.reps;
          }
        }
      }
    }

    return {
      exerciseCount,
      completedSets,
      totalVolume: Math.round(totalVolume * 100) / 100,
    };
  }, [workout]);

  const hasExercises = workout.exercises.length > 0;

  const handleSaveAsRoutine = async () => {
    const owner = access.ownerId, name = (pendingName ?? routineName).trim();
    if (!name || sending.current || access.error || journalFailed || access.ready === undefined || !owner || owner !== workout.user_id) return;

    sending.current = true;
    setSaving(true);
    try {
      const pending = currentTemplateCommand(owner);
      if (access.ready) {
        if (pending && (pending.state !== "pending" || pending.request.command.kind !== "save-workout-as-template" || pending.request.command.workoutId !== workout.id)) throw new Error("pending_command");
        const request = pending?.request ?? prepareTemplateCommand(owner, { kind: "save-workout-as-template", workoutId: workout.id, name });
        await sendTemplateCommand(owner, request);
      } else {
        if (pending) throw new Error("pending_command");
        const res = await fetch(
        `/api/workouts/${workout.id}/save-as-routine`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to save as routine");
        }
      }

      if (!alive.current) return;
      toast.success(tRoutines("saveAsRoutineSuccess"));
      setRoutineSaved(true);
      setShowSaveRoutine(false);
    } catch (error) {
      void error;
      if (alive.current) toast.error(tRoutines("saveAsRoutineError"));
    } finally {
      sending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setShowSaveRoutine(false);
      setRoutineName("");
      setSaving(false);
      setRoutineSaved(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("finishWorkoutTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("finishWorkoutDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="rounded-card border p-3 text-center">
            <p className="text-muted-foreground text-caption">{t("workoutDuration")}</p>
            <p className="text-lg font-semibold">
              {formatDuration(durationSeconds)}
            </p>
          </div>
          <div className="rounded-card border p-3 text-center">
            <p className="text-muted-foreground text-caption">{t("workoutExercises")}</p>
            <p className="text-lg font-semibold">{stats.exerciseCount}</p>
          </div>
          <div className="rounded-card border p-3 text-center">
            <p className="text-muted-foreground text-caption">{t("workoutSets")}</p>
            <p className="text-lg font-semibold">{stats.completedSets}</p>
          </div>
          <div className="rounded-card border p-3 text-center">
            <p className="text-muted-foreground text-caption">{t("workoutVolume")}</p>
            <p className="text-lg font-semibold">
              {stats.totalVolume > 0
                ? formatWeight(stats.totalVolume, weightUnit)
                : "-"}
            </p>
          </div>
        </div>

        {/* Save as Routine section */}
        {hasExercises && !routineSaved && access.ownerId === workout.user_id && access.ready !== undefined && !access.error && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground hover:text-foreground"
              onClick={() => {
                setShowSaveRoutine(!showSaveRoutine);
                if (!routineName && workout.title) {
                  setRoutineName(workout.title);
                }
              }}
            >
              <span className="flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4" />
                {tRoutines("saveAsRoutine")}
              </span>
              {showSaveRoutine ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {(showSaveRoutine || pendingName !== null) && <div className="mt-2 space-y-2"><p className="text-sm text-muted-foreground">{tt("saveAsDisclosure")}</p>
              {(journalFailed || journal) && <p role="status">{tt(journalFailed ? "unavailable" : journal?.state === "pending" ? "pending" : "conflict")}</p>}
              {journal && (journal.state !== "pending" || !matchingRequest) && <Link href="/workouts/routines" className="underline">{tRoutines("manageRoutines")}</Link>}
              <div className="flex gap-2">
                <Input
                  placeholder={tRoutines("saveAsRoutinePlaceholder")}
                  value={pendingName ?? routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && routineName.trim()) {
                      handleSaveAsRoutine();
                    }
                  }}
                  disabled={saving || !!journal || journalFailed}
                />
                <Button
                  size="sm"
                  disabled={saving || !(pendingName ?? routineName).trim() || journalFailed || !!journal && (!matchingRequest || journal.state !== "pending" || !access.ready)}
                  onClick={handleSaveAsRoutine}
                  className="shrink-0"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    pendingName !== null ? tt("retry") : tRoutines("save")
                  )}
                </Button>
              </div></div>}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t("finishCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("finishConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
