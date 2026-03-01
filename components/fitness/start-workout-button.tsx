"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { log } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/fetcher";
import type { WorkoutWithExercises } from "@/lib/db/types";

/**
 * Start Workout button for the workouts landing page.
 * Disabled/hidden when an active workout already exists.
 */
export function StartWorkoutButton() {
  const t = useTranslations("workouts");
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  // Check if active workout exists (same SWR key as resume banner for dedup)
  const { data } = useSWR<{ workout: WorkoutWithExercises | null }>(
    "/api/workouts/active",
    fetcher,
    { dedupingInterval: 30000 }
  );

  const hasActiveWorkout = !!data?.workout;

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.status === 409) {
        // Active workout already exists
        router.push("/workouts/active");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to start workout");
      }

      router.push("/workouts/active");
    } catch (error) {
      log.error("Failed to start workout", error);
      toast.error(t("startError"));
    } finally {
      setIsStarting(false);
    }
  };

  if (hasActiveWorkout) return null;

  return (
    <Button onClick={handleStart} disabled={isStarting}>
      <Plus className="mr-2 h-4 w-4" />
      {isStarting ? t("startingWorkout") : t("startWorkout")}
    </Button>
  );
}
