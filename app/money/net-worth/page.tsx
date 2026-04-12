import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { NetWorthPageContent } from "@/components/money/net-worth-page-content";

export default async function NetWorthPage() {
  const t = await getTranslations("money");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("netWorth.title")} />
      <NetWorthPageContent />
    </div>
  );
}
