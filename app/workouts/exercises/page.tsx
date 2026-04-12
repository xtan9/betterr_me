import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { ExerciseLibrary } from "@/components/fitness/exercise-library/exercise-library";

export default async function ExercisesPage() {
  const t = await getTranslations("exercises");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("title")} />
      <ExerciseLibrary />
    </div>
  );
}
