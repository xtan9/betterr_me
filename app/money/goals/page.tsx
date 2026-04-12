import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { GoalGrid } from "@/components/money/goal-grid";

export default async function GoalsPage() {
  const t = await getTranslations("money");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("goals.title")} />
      <GoalGrid />
    </div>
  );
}
