import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { ExerciseLibrary } from "@/components/fitness/exercise-library/exercise-library";

export default async function ExercisesPage() {
  const t = await getTranslations("exercises");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <ExerciseLibrary />
    </div>
  );
}
