import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { ProfilesDB } from "@/lib/db/profiles";
import { log } from "@/lib/logger";
import { PageHeader } from "@/components/layouts/page-header";
import { WorkoutDetailView } from "@/components/fitness/workout-history/workout-detail-view";
import { DEFAULT_WEIGHT_UNIT_PREFERENCE } from "@/lib/preferences/owners";
import type { WeightUnitPreference } from "@/lib/preferences/types";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface WorkoutDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkoutDetailPage({
  params,
}: WorkoutDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const workoutsDB = new WorkoutsDB(supabase);

  let workout;
  try {
    workout = await workoutsDB.getWorkoutWithExercises(id);
  } catch (error) {
    log.error("Failed to fetch workout detail", { workoutId: id, error });
    notFound();
  }

  if (!workout) {
    notFound();
  }

  // Only show detail for completed workouts; active ones should use /workouts/active
  if (workout.status !== "completed") {
    redirect("/workouts/active");
  }

  const profilesDB = new ProfilesDB(supabase);
  // Canonical kilograms are the explicit degraded presentation when Fitness
  // storage is unavailable or contains no accepted unit.
  let weightUnit: WeightUnitPreference = DEFAULT_WEIGHT_UNIT_PREFERENCE;
  try {
    weightUnit =
      (await profilesDB.getFitnessWeightUnitPreference(user.id)) ??
      DEFAULT_WEIGHT_UNIT_PREFERENCE;
  } catch (error) {
    log.error("Failed to read Fitness Weight Unit Preference", error);
  }

  const t = await getTranslations("workouts");

  const formattedDate = new Date(workout.started_at).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  return (
    <div className="flex flex-col gap-section-gap">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-body text-muted-foreground">
        <Link href="/workouts" className="hover:text-foreground transition-colors">
          {t("title")}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground truncate">{workout.title}</span>
      </nav>

      <PageHeader
        title={workout.title}
        subtitle={t("completedOn", { date: formattedDate })}
      />

      <WorkoutDetailView workout={workout} weightUnit={weightUnit} />
    </div>
  );
}
