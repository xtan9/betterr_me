import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { NetWorthChart } from "@/components/money/net-worth-chart";
import { NetWorthSummary } from "@/components/money/net-worth-summary";
import { NetWorthAccounts } from "@/components/money/net-worth-accounts";

export default async function NetWorthPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("netWorth.title")} />
      <NetWorthChart />
      <NetWorthSummary />
      <NetWorthAccounts />
    </div>
  );
}
