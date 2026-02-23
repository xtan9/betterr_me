import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { BillsPageContent } from "@/components/money/bills-page-content";

export default async function BillsPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("bills.title")} />
      <Suspense>
        <BillsPageContent />
      </Suspense>
    </div>
  );
}
