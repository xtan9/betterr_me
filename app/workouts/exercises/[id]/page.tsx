import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ExercisesDB } from "@/lib/db/exercises";
import { PageHeader } from "@/components/layouts/page-header";
import { ExerciseDetailContent } from "@/components/fitness/exercise-detail/exercise-detail-content";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("exercises");

  const supabase = await createClient();
  const exercisesDB = new ExercisesDB(supabase);
  const exercise = await exercisesDB.getExercise(id);

  if (!exercise) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exercise.name}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/workouts/exercises">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("exerciseDetail.backToExercises")}
            </Link>
          </Button>
        }
      />
      <ExerciseDetailContent exercise={exercise} />
    </div>
  );
}
