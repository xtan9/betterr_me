import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { RoutinesPageContent } from "@/components/fitness/routines/routines-page-content";

export default async function RoutinesPage() {
  const t = await getTranslations("routines");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("title")} />
      <RoutinesPageContent />
    </div>
  );
}
