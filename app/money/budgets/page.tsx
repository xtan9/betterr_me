import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { BudgetOverview } from "@/components/money/budget-overview";

export default async function BudgetsPage() {
  const t = await getTranslations("money");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("budgets.title")} />
      <BudgetOverview />
    </div>
  );
}
