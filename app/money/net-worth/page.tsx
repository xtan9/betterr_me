import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { NetWorthPageContent } from "@/components/money/net-worth-page-content";

export default async function NetWorthPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("netWorth.title")} />
      <NetWorthPageContent />
    </div>
  );
}
