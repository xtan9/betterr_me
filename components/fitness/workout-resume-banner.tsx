"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { log } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/fetcher";
import { WorkoutDiscardDialog } from "@/components/fitness/workout-logger/workout-discard-dialog";
import type { WorkoutWithExercises } from "@/lib/db/types";

/**
 * Compute a human-readable elapsed time string from a start timestamp.
 */
function computeElapsedDisplay(startedAt: string, now: number): string {
  const startMs = new Date(startedAt).getTime();
  const elapsedMinutes = Math.floor((now - startMs) / 60000);
  if (elapsedMinutes >= 60) {
    return `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`;
  }
  return `${elapsedMinutes}m`;
}

/**
 * Banner displayed on the workouts landing page when an active workout exists.
 * Non-blocking: rendered inline, not as a modal.
 * Shows workout title, elapsed time, with Resume and Discard actions.
 */
export function WorkoutResumeBanner() {
  const t = useTranslations("workouts");
  const router = useRouter();
  const [showDiscard, setShowDiscard] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // Snapshot time once on data arrival to avoid impure Date.now() in render
  const snapshotRef = useRef<{ workoutId: string; elapsed: string } | null>(null);

  const { data, error, mutate } = useSWR<{ workout: WorkoutWithExercises | null }>(
    "/api/workouts/active",
    fetcher,
    { dedupingInterval: 30000 }
  );

  const workout = data?.workout;

  // Banner is non-critical — log and hide on error
  if (error) {
    log.error("Failed to check active workout", error);
    return null;
  }

  // Update snapshot when workout data changes
  useEffect(() => {
    if (workout && snapshotRef.current?.workoutId !== workout.id) {
      snapshotRef.current = {
        workoutId: workout.id,
        elapsed: computeElapsedDisplay(workout.started_at, Date.now()),
      };
    }
  }, [workout]);

  if (!workout) return null;

  const handleDiscard = async () => {
    setIsDiscarding(true);
    try {
      const res = await fetch(`/api/workouts/${workout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "discarded" }),
      });
      if (!res.ok) {
        throw new Error("Failed to discard workout");
      }
      snapshotRef.current = null;
      mutate({ workout: null }, false);
      setShowDiscard(false);
    } catch (error) {
      log.error("Failed to discard workout", error);
      toast.error(t("discardError"));
    } finally {
      setIsDiscarding(false);
    }
  };

  const elapsedDisplay = snapshotRef.current?.elapsed ?? "";

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Dumbbell className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("resumeBannerTitle")}</p>
          <p className="text-muted-foreground text-xs truncate">
            {workout.title} &middot; {elapsedDisplay}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDiscard(true)}
            className="text-destructive hover:text-destructive"
            disabled={isDiscarding}
          >
            {t("resumeBannerDiscard")}
          </Button>
          <Button size="sm" onClick={() => router.push("/workouts/active")}>
            {t("resumeBannerResume")}
          </Button>
        </div>
      </div>

      <WorkoutDiscardDialog
        open={showDiscard}
        onOpenChange={setShowDiscard}
        onConfirm={handleDiscard}
      />
    </>
  );
}
