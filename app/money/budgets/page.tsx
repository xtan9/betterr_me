import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { BudgetOverview } from "@/components/money/budget-overview";

export default async function BudgetsPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("budgets.title")} />
      <BudgetOverview />
    </div>
  );
}
