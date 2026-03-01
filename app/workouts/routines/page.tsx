import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { RoutinesPageContent } from "@/components/fitness/routines/routines-page-content";

export default async function RoutinesPage() {
  const t = await getTranslations("routines");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <RoutinesPageContent />
    </div>
  );
}
