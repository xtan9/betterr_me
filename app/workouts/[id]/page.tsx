import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { PageHeader } from "@/components/layouts/page-header";
import { WorkoutDetailView } from "@/components/fitness/workout-history/workout-detail-view";
import type { WeightUnit } from "@/lib/db/types";
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
  const workout = await workoutsDB.getWorkoutWithExercises(id);

  if (!workout) {
    notFound();
  }

  // Only show detail for completed workouts; active ones should use /workouts/active
  if (workout.status !== "completed") {
    redirect("/workouts/active");
  }

  // Get weight unit from user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();

  const weightUnit: WeightUnit =
    (profile?.preferences as { weight_unit?: string } | null)?.weight_unit === "lbs"
      ? "lbs"
      : "kg";

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
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
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
