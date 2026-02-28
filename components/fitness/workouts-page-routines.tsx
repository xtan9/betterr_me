"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LayoutTemplate, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoutines } from "@/lib/hooks/use-routines";
import { RoutineCard } from "@/components/fitness/routines/routine-card";
import type { RoutineWithExercises } from "@/lib/db/types";

/**
 * Client component that renders the "My Routines" section on the workouts landing page.
 * Shows up to 3 routine cards with start buttons, or a prompt to create the first routine.
 */
export function WorkoutsPageRoutines() {
  const t = useTranslations("routines");
  const router = useRouter();
  const { routines, isLoading } = useRoutines();

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

  // No-op handlers for edit/delete since the full management page handles those
  const handleEdit = useCallback(
    (_routine: RoutineWithExercises) => {
      router.push("/workouts/routines");
    },
    [router]
  );

  const handleDelete = useCallback(
    (_id: string) => {
      router.push("/workouts/routines");
    },
    [router]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("myRoutines")}</h2>
        <Link
          href="/workouts/routines"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          {t("manageRoutines")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {routines.length === 0 ? (
        <Link
          href="/workouts/routines"
          className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        >
          <LayoutTemplate className="h-5 w-5 shrink-0" />
          <span>{t("createFirst")}</span>
        </Link>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routines.slice(0, 3).map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onStart={handleStart}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
