import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library } from "lucide-react";
import { WorkoutResumeBanner } from "@/components/fitness/workout-resume-banner";
import { StartWorkoutButton } from "@/components/fitness/start-workout-button";
import { WorkoutsPageRoutines } from "@/components/fitness/workouts-page-routines";
import { WorkoutHistoryList } from "@/components/fitness/workout-history/workout-history-list";

export default async function WorkoutsPage() {
  const t = await getTranslations("workouts");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        actions={<StartWorkoutButton />}
      />

      <WorkoutResumeBanner />

      <WorkoutsPageRoutines />

      <WorkoutHistoryList />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Library className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t("exerciseLibrary")}</CardTitle>
              <CardDescription>
                {t("exerciseLibraryDescription")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/workouts/exercises">{t("browse")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
